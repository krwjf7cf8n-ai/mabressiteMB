# Guia de backup

Sprint 7 (infra). Backup automático do PostgreSQL de produção.

## Como funciona

[`infra/scripts/backup-postgres.sh`](../../infra/scripts/backup-postgres.sh)
roda `pg_dump` dentro do container `postgres` do stack (via
`docker compose exec`), comprime o resultado (`gzip`) e salva em
`BACKUP_DIR` (default `/var/backups/mabres-crm`) com o nome
`<banco>_<timestamp-UTC>.sql.gz`. Depois de cada execução, remove backups
mais antigos que `RETENTION_DAYS` (default 14 dias).

## Agendar (cron do host — fora deste repositório)

```bash
crontab -e
# Backup diário de produção às 03:00 UTC (meia-noite em São Paulo, horário de
# menor uso):
0 3 * * * cd /caminho/do/repo/crm && infra/scripts/backup-postgres.sh >> /var/log/mabres-backup.log 2>&1
```

Staging não tem backup automático agendado por padrão — os dados de staging
são recriáveis via seed e não são a fonte de verdade de nada; se quiser
mesmo assim, rode o mesmo script com `COMPOSE_PROJECT=mabres-staging
ENV_FILE=infra/.env.staging`.

## Rodar manualmente

```bash
cd crm
infra/scripts/backup-postgres.sh
# ou, para staging:
COMPOSE_PROJECT=mabres-staging ENV_FILE=infra/.env.staging infra/scripts/backup-postgres.sh
```

Recomendado antes de qualquer deploy com migration nova/arriscada — ver
[`update.md`](./update.md).

## O que ainda depende de infraestrutura real

O backup atual fica **local no próprio VPS** (`BACKUP_DIR`). Isso protege
contra erro de aplicação/migration, mas **não** protege contra perda do VPS
inteiro (disco corrompido, servidor destruído, provedor com incidente). Para
isso, falta:

- Uma conta de armazenamento externo (S3, Backblaze B2, ou equivalente) —
  não inventamos credenciais nem endpoint aqui.
- Um passo adicional no script (ou um segundo cron job) que envie o `.gz`
  gerado para esse armazenamento externo depois do `pg_dump` local. A
  estrutura do script já isola claramente onde esse passo entraria (logo
  após a linha que confirma o tamanho do arquivo gerado).

Até essa infraestrutura existir, trate o backup local como proteção contra
erro operacional, não como proteção contra desastre físico — ver
[`disaster-recovery.md`](./disaster-recovery.md).
