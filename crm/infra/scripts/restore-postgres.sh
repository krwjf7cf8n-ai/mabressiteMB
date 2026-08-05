#!/usr/bin/env bash
set -euo pipefail

# Sprint 7 (infra) — restaura um dump gerado por backup-postgres.sh.
#
# Uso: infra/scripts/restore-postgres.sh <caminho-do-dump.sql.gz>
#
# ATENÇÃO: isto SOBRESCREVE o banco do ambiente alvo. Exige confirmação
# manual (digitar o nome do banco) — não existe flag --force. Ver
# docs/ops/restore.md para o procedimento completo (quando usar, validação
# pós-restore, etc.).
#
# Variáveis (mesmos defaults de backup-postgres.sh):
#   COMPOSE_PROJECT, ENV_FILE

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

COMPOSE_PROJECT="${COMPOSE_PROJECT:-mabres-production}"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/.env.production}"
DUMP_FILE="${1:-}"

if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "Uso: $0 <caminho-do-dump.sql.gz>" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "[restore] Arquivo de ambiente não encontrado: $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_DB:-}" ]; then
  echo "[restore] POSTGRES_USER/POSTGRES_DB ausentes em $ENV_FILE" >&2
  exit 1
fi

echo "Isto vai SOBRESCREVER o banco '${POSTGRES_DB}' do projeto '${COMPOSE_PROJECT}'."
echo "Dump: ${DUMP_FILE}"
read -r -p "Digite exatamente '${POSTGRES_DB}' para confirmar: " CONFIRM
if [ "$CONFIRM" != "$POSTGRES_DB" ]; then
  echo "[restore] Confirmação não corresponde. Abortando." >&2
  exit 1
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -p "$COMPOSE_PROJECT" -f "$INFRA_DIR/docker-compose.yml")

echo "[restore] Parando web e worker (evita escritas durante o restore)..."
"${COMPOSE[@]}" stop web worker

echo "[restore] Restaurando dump em '${POSTGRES_DB}'..."
gunzip -c "$DUMP_FILE" | "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "[restore] Subindo web e worker novamente..."
"${COMPOSE[@]}" up -d web worker

echo "[restore] Concluído. Siga a checagem pós-restore em docs/ops/restore.md."
