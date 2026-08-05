# Guia de rollback

Sprint 7 (infra). O que fazer quando um deploy precisa ser desfeito.

## Regra geral: rollback de código é git checkout + rebuild

Nesta fase não existe um registry de imagens externo (não inventamos essa
infraestrutura — ver o relatório do Sprint 7 na PR #1). As imagens são
buildadas localmente, no próprio VPS, a partir do código-fonte no momento do
deploy. Por isso, o rollback padrão é voltar o código para a versão anterior
e reimplantar:

```bash
cd crm
git fetch origin
git checkout <tag-ou-commit-anterior-conhecido-bom>

infra/scripts/deploy.sh production
```

`deploy.sh` reconstrói as imagens a partir dessa versão anterior do código e
sobe os serviços normalmente.

## Migrations: preferimos "roll forward", nunca down-migration automática

O Prisma (`prisma migrate deploy`, usado pelo serviço `migrate`) não suporta
reverter uma migration automaticamente — só aplica migrations novas. Por
isso:

- Se o problema do deploy **não envolveu** uma migration nova, o rollback
  acima (git checkout + rebuild) é suficiente e seguro — o schema do banco
  não muda.
- Se o problema **envolveu** uma migration nova que já rodou contra o banco
  de produção, NÃO faça checkout de uma versão do código anterior à
  migration sem antes decidir explicitamente o que fazer com o schema:
  1. **Preferência forte:** escreva e aplique uma nova migration que desfaça
     o efeito da anterior ("roll forward" — uma migration nova que corrige,
     em vez de tentar apagar a que já rodou). Mais seguro, mais rastreável,
     e é o padrão já usado no restante do projeto
     (ver [`docs/migration-safety.md`](../migration-safety.md)).
  2. **Último recurso, com o banco já comprometido:** restaure o backup mais
     recente anterior à migration problemática — ver
     [`restore.md`](./restore.md). Isso perde qualquer dado gravado entre o
     backup e o restore, então só use se a migration corrompeu dados de um
     jeito que uma migration corretiva não resolve.

## Checklist de um rollback

1. Identifique a última versão (tag/commit) conhecida como boa.
2. Confirme se algum migration novo rodou desde essa versão
   (`git log --oneline -- packages/db/prisma/migrations` entre as duas
   versões).
3. Se não, `git checkout` + `infra/scripts/deploy.sh production`.
4. Se sim, decida entre migration corretiva (preferido) ou restore de
   backup (último recurso), conforme acima.
5. Depois do rollback, confirme `/api/health` respondendo e monitore os
   logs (`docker compose ... logs -f web worker`) por alguns minutos.
