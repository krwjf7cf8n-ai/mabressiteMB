# Mabres CRM

CRM imobiliário da Mabres Negócios Imobiliários (Sorocaba, Votorantim e região).
Este diretório é o monorepo do CRM; o site estático institucional continua na
raiz do repositório e não foi alterado.

Documentação completa: [`docs/architecture.md`](docs/architecture.md),
[`docs/integration-plan.md`](docs/integration-plan.md),
[`docs/security-plan.md`](docs/security-plan.md).

## Requisitos

- Node.js 20+
- pnpm 9+
- PostgreSQL 14+ local ou remoto
- Redis (para o worker de filas/jobs agendados)

## Como rodar localmente

```bash
cp .env.example .env
# edite .env: DATABASE_URL, NEXTAUTH_SECRET, REDIS_URL no mínimo

pnpm install
pnpm db:generate
pnpm db:migrate      # cria as tabelas
pnpm db:seed         # cria papéis, etapas do funil e os 2 usuários administradores

pnpm dev             # apps/web em http://localhost:3000
pnpm worker          # apps/worker (precisa de REDIS_URL configurado)
```

O seed imprime no console a senha temporária gerada para
`matheus@mabresnegociosimobiliarios.com.br` e
`brenda@mabresnegociosimobiliarios.com.br` caso `SEED_MATHEUS_PASSWORD` /
`SEED_BRENDA_PASSWORD` não estejam definidas no `.env`. Troque a senha após o
primeiro login e defina essas variáveis em ambientes persistentes.

## Como testar

```bash
pnpm test            # roda os testes de packages/shared e apps/worker
```

Testes cobrem: deduplicação de contatos (telefone/WhatsApp/e-mail/ID da Meta),
motor de matching determinístico cliente↔imóvel, e o job de notificação de
tarefas vencidas.

## Status desta entrega (Fase 1 + MVP em andamento)

Implementado e testado:
- Schema completo do banco (todos os módulos do briefing, mesmo os que ainda
  não têm tela).
- Autenticação (login/senha) e RBAC configurável (papéis e permissões em
  tabela, não hardcoded).
- Dashboard com contagens reais (leads por período, tarefas vencidas, visitas
  agendadas).
- Módulo de Leads/Clientes: cadastro com verificação de duplicidade, funil com
  histórico de etapas, motivo obrigatório em perda/pausa, auditoria completa.
- Módulo de Imóveis e Proprietários (Fase 1.1): CRUD com filtros, histórico de
  preço e status, proprietário vinculado (dados bancários sempre cifrados),
  inativação com motivo.
- Matching determinístico cliente ↔ imóvel (Fase 1.2): explicável, com
  critérios obrigatórios/desejáveis/indiferentes, invalidação automática de
  cache e recálculo manual. Ver `docs/matching-algorithm.md`.
- Worker com job real de notificação de tarefas vencidas e interfaces + mocks
  para as integrações futuras (Meta, WhatsApp, Google, e-Móvel) — nenhuma
  chamada externa real acontece nesta fase.

**Onde o CRM roda hoje**: apenas localmente (`pnpm dev`/`pnpm start`). O
Deploy Preview do Netlify configurado para este repositório publica somente
os arquivos estáticos da raiz (site institucional) — não existe
`netlify.toml` nem qualquer configuração apontando para `crm/`, e mesmo que
existisse, hospedagem estática não executa o runtime Node.js/Postgres/Redis
que o CRM exige. Não há ambiente de staging/produção publicado para o CRM
ainda; isso está planejado para a Fase 9.

Ainda não implementado (próximas entregas incrementais):
- Visitas e tarefas completas (Fase 1.3).
- Importação CSV (Fase 1.4).
- Tela de administração de papéis/permissões (Fase 1.5).
- Propostas, contratos, comissões.
- Qualquer integração real (Meta, WhatsApp, Google, e-Móvel) — dependem de
  aprovação e confirmações listadas em `docs/integration-plan.md`.
