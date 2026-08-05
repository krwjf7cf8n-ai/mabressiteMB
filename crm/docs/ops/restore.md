# Guia de restore

Sprint 7 (infra). Como restaurar um backup gerado por
[`backup.md`](./backup.md).

## Quando usar

- Corrupção ou perda de dados que uma migration corretiva não resolve (ver
  [`rollback.md`](./rollback.md)).
- Recuperação de desastre (ver [`disaster-recovery.md`](./disaster-recovery.md)).
- Teste periódico do próprio procedimento de restore (recomendado — um
  backup que nunca foi restaurado em teste não é um backup confiável).

## Procedimento

```bash
cd crm
infra/scripts/restore-postgres.sh /var/backups/mabres-crm/mabres_crm_production_20260101T030000Z.sql.gz
```

O script:

1. Pede para digitar exatamente o nome do banco de destino, como
   confirmação (não existe `--force` — é proposital, restore é destrutivo).
2. Para `web` e `worker` (evita escrita concorrente durante o restore).
3. Restaura o dump via `psql`.
4. Sobe `web` e `worker` de novo.

## Checagem pós-restore (obrigatória)

1. `curl -sf https://SEU_DOMINIO/api/health` — deve responder 200.
2. Login manual com um usuário conhecido — confirma que autenticação e RBAC
   (tabelas `Role`/`Permission`/`RolePermission`) vieram consistentes no
   dump.
3. Confira a data/hora do registro mais recente esperado (ex.: o último
   lead ou visita cadastrado antes do incidente) para confirmar que o dump
   restaurado é o que você esperava, não um mais antigo por engano.
4. Audite o intervalo entre o timestamp do backup restaurado e o momento do
   incidente — tudo criado nesse intervalo foi perdido. Registre isso
   internamente (para leads/visitas perdidos, contato manual com o cliente
   pode ser necessário).

## Restaurar em staging para investigar um incidente de produção

Restaurar o dump de produção em staging (para depurar sem tocar no banco
real) é permitido e recomendado — troque `COMPOSE_PROJECT`/`ENV_FILE`:

```bash
COMPOSE_PROJECT=mabres-staging ENV_FILE=infra/.env.staging \
  infra/scripts/restore-postgres.sh /caminho/do/dump.sql.gz
```

Dados pessoais (LGPD) de produção ficariam então em staging — trate o
staging, quando usado dessa forma, com o mesmo cuidado de acesso que
produção enquanto os dados restaurados existirem lá, e apague/rode o seed
de novo assim que a investigação terminar.
