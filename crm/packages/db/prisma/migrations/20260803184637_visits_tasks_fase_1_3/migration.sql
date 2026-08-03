/*
  Warnings:

  - You are about to drop the column `notes` on the `visits` table. All the data in the column will be lost.
  - Added the required column `createdByUserId` to the `tasks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdByUserId` to the `visits` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VisitModality" AS ENUM ('PRESENCIAL', 'VIDEO');

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('MANUAL', 'VISITA', 'AUTOMACAO', 'INTEGRACAO');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedByUserId" TEXT,
ADD COLUMN     "createdByUserId" TEXT NOT NULL,
ADD COLUMN     "origin" "TaskOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "proposalId" TEXT,
ADD COLUMN     "visitId" TEXT;

-- AlterTable
ALTER TABLE "visits" DROP COLUMN "notes",
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "clientInstructions" TEXT,
ADD COLUMN     "createdByUserId" TEXT NOT NULL,
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "intendsToPropose" BOOLEAN,
ADD COLUMN     "interestLevel" TEXT,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "modality" "VisitModality" NOT NULL DEFAULT 'PRESENCIAL',
ADD COLUMN     "needsFinancingReview" BOOLEAN,
ADD COLUMN     "objections" TEXT,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "positivePoints" TEXT,
ADD COLUMN     "recommendedReturnAt" TIMESTAMP(3),
ADD COLUMN     "rescheduleReason" TEXT,
ADD COLUMN     "scheduleConflictNote" TEXT,
ADD COLUMN     "wantsToSeeOtherProperties" BOOLEAN;

-- CreateTable
CREATE TABLE "visit_status_history" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "fromStatus" "VisitStatus",
    "toStatus" "VisitStatus" NOT NULL,
    "previousScheduledAt" TIMESTAMP(3),
    "previousContactId" TEXT,
    "previousPropertyId" TEXT,
    "previousBrokerUserId" TEXT,
    "reason" TEXT,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visit_status_history_visitId_idx" ON "visit_status_history"("visitId");

-- CreateIndex
CREATE INDEX "tasks_visitId_idx" ON "tasks"("visitId");

-- CreateIndex
CREATE INDEX "visits_brokerUserId_scheduledAt_idx" ON "visits"("brokerUserId", "scheduledAt");

-- CreateIndex
CREATE INDEX "visits_contactId_scheduledAt_idx" ON "visits"("contactId", "scheduledAt");

-- CreateIndex
CREATE INDEX "visits_propertyId_scheduledAt_idx" ON "visits"("propertyId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_status_history" ADD CONSTRAINT "visit_status_history_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
