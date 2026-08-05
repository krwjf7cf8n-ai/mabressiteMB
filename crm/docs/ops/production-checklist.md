# Checklist operacional de produção

Sprint 7 (infra). Conferir antes de considerar produção "ligada de verdade"
com clientes reais, e revisitar periodicamente.

## Infraestrutura

- [ ] VPS contratado, com Docker Engine + plugin Compose instalados.
- [ ] Domínio de produção registrado e DNS apontando para o VPS.
- [ ] Portas 80/443 liberadas no firewall; nenhuma outra porta exposta
      publicamente (`postgres`/`redis` só existem na rede interna do
      Compose — ver [ADR 0002](../decisions/0002-infraestrutura-deploy.md)).
- [ ] `infra/.env.production` preenchido com valores reais, nenhum campo
      vazio que deveria estar preenchido, e **não commitado** (confirmar
      `git status` limpo / arquivo listado como ignorado).
- [ ] TLS emitido com sucesso pelo Caddy (acessar `https://SEU_DOMINIO` sem
      aviso de certificado).

## Deploy

- [ ] Primeiro deploy rodado com sucesso (`infra/scripts/deploy.sh
      production`) — ver [`deploy.md`](./deploy.md).
- [ ] `/api/health` responde 200.
- [ ] `docker compose ... ps` mostra todos os serviços de longa duração
      (`postgres`, `redis`, `web`, `worker`, `caddy`) como `Up`.

## Segurança operacional

- [ ] Nenhuma credencial real está versionada no repositório (o job
      `secrets-check` do CI cobre isso a cada PR — confirmar que está
      passando).
- [ ] Branch protection configurada no GitHub para a branch principal — ver
      [`branch-protection.md`](./branch-protection.md) (depende de
      configuração manual nas configurações do repositório; não é algo que
      código consegue aplicar sozinho).
- [ ] MFA habilitado para todas as contas com acesso a: GitHub (org/repo),
      VPS (SSH), DNS/registrador de domínio, e qualquer conta de
      observabilidade (ex.: Sentry, se/quando existir) — ver
      [`branch-protection.md`](./branch-protection.md#mfa-requisito-operacional).
- [ ] `infra/.env.production` só existe no VPS e em um cofre de segredos
      (não em laptops pessoais, não em mensagens/e-mail).

## Backup

- [ ] `infra/scripts/backup-postgres.sh` agendado via cron no VPS — ver
      [`backup.md`](./backup.md).
- [ ] Um restore de teste já foi executado com sucesso (em staging, nunca
      em produção) — ver [`restore.md`](./restore.md).
- [ ] Backup externo (fora do VPS) está configurado, **ou** está
      explicitamente registrado como pendência conhecida — ver
      [`disaster-recovery.md`](./disaster-recovery.md).

## Monitoramento

- [ ] Rotação de log confirmada (`docker compose ... logs` não cresce sem
      limite — já configurado via `max-size`/`max-file`, mas vale conferir
      o disco do VPS periodicamente).
- [ ] Se `SENTRY_DSN` estiver configurado: um erro de teste aparece no
      projeto Sentry (dispare um erro controlado e confirme que chegou).
- [ ] Alguém sabe onde olhar quando algo dá errado — ver
      [`troubleshooting.md`](./troubleshooting.md).

## Antes de cada deploy com migration nova/arriscada

- [ ] Backup manual rodado (`infra/scripts/backup-postgres.sh`) — ver
      [`update.md`](./update.md).
- [ ] Testado primeiro em staging.

## Dependências de infraestrutura real ainda não implementadas

Ver a lista completa e atualizada no relatório do Sprint 7 na PR #1 — em
resumo: VPS/domínio/DNS reais, conta de storage externo para backup, conta
Sentry (opcional), e a configuração manual de branch protection/MFA no
GitHub.
