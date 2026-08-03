/*
  Warnings:

  - You are about to drop the column `customHighlights` on the `properties` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "properties" DROP COLUMN "customHighlights";

-- CreateIndex
CREATE INDEX "contacts_createdAt_idx" ON "contacts"("createdAt");

-- CreateIndex
CREATE INDEX "tasks_contactId_idx" ON "tasks"("contactId");

-- CreateIndex
CREATE INDEX "tasks_propertyId_idx" ON "tasks"("propertyId");

-- CreateIndex
CREATE INDEX "visits_contactId_idx" ON "visits"("contactId");

-- CreateIndex
CREATE INDEX "visits_propertyId_idx" ON "visits"("propertyId");

-- CreateIndex
CREATE INDEX "visits_brokerUserId_idx" ON "visits"("brokerUserId");
