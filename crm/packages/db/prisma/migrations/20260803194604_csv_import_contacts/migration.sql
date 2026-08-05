-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('CONTACTS');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('RASCUNHO', 'PROCESSANDO', 'CONCLUIDO', 'CONCLUIDO_PARCIAL', 'FALHA', 'DESFEITO', 'DESFEITO_PARCIAL');

-- CreateEnum
CREATE TYPE "ImportStrategy" AS ENUM ('CRIAR_SOMENTE_NOVOS', 'CRIAR_E_COMPLETAR', 'CRIAR_E_ATUALIZAR', 'IGNORAR_DUPLICADOS');

-- CreateEnum
CREATE TYPE "ImportRowValidationStatus" AS ENUM ('VALIDA', 'VALIDA_COM_AVISO', 'INVALIDA', 'DUPLICADA', 'CONFLITO_ATUALIZACAO');

-- CreateEnum
CREATE TYPE "ImportRowAction" AS ENUM ('PENDENTE', 'CRIAR', 'ATUALIZAR', 'IGNORAR', 'CRIAR_DUPLICADO', 'ERRO');

-- DropForeignKey
ALTER TABLE "import_errors" DROP CONSTRAINT "import_errors_importJobId_fkey";

-- AlterTable
ALTER TABLE "import_jobs" DROP COLUMN "columnMapping",
DROP COLUMN "entity",
DROP COLUMN "errorRows",
DROP COLUMN "successRows",
ADD COLUMN     "createdRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorSummary" JSONB,
ADD COLUMN     "failedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fileHash" TEXT NOT NULL,
ADD COLUMN     "fileSize" INTEGER NOT NULL,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "invalidRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mapping" JSONB,
ADD COLUMN     "skippedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "strategy" "ImportStrategy",
ADD COLUMN     "type" "ImportType" NOT NULL DEFAULT 'CONTACTS',
ADD COLUMN     "updatedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "validRows" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "status",
ADD COLUMN     "status" "ImportJobStatus" NOT NULL DEFAULT 'RASCUNHO';

-- DropTable
DROP TABLE "import_errors";

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "originalData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "validationStatus" "ImportRowValidationStatus" NOT NULL,
    "validationErrors" JSONB,
    "duplicateMatch" JSONB,
    "action" "ImportRowAction" NOT NULL DEFAULT 'PENDENTE',
    "targetEntityId" TEXT,
    "preUpdateSnapshot" JSONB,
    "rolledBackAt" TIMESTAMP(3),
    "rollbackBlockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_rows_importJobId_validationStatus_idx" ON "import_rows"("importJobId", "validationStatus");

-- CreateIndex
CREATE INDEX "import_rows_targetEntityId_idx" ON "import_rows"("targetEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_importJobId_rowNumber_key" ON "import_rows"("importJobId", "rowNumber");

-- CreateIndex
CREATE INDEX "import_jobs_fileHash_idx" ON "import_jobs"("fileHash");

-- CreateIndex
CREATE INDEX "import_jobs_importedByUserId_idx" ON "import_jobs"("importedByUserId");

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

