# Guia de atualização (nova versão em produção/staging)

Sprint 7 (infra). Como publicar uma nova versão do código em um ambiente que
já está rodando.

## Passo a passo

```bash
cd crm
git fetch origin
git checkout <tag-ou-branch-a-implantar>
git pull

infra/scripts/deploy.sh production   # ou staging
```

`deploy.sh` cobre tudo: build das imagens novas, `prisma migrate deploy`
(aplica só as migrations que ainda não foram aplicadas — nunca reaplica
nada), sobe `web`/`worker`/`caddy` com a versão nova, e só retorna sucesso
depois de `/api/health` responder.

## Recomendações

- **Sempre** atualize staging primeiro, valide manualmente, e só depois
  produção. Os dois ambientes são stacks Compose totalmente isolados (bancos
  diferentes, domínios diferentes — ver
  [ADR 0002](../decisions/0002-infraestrutura-deploy.md)), então validar em
  staging não arrisca dados de produção.
- Antes de atualizar produção com uma migration nova/arriscada, rode
  [`backup-postgres.sh`](../../infra/scripts/backup-postgres.sh) manualmente
  (fora do agendamento automático) para garantir um ponto de restauração
  recente:
  ```bash
  infra/scripts/backup-postgres.sh
  ```
- Se o deploy falhar (o script sai com erro e mostra onde ver os logs),
  **não** tente "forçar" — investigue o log (`docker compose ... logs web`)
  antes de repetir. Se a causa for uma migration problemática ou uma versão
  quebrada, siga [`rollback.md`](./rollback.md).

## Downtime esperado

`web`/`worker` são recriados (não é rolling update — não há múltiplas
réplicas nesta fase, conforme o orçamento do ADR 0001). Espere alguns
segundos de indisponibilidade durante a troca de containers; o Caddy só
volta a rotear tráfego quando o novo `web` responde saudável.
