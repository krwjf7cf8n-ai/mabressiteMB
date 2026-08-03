-- CreateEnum
CREATE TYPE "VisitEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'RESCHEDULED', 'ASSIGNEE_CHANGED', 'CLIENT_CHANGED', 'PROPERTY_CHANGED', 'CONFLICT_OVERRIDDEN', 'RESULT_RECORDED', 'CANCELLED', 'CORRECTED_BY_ADMIN');

-- DropForeignKey
ALTER TABLE "visit_status_history" DROP CONSTRAINT "visit_status_history_visitId_fkey";

-- DropTable
DROP TABLE "visit_status_history";

-- CreateTable
CREATE TABLE "visit_events" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "eventType" "VisitEventType" NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "source" "ActorType" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visit_events_visitId_idx" ON "visit_events"("visitId");

-- AddForeignKey
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

