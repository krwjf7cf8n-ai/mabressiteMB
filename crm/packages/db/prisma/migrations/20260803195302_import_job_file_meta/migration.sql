-- AlterTable
ALTER TABLE "import_jobs" ADD COLUMN     "delimiter" TEXT,
ADD COLUMN     "hadBom" BOOLEAN NOT NULL DEFAULT false;

