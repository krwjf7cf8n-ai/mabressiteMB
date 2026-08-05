#!/usr/bin/env bash
set -euo pipefail

# Sprint 7 (infra) — backup automático do Postgres via pg_dump.
#
# Uso: infra/scripts/backup-postgres.sh
#
# Variáveis (todas com default sensato, sobrescrevíveis via ambiente):
#   COMPOSE_PROJECT   nome do projeto Compose (default: mabres-production)
#   ENV_FILE          arquivo de variáveis do stack (default: infra/.env.production)
#   BACKUP_DIR        onde salvar os dumps (default: /var/backups/mabres-crm)
#   RETENTION_DAYS    dias de retenção local (default: 14)
#
# Agendamento sugerido (crontab do host — fora deste repositório):
#   0 3 * * * cd /caminho/do/repo/crm && infra/scripts/backup-postgres.sh >> /var/log/mabres-backup.log 2>&1
#
# Ver docs/ops/backup.md para o procedimento completo, incluindo o que ainda
# depende de infraestrutura real (envio para armazenamento externo).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

COMPOSE_PROJECT="${COMPOSE_PROJECT:-mabres-production}"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mabres-crm}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ ! -f "$ENV_FILE" ]; then
  echo "[backup] Arquivo de ambiente não encontrado: $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_DB:-}" ]; then
  echo "[backup] POSTGRES_USER/POSTGRES_DB ausentes em $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

echo "[backup] Iniciando dump de '${POSTGRES_DB}' (projeto ${COMPOSE_PROJECT}) -> ${OUT_FILE}"

docker compose --env-file "$ENV_FILE" -p "$COMPOSE_PROJECT" -f "$INFRA_DIR/docker-compose.yml" \
  exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain \
  | gzip > "$OUT_FILE"

echo "[backup] Concluído: $(du -h "$OUT_FILE" | cut -f1) em ${OUT_FILE}"

echo "[backup] Removendo backups de '${POSTGRES_DB}' com mais de ${RETENTION_DAYS} dias em ${BACKUP_DIR}"
find "$BACKUP_DIR" -maxdepth 1 -name "${POSTGRES_DB}_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete
