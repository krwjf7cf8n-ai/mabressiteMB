/*
  Warnings:

  - Added the required column `algorithmVersion` to the `matches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `calculatedAt` to the `matches` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "contact_preferences" ADD COLUMN     "criteriaRequirements" JSONB;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "algorithmVersion" TEXT NOT NULL,
ADD COLUMN     "calculatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "eligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "eliminationReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "houseFormat" TEXT;

-- CreateIndex
CREATE INDEX "matches_contactId_eligible_score_idx" ON "matches"("contactId", "eligible", "score");

-- CreateIndex
CREATE INDEX "matches_propertyId_eligible_score_idx" ON "matches"("propertyId", "eligible", "score");
