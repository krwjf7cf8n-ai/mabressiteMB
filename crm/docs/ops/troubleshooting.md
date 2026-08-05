# Troubleshooting

Sprint 7 (infra). Pontos de partida para os problemas mais prováveis em
staging/produção.

## Onde olhar primeiro

```bash
cd crm
COMPOSE="docker compose --env-file infra/.env.production -p mabres-production -f infra/docker-compose.yml"

$COMPOSE ps                    # quem está Up, quem reiniciou, quem saiu com erro
$COMPOSE logs --tail=200 web
$COMPOSE logs --tail=200 worker
$COMPOSE logs --tail=200 postgres
$COMPOSE logs --tail=200 caddy
```

(Troque `production` por `staging` e o `--env-file`/`-p` correspondentes
para investigar o outro ambiente.)

Cada linha de log sai como um envelope JSON (driver `json-file` do Docker —
ver [ADR 0002](../decisions/0002-infraestrutura-deploy.md)), então também dá
para filtrar com `jq` se for direto no arquivo de log do Docker.

## "/api/health responde 503 ou não responde"

Causa mais provável: `web` não consegue falar com o Postgres.

```bash
$COMPOSE exec postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
$COMPOSE logs postgres --tail=100
```

Se o Postgres estiver saudável mas `web` mesmo assim falhar, confira se
`DATABASE_URL` em `infra/.env.production` bate com
`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` do mesmo arquivo (o
Compose monta a URL a partir dessas três variáveis — ver
`infra/docker-compose.yml`).

## "web não sobe, fica reiniciando"

```bash
$COMPOSE logs web --tail=200
```

Causas comuns:

- `migrate` não terminou com sucesso (web depende de
  `service_completed_successfully` no `migrate`) — veja
  `$COMPOSE logs migrate`.
- `NEXTAUTH_SECRET`/`ENCRYPTION_KEY` ausentes ou com menos de 32 caracteres
  em `infra/.env.production`.
- Porta 3000 já em uso dentro do container (não deveria acontecer em
  condições normais — indica algo reiniciando de forma anômala; veja se há
  duas instâncias de `web` por engano).

## "worker não processa nada"

```bash
$COMPOSE logs worker --tail=200
$COMPOSE exec redis redis-cli -a "$REDIS_PASSWORD" ping   # deve responder PONG
```

O worker reagenda os próprios jobs periódicos no boot
(`apps/worker/src/index.ts`) — se ele reiniciou recentemente, é esperado
levar até o intervalo do job (10–15 min) para o próximo ciclo rodar. Job
falhando de forma recorrente aparece em `worker.on("failed", ...)` no log
(e no Sentry, se `SENTRY_DSN` estiver configurado).

## "Caddy não emite certificado TLS"

```bash
$COMPOSE logs caddy --tail=200
```

Causas comuns:

- DNS do `DOMAIN` configurado em `infra/.env.production` ainda não aponta
  para o IP do VPS (ou ainda está propagando).
  Confirmar com `dig +short SEU_DOMINIO` de uma máquina fora do VPS.
- Porta 80 bloqueada no firewall do VPS ou do provedor — Let's Encrypt
  precisa alcançar o desafio HTTP-01 na porta 80.
- `ACME_EMAIL` vazio ou inválido em `infra/.env.production`.

## "Migration falhou (`migrate` saiu com erro)"

```bash
$COMPOSE logs migrate
```

Não repita o deploy sem entender o erro — uma migration que falhou pela
metade pode deixar o schema em estado intermediário. Veja
[`docs/migration-safety.md`](../migration-safety.md) para o padrão de
migrations do projeto, e considere restaurar um backup (ver
[`restore.md`](./restore.md)) se o schema ficou inconsistente.

## "Preciso confirmar o horário/timezone real do sistema"

```bash
$COMPOSE exec web date -u
$COMPOSE exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SHOW timezone; SELECT now();"
```

Ambos devem estar em UTC (ver [ADR 0002](../decisions/0002-infraestrutura-deploy.md)
— a apresentação em America/Sao_Paulo acontece só na camada de UI,
`packages/shared/src/format.ts`, nunca no armazenamento).

## Sentry configurado mas nada aparece lá

Confirme que `SENTRY_DSN` está de fato definido no ambiente do container
(não só no `.env` do host):

```bash
$COMPOSE exec web printenv SENTRY_DSN
$COMPOSE exec worker printenv SENTRY_DSN
```

`@sentry/node` só é inicializado se essa variável existir no momento em que
o processo sobe (ver `apps/web/instrumentation.ts` e
`apps/worker/src/sentry.ts`) — mudar o `.env` exige recriar os containers
(`infra/scripts/deploy.sh`), não só reiniciar.
