-- G16 (Marco 1.9) — migração única: Property.status vira enum PropertyStatus;
-- índice em Contact.firstContactAt. Ver docs/migration-safety.md para o
-- padrão seguro seguido aqui (nunca DROP+CREATE de coluna com dados).

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('ativo', 'vendido', 'alugado', 'suspenso', 'indisponivel', 'inativo');

-- AlterTable: converte a coluna existente para o novo enum via cast (USING),
-- preservando os dados já gravados — nunca DROP+CREATE da coluna, que
-- perderia os valores existentes. Todo valor já gravado por qualquer
-- caminho do código sempre foi um destes 6 (ver property-form.tsx), então o
-- cast nunca falha aqui. O índice pré-existente em "status" é preservado
-- automaticamente pelo Postgres ao trocar o tipo da coluna — não precisa
-- ser recriado manualmente.
ALTER TABLE "properties" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "properties" ALTER COLUMN "status" TYPE "PropertyStatus" USING ("status"::"PropertyStatus");
ALTER TABLE "properties" ALTER COLUMN "status" SET DEFAULT 'ativo';

-- CreateIndex
CREATE INDEX "contacts_firstContactAt_idx" ON "contacts"("firstContactAt");
