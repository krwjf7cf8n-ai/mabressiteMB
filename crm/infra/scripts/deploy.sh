#!/usr/bin/env bash
set -euo pipefail

# Sprint 7 (infra) — pipeline de deploy reproduzível.
#
# Uso:
#   infra/scripts/deploy.sh production
#   infra/scripts/deploy.sh staging
#   infra/scripts/deploy.sh staging --seed   # seed só existe para staging, e só se pedido explicitamente
#
# Ordem: build das imagens -> sobe postgres/redis -> aguarda ficarem
# saudáveis -> aplica migrations (prisma migrate deploy, via o serviço
# one-shot "migrate") -> (staging + --seed) roda o seed -> sobe web/worker/
# caddy -> aguarda /api/health responder.
#
# Rollback: ver docs/ops/rollback.md (reaponta IMAGE_TAG para a versão
# anterior e reexecuta este script — nunca faz downgrade de schema).

TARGET="${1:-}"
SEED=false
if [ "${2:-}" = "--seed" ]; then
  SEED=true
fi

if [ "$TARGET" != "production" ] && [ "$TARGET" != "staging" ]; then
  echo "Uso: $0 <production|staging> [--seed]" >&2
  exit 1
fi
if [ "$SEED" = true ] && [ "$TARGET" = "production" ]; then
  echo "[deploy] Seed não é permitido em produção. Abortando." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$INFRA_DIR/.env.$TARGET"
PROJECT="mabres-$TARGET"

if [ ! -f "$ENV_FILE" ]; then
  echo "[deploy] $ENV_FILE não encontrado. Copie de .env.$TARGET.example e preencha antes de rodar o deploy." >&2
  exit 1
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -p "$PROJECT" -f "$INFRA_DIR/docker-compose.yml")

echo "[deploy] (${TARGET}) build das imagens..."
"${COMPOSE[@]}" build

echo "[deploy] (${TARGET}) subindo postgres/redis..."
"${COMPOSE[@]}" up -d postgres redis

echo "[deploy] (${TARGET}) aplicando migrations..."
"${COMPOSE[@]}" run --rm migrate

if [ "$SEED" = true ]; then
  echo "[deploy] (${TARGET}) rodando seed (solicitado explicitamente via --seed)..."
  "${COMPOSE[@]}" run --rm web pnpm db:seed
fi

echo "[deploy] (${TARGET}) subindo web/worker/caddy..."
"${COMPOSE[@]}" up -d web worker caddy

echo "[deploy] (${TARGET}) aguardando /api/health responder..."
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T web node -e \
    "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "[deploy] Aplicação saudável. Deploy concluído."
    exit 0
  fi
  sleep 2
done

echo "[deploy] Aplicação não respondeu saudável a tempo." >&2
echo "[deploy] Veja os logs: docker compose -p ${PROJECT} -f ${INFRA_DIR}/docker-compose.yml logs web" >&2
exit 1
