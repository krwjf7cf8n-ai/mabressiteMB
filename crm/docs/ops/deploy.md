# Guia de deploy — staging e produção

Sprint 7 (infra). Cobre o primeiro deploy de cada ambiente e deploys
subsequentes. Para atualizar uma versão já rodando, veja
[`update.md`](./update.md). Para reverter um deploy problemático, veja
[`rollback.md`](./rollback.md).

## Pré-requisitos (uma vez, por VPS)

1. VPS Linux (Ubuntu 22.04/24.04 LTS ou Debian 12) com Docker Engine e o
   plugin Docker Compose (`docker compose version` deve funcionar).
2. DNS do domínio (produção) e/ou subdomínio (staging) apontando para o IP
   do VPS — necessário para o Caddy conseguir emitir certificado TLS via
   Let's Encrypt (HTTP-01, precisa da porta 80 acessível publicamente).
3. Portas 80 e 443 liberadas no firewall do VPS.
4. Repositório clonado no VPS (`git clone ...`), na branch/tag que será
   implantada.

## Preparar as variáveis de ambiente (uma vez, por ambiente)

```bash
cd crm/infra
cp .env.production.example .env.production   # ou .env.staging.example -> .env.staging
# edite .env.production e preencha TODOS os campos — ver a lista completa
# de dependências de infraestrutura real no relatório do Sprint 7 na PR #1.
```

Nunca commite `.env.production`/`.env.staging` — já cobertos por
`.gitignore` e pelo job `secrets-check` do CI.

## Primeiro deploy

```bash
cd crm
infra/scripts/deploy.sh production
# ou, para staging (com seed, se for o primeiro deploy de staging):
infra/scripts/deploy.sh staging --seed
```

O script (`infra/scripts/deploy.sh`) faz, nesta ordem:

1. Build das imagens (`apps/web/Dockerfile`, `apps/worker/Dockerfile`).
2. Sobe `postgres` e `redis`.
3. Roda o serviço one-shot `migrate` (`prisma migrate deploy` — nunca
   `migrate dev`), que precisa terminar com sucesso antes do próximo passo.
4. Só em staging e só se `--seed` for passado: roda `pnpm db:seed`. Nunca
   acontece automaticamente, e nunca em produção (o script recusa
   `production --seed`).
5. Sobe `web`, `worker` e `caddy`.
6. Espera `/api/health` responder 200 antes de considerar o deploy
   concluído — se não responder em ~60s, o script falha e mostra onde ver
   os logs.

## Deploys seguintes

Mesmo comando (`infra/scripts/deploy.sh production`). O Compose recria só o
que mudou; `migrate` roda de novo mas `prisma migrate deploy` é idempotente
(não reaplica migrations já aplicadas).

## Verificação pós-deploy

```bash
curl -sf https://SEU_DOMINIO/api/health   # {"status":"ok"}
docker compose --env-file infra/.env.production -p mabres-production \
  -f infra/docker-compose.yml ps
```

Confirme que `postgres`, `redis`, `web`, `worker` e `caddy` estão `Up` (e
`migrate` como `Exited (0)` — é esperado, é um job one-shot).

## O que depende de infraestrutura real (não implementado aqui)

- VPS efetivamente contratado, IP, acesso SSH.
- Domínio da Mabres registrado e DNS configurado.
- Conta Sentry (se for usar `SENTRY_DSN`) — opcional, o sistema funciona
  sem ela.
- Rotação/gestão de segredos fora deste repositório (ex.: um cofre de
  senhas para preencher os `.env.production`/`.env.staging`).

Ver o relatório do Sprint 7 na PR #1 para a lista completa.
