# Padrão seguro de migrations (G21, Marco 1.9)

Documento criado depois da primeira migration deste projeto que alterava o
**tipo** de uma coluna com potencial de já ter dados (`Property.status` de
`String` para o enum `PropertyStatus`, G16) — até então todas as migrations
tinham sido só `CREATE TABLE`/`ADD COLUMN` aditivas, que o Prisma gera com
segurança sozinho. Este documento existe para as próximas vezes em que isso
não for mais verdade.

## O problema: o Prisma nem sempre gera SQL seguro

`prisma migrate dev` (sem `--create-only`) gera **e aplica** a migration na
mesma hora. Para a maioria das mudanças aditivas isso é seguro. Mas para
mudanças que envolvem **trocar o tipo de uma coluna existente**, o Prisma
frequentemente resolve o diff como `DROP COLUMN` + `ADD COLUMN` — o que
**apaga silenciosamente todo dado já gravado naquela coluna**, mesmo quando
existe um caminho seguro (um `ALTER COLUMN ... TYPE ... USING (...)`) que
preserva os dados.

Isso já aconteceu ao gerar a migration do G16: o SQL inicial gerado pelo
`prisma migrate dev --create-only` para `Property.status: String → enum`
vinha com o aviso:

```
Warnings:
  - The `status` column on the `properties` table would be dropped and recreated.
    This will lead to data loss if there is data in the column.
```

O Prisma **avisa**, mas não corrige sozinho — corrigir é responsabilidade de
quem está escrevendo a migration.

## Regra: nunca `migrate dev` direto para mudanças não-aditivas

Para qualquer migration que não seja puramente aditiva (`CREATE TABLE`,
`ADD COLUMN` nullable ou com `DEFAULT`, `CREATE INDEX`), o processo é:

1. **Gerar sem aplicar**: `prisma migrate dev --create-only --name <nome_descritivo>`.
2. **Ler o SQL gerado por inteiro**, prestando atenção especial a qualquer
   `DROP COLUMN`, `DROP TABLE` ou aviso de perda de dado no output do comando.
3. **Se houver risco de perda de dado que não deveria existir**, reescrever
   o `migration.sql` manualmente com o padrão seguro equivalente (exemplos
   abaixo) — o arquivo é só texto, pode ser editado antes de aplicar.
4. **Testar contra um banco com dado pré-existente compatível**, não só um
   banco vazio: inserir uma linha manualmente (via SQL cru, simulando dado
   gravado antes da migration), aplicar a migration, e conferir que a linha
   sobrevive com o valor esperado.
5. **Aplicar** (`prisma migrate deploy` ou `migrate dev` normalmente, agora
   que o SQL já foi revisado).
6. **Conferir ausência de drift**: `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` deve retornar "No difference detected."

## Padrões seguros por tipo de mudança

### String → Enum (ex.: G16)

Errado (o que o Prisma propõe por padrão):

```sql
ALTER TABLE "properties" DROP COLUMN "status",
ADD COLUMN "status" "PropertyStatus" NOT NULL DEFAULT 'ativo';
```

Certo — cast direto, sem apagar a coluna:

```sql
CREATE TYPE "PropertyStatus" AS ENUM ('ativo', 'vendido', 'alugado', 'suspenso', 'indisponivel', 'inativo');

ALTER TABLE "properties" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "properties" ALTER COLUMN "status" TYPE "PropertyStatus" USING ("status"::"PropertyStatus");
ALTER TABLE "properties" ALTER COLUMN "status" SET DEFAULT 'ativo';
```

O `USING` só falha se existir alguma linha com um valor que não bate com
nenhum valor do enum — o que é exatamente o comportamento certo (falhar
alto na migration, não silenciosamente truncar/apagar dado). Antes de rodar
em um banco com dado real, confirme com uma consulta que não existe valor
fora do esperado:

```sql
SELECT DISTINCT status FROM properties
WHERE status NOT IN ('ativo', 'vendido', 'alugado', 'suspenso', 'indisponivel', 'inativo');
-- deve retornar 0 linhas antes de aplicar a migration
```

Índices já existentes na coluna (`@@index([status])`) são preservados
automaticamente pelo Postgres ao trocar o tipo — não precisam ser recriados
manualmente na migration.

### Adicionar coluna `NOT NULL` numa tabela que já tem linhas

Nunca `ADD COLUMN "x" TEXT NOT NULL` direto numa tabela com dado, a menos
que exista um `DEFAULT` aceitável para as linhas já existentes. Sem
`DEFAULT`, o padrão é expand/contract em duas migrations separadas:

1. Migration 1: adiciona a coluna como opcional (`ADD COLUMN "x" TEXT`),
   faz o deploy, roda um backfill (script ou `UPDATE`) para preencher as
   linhas existentes.
2. Migration 2 (depois de confirmar que o backfill rodou): `ALTER COLUMN "x" SET NOT NULL`.

### Renomear uma coluna ou tabela

O Prisma frequentemente não detecta rename e propõe `DROP` da coluna/tabela
antiga + `CREATE` da nova — perde todo o dado. Se o diff gerado mostrar
isso para o que deveria ser um rename, reescreva manualmente usando
`ALTER TABLE ... RENAME COLUMN "antigo" TO "novo"` (ou `RENAME TO` para
tabela).

### Remover uma coluna ou tabela

Só depois de:
1. Confirmar (busca no código) que nada mais lê/escreve o campo.
2. Se o dado ainda tiver valor histórico, considerar manter a coluna
   opcional por um período em vez de apagar imediatamente.
3. Migration de remoção isolada, nunca junto com outra mudança de schema.

## Regras adicionais deste projeto

- **Uma migration por tópico.** Não misturar, na mesma migration, mudanças
  de tabelas/domínios não relacionados — facilita revisão e, se precisar
  reverter, isola o que precisa ser desfeito. (Ver G16: uma única migration,
  mas com escopo explicitamente limitado a duas mudanças relacionadas —
  `Property.status` e o índice de `Contact.firstContactAt` — não porque
  eram do mesmo tópico de negócio, mas porque foi exatamente o que o G16
  pediu; em geral, prefira uma migration por mudança quando não houver essa
  restrição explícita.)
- **Migrations são só para frente.** Este projeto não mantém migrations de
  rollback (`down`). Se uma migration aplicada em produção precisar ser
  desfeita, a correção é uma **nova migration** revertendo o efeito — nunca
  editar ou apagar um arquivo de migration já commitado/aplicado.
- **Sempre validar com banco reconstruído do zero.** Antes de considerar
  qualquer migration pronta: `DROP DATABASE` + `CREATE DATABASE` +
  `prisma migrate deploy` do zero deve aplicar todas as migrations em
  sequência sem erro (isso é o que o CI faz a cada PR, no job
  `test-and-migrations`).
