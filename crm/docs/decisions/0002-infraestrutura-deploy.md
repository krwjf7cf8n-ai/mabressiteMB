# ADR 0002 — Infraestrutura, deploy e operação (Sprint 7)

**Status:** aceito

## Contexto

O ADR 0001 fixou um orçamento-alvo de até R$ 300/mês (fora custos variáveis) e
uma stack pensada para equipe pequena (2 usuários iniciais: Matheus e Brenda).
O Sprint 7 pede um ambiente profissional de staging e produção — sem alterar
regras de negócio, autenticação, autorização, UX ou arquitetura de domínio —
cobrindo hospedagem, deploy reproduzível, backups, monitoramento e
documentação operacional.

Não há, na infraestrutura da Mabres, contas de nuvem gerenciada, VPS
contratado, domínio configurado ou conta de observabilidade (Sentry) até o
momento deste ADR. Este documento define a arquitetura para quando essa
infraestrutura for provisionada, e implementa toda a estrutura possível sem
depender de credenciais reais.

## Decisão

### Topologia de hospedagem

Um único VPS Linux (Ubuntu 22.04/24.04 LTS ou Debian 12), executando **Docker
Compose** como orquestrador, hospeda dois ambientes isolados como *stacks*
Compose independentes (projetos Compose distintos, redes e volumes próprios,
sem compartilhar containers):

- **staging** — `docker compose -p mabres-staging`, subdomínio próprio (ex.:
  `staging.crm.mabres.example`), seed de dados permitido.
- **produção** — `docker compose -p mabres-production`, domínio de produção
  (ex.: `crm.mabres.example`), seed **nunca** executado automaticamente.

Um VPS único com dois stacks isolados é o ponto de partida mais barato e
suficiente para o volume atual (2 usuários). Se o uso crescer a ponto de
justificar isolamento físico entre staging e produção, a migração para dois
VPS é direta: cada stack Compose já é autocontido (seu próprio Postgres,
Redis, rede) e não depende do outro.

### Componentes por stack

| Serviço    | Imagem/base                          | Papel |
|------------|---------------------------------------|-------|
| `caddy`    | `caddy:2-alpine`                      | Reverse proxy + TLS automático (HTTP-01/ACME via Let's Encrypt) |
| `web`      | build própria (`apps/web/Dockerfile`) | Next.js (App Router), `next start` em modo standalone |
| `worker`   | build própria (`apps/worker/Dockerfile`) | Processamento assíncrono (BullMQ) |
| `migrate`  | mesma imagem de `web`/`db`            | Job one-shot: `prisma migrate deploy` antes do start dos demais serviços |
| `postgres` | `postgres:16-alpine`                  | Banco relacional, volume nomeado persistente |
| `redis`    | `redis:7-alpine`                      | Filas (BullMQ) e rate limiting de login |

### Reverse proxy e TLS

**Caddy** foi escolhido em vez de Nginx + Certbot: emissão e renovação de
certificados TLS automáticas (sem cron/hooks adicionais), configuração
declarativa mínima (`Caddyfile` de poucas linhas), e é o que melhor atende ao
orçamento/operação enxuta da equipe. Nginx + Certbot é uma alternativa válida
e documentada como fallback caso a Mabres já opere Nginx em outro contexto,
mas não é a escolha padrão deste ADR.

### Migrations e seed

- `migrate` roda `prisma migrate deploy` (nunca `migrate dev`, que pode ser
  destrutivo) e finaliza antes de `web`/`worker` subirem
  (`depends_on: condition: service_completed_successfully`).
- Seed (`pnpm db:seed`) **não** faz parte do `docker compose up` automático em
  nenhum ambiente. Em staging, é um passo manual documentado
  (`infra/scripts/deploy.sh --seed`, com confirmação explícita); em produção,
  não há caminho automatizado — apenas o procedimento manual documentado em
  `docs/ops/deploy.md`, para reduzir o risco de rodar seed contra dados reais.

### Timezone, encoding e locale

- Containers de aplicação (`web`, `worker`, `migrate`) e o container
  `postgres` rodam com `TZ=UTC` explícito. Toda a apresentação em
  America/Sao_Paulo já é feita na camada de apresentação
  (`packages/shared/src/format.ts`), então manter o armazenamento e o
  `now()` do banco em UTC é o que o código já assume — este ADR apenas torna
  isso explícito e verificado na infraestrutura, sem mudar código de domínio.
- `LANG=C.UTF-8`/`LC_ALL=C.UTF-8` explícitos nos containers de aplicação
  para garantir que `Intl.NumberFormat("pt-BR", ...)` e `Intl.DateTimeFormat`
  (usados em `formatBRL`/`formatDateSaoPaulo`) tenham suporte a UTF-8/locale
  correto no runtime do Node, independente da imagem base.
- `postgres` roda com `POSTGRES_INITDB_ARGS=--encoding=UTF8
  --locale=C.UTF-8` no primeiro `initdb`, garantindo banco criado em UTF-8.

### Backups

`pg_dump` automático (via `infra/scripts/backup-postgres.sh`, agendado por
cron no host) para produção, comprimido e retido localmente por 14 dias.
Envio para armazenamento externo (S3/Backblaze/etc.) é estrutural mas
condicional a credenciais reais — ver seção "Dependências de infraestrutura
real" no relatório do Sprint 7.

### Restart e healthcheck

- `web`, `worker`, `caddy`, `postgres`, `redis`: `restart: unless-stopped`.
- `migrate`: `restart: "no"` (job one-shot; falha visível em vez de retry
  silencioso mascarando erro de schema).
- `web` expõe `/api/health` (checagem de conexão com banco), usado tanto pelo
  `HEALTHCHECK` do Docker quanto por monitoramento externo futuro.

## Alternativas consideradas

- **PaaS gerenciado (Railway, Render, Fly.io):** menor esforço operacional,
  mas custo variável mais difícil de prever dentro do teto de R$ 300/mês
  conforme a carga cresce, e menor controle sobre backup/retenção — descartado
  para esta fase, mas não incompatível com a arquitetura (as imagens Docker
  produzidas aqui rodam em qualquer PaaS compatível com Docker).
- **Kubernetes:** overhead operacional incompatível com equipe de 2 pessoas e
  volume atual — descartado.
- **Nginx + Certbot:** funcional, mas exige gestão de renovação de
  certificado e configuração mais verbosa que Caddy para o mesmo resultado —
  mantido como alternativa documentada, não como padrão.
- **Dois VPS desde o início (staging e produção fisicamente isolados):** mais
  seguro contra "ruído" de staging afetar produção, porém dobra o custo fixo
  mensal sem necessidade comprovada no volume atual — adiado; a arquitetura
  em stacks Compose isolados já permite essa migração sem redesenho.

## Consequências

- Toda a estrutura de deploy (Dockerfiles, Compose, scripts, documentação) é
  versionada e testável localmente antes de existir qualquer VPS real — o
  time pode revisar/aprovar a infraestrutura como código antes de gastar
  orçamento.
- A migração de "VPS único, dois stacks" para "dois VPS" ou para um PaaS
  gerenciado no futuro não exige reescrever a aplicação: a fronteira já é o
  Dockerfile/imagem.
- Nenhum valor real (domínio, IP, DSN do Sentry, senha) é inventado neste
  ADR ou em qualquer artefato do Sprint 7 — todos os campos que dependem de
  infraestrutura real ficam como placeholders explícitos, documentados no
  relatório final do Sprint 7.
