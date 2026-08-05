# Guia de recuperação de desastre

Sprint 7 (infra). Cenário: o VPS de produção ficou indisponível (falha de
hardware do provedor, disco corrompido, conta suspensa, etc.) — não é um bug
de aplicação, é perda do ambiente inteiro.

## Pré-condição

Este procedimento só funciona se houver um backup do Postgres em um local
**fora** do VPS perdido. Conforme documentado em
[`backup.md`](./backup.md#o-que-ainda-depende-de-infraestrutura-real), o
backup automático desta fase é local ao VPS — enviar cópias para
armazenamento externo ainda depende de uma conta de storage real que não
temos. **Até essa peça existir, a recuperação de desastre descrita aqui só é
possível se alguém tiver copiado manualmente um `.sql.gz` para fora do VPS**
(ex.: baixado para uma máquina local após um backup manual). Isso deve ser
tratado como prioridade assim que a infraestrutura de storage externo for
contratada — ver a lista de dependências no relatório do Sprint 7 na PR #1.

## Passo a passo

1. **Provisionar um novo VPS** (mesmas specs mínimas do original — Docker
   Engine + plugin Compose).
2. **Clonar o repositório**:
   ```bash
   git clone <url-do-repositorio> mabres-crm
   cd mabres-crm/crm
   git checkout <última tag/commit em produção antes do incidente>
   ```
3. **Recriar `infra/.env.production`** a partir de
   `infra/.env.production.example`, preenchendo os mesmos valores usados
   antes (segredos precisam vir de onde quer que estejam guardados fora do
   VPS — ex.: um cofre de senhas; nunca ficam só no VPS).
4. **Apontar o DNS** do domínio de produção para o IP do novo VPS.
5. **Subir a infraestrutura sem o banco populado ainda**:
   ```bash
   cd crm
   docker compose --env-file infra/.env.production -p mabres-production \
     -f infra/docker-compose.yml up -d postgres redis
   ```
6. **Restaurar o backup mais recente disponível** — ver
   [`restore.md`](./restore.md):
   ```bash
   infra/scripts/restore-postgres.sh /caminho/do/backup/mais/recente.sql.gz
   ```
   (Nesse ponto `web`/`worker` ainda não estão de pé — o script tenta pará-los
   e é seguro rodar mesmo que não existam ainda; ele vai apenas avisar e
   seguir.)
7. **Subir o restante do stack**:
   ```bash
   infra/scripts/deploy.sh production
   ```
   (`deploy.sh` roda `migrate` de novo — inofensivo, é idempotente — e sobe
   `web`/`worker`/`caddy`.)
8. **Validar**: seguir a checagem pós-restore de
   [`restore.md`](./restore.md#checagem-pós-restore-obrigatória).
9. **Comunicar**: qualquer dado criado entre o timestamp do backup restaurado
   e o momento do incidente foi perdido — ver a seção de auditoria em
   `restore.md`.

## RPO/RTO honestos, nesta fase

- **RPO (perda de dados aceitável):** até 24h — intervalo entre backups
  diários (ver `backup.md`), assumindo que o backup mais recente estava
  fora do VPS perdido. Se não estava, o RPO é "desde o último backup que
  sobreviveu", que pode ser muito pior — motivo pelo qual o storage externo
  é a lacuna mais importante da lista de dependências deste sprint.
- **RTO (tempo até religar):** não medido formalmente ainda — depende de
  quão rápido um novo VPS pode ser provisionado e o DNS propagar. Uma vez
  com o VPS pronto e o backup em mãos, os passos acima levam poucos
  minutos.

Melhorar RPO/RTO (backup externo automático, VPS de standby pré-provisionado,
etc.) é otimização fora do escopo autorizado para o Sprint 7 — fica
registrado aqui como lacuna conhecida para decisão futura, não implementado
sem aprovação explícita.
