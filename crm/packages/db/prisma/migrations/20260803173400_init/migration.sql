-- CreateEnum
CREATE TYPE "ReasonRequirement" AS ENUM ('NONE', 'LOSS', 'PAUSE');

-- CreateEnum
CREATE TYPE "ContactOrigin" AS ENUM ('META_LEAD_ADS', 'SITE', 'WHATSAPP', 'MANUAL', 'IMPORTACAO', 'INDICACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ContactTemperature" AS ENUM ('QUENTE', 'MORNO', 'FRIO');

-- CreateEnum
CREATE TYPE "ContactIntent" AS ENUM ('COMPRA', 'VENDA', 'LOCACAO', 'INVESTIMENTO');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AUTOMATION', 'INTEGRATION', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PropertySourceSystem" AS ENUM ('CRM', 'EMOVEL');

-- CreateEnum
CREATE TYPE "PropertyPurpose" AS ENUM ('VENDA', 'LOCACAO', 'AMBAS');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('AGUARDANDO_CONFIRMACAO', 'CONFIRMADA', 'REAGENDADA', 'REALIZADA', 'CANCELADA_CLIENTE', 'CANCELADA_CORRETOR', 'CLIENTE_NAO_COMPARECEU', 'PROPRIETARIO_INDISPONIVEL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('EM_ELABORACAO', 'ENVIADA', 'VISUALIZADA', 'EM_ANALISE', 'CONTRAPROPOSTA', 'ACEITA', 'RECUSADA', 'EXPIRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('META', 'WHATSAPP', 'GOOGLE', 'EMOVEL');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "image" TEXT,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresReasonOn" "ReasonRequirement" NOT NULL DEFAULT 'NONE',
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT,
    "birthDate" TIMESTAMP(3),
    "maritalStatus" TEXT,
    "profession" TEXT,
    "notes" TEXT,
    "origin" "ContactOrigin" NOT NULL DEFAULT 'MANUAL',
    "campaign" TEXT,
    "adSet" TEXT,
    "ad" TEXT,
    "metaFormId" TEXT,
    "metaLeadId" TEXT,
    "sourcePropertyId" TEXT,
    "ownerUserId" TEXT,
    "stageId" TEXT,
    "temperature" "ContactTemperature" NOT NULL DEFAULT 'MORNO',
    "probabilityPct" INTEGER,
    "potentialValue" DECIMAL(14,2),
    "lossReason" TEXT,
    "pauseReason" TEXT,
    "firstContactAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "nextContactAt" TIMESTAMP(3),
    "duplicateOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_preferences" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "intent" "ContactIntent",
    "propertyType" TEXT,
    "region" TEXT,
    "zone" TEXT,
    "desiredNeighborhoods" TEXT[],
    "desiredCondos" TEXT[],
    "bedrooms" INTEGER,
    "suites" INTEGER,
    "parkingSpots" INTEGER,
    "needsBackyard" BOOLEAN,
    "needsGourmetArea" BOOLEAN,
    "houseFormat" TEXT,
    "condoOrOpen" TEXT,
    "newOrUsed" TEXT,
    "minPrice" DECIMAL(14,2),
    "maxPrice" DECIMAL(14,2),
    "acceptsRenovation" BOOLEAN,
    "purchaseDeadline" TEXT,
    "priority" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_financial_info" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "individualIncome" DECIMAL(14,2),
    "householdIncome" DECIMAL(14,2),
    "downPaymentAvailable" DECIMAL(14,2),
    "fgtsBalanceApprox" DECIMAL(14,2),
    "ownsProperty" BOOLEAN,
    "hasActiveFinancing" BOOLEAN,
    "paymentMethod" TEXT,
    "preferredBank" TEXT,
    "creditAnalysisStatus" TEXT,
    "approvedAmount" DECIMAL(14,2),
    "approvalValidUntil" TIMESTAMP(3),
    "pendingDocuments" TEXT,
    "restrictedNotes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_financial_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_stage_history" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "changedByType" "ActorType" NOT NULL DEFAULT 'USER',
    "changedByUserId" TEXT,
    "comment" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "externalRef" TEXT,
    "sourceSystem" "PropertySourceSystem" NOT NULL DEFAULT 'CRM',
    "syncStatus" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "purpose" "PropertyPurpose" NOT NULL DEFAULT 'VENDA',
    "propertyType" TEXT NOT NULL,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "responsibleUserId" TEXT,
    "capturedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "inactivatedAt" TIMESTAMP(3),
    "inactivationReason" TEXT,
    "addressLine" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Sorocaba',
    "state" TEXT NOT NULL DEFAULT 'SP',
    "zipCode" TEXT,
    "condoName" TEXT,
    "cityZone" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "hideExactAddress" BOOLEAN NOT NULL DEFAULT false,
    "salePrice" DECIMAL(14,2),
    "rentPrice" DECIMAL(14,2),
    "condoFee" DECIMAL(14,2),
    "iptu" DECIMAL(14,2),
    "landArea" DECIMAL(10,2),
    "builtArea" DECIMAL(10,2),
    "usableArea" DECIMAL(10,2),
    "bedrooms" INTEGER,
    "suites" INTEGER,
    "bathrooms" INTEGER,
    "lavatories" INTEGER,
    "coveredParking" INTEGER,
    "uncoveredParking" INTEGER,
    "yearBuilt" INTEGER,
    "furnished" BOOLEAN NOT NULL DEFAULT false,
    "hasClosets" BOOLEAN NOT NULL DEFAULT false,
    "hasPool" BOOLEAN NOT NULL DEFAULT false,
    "hasGourmetArea" BOOLEAN NOT NULL DEFAULT false,
    "hasBarbecue" BOOLEAN NOT NULL DEFAULT false,
    "hasBackyard" BOOLEAN NOT NULL DEFAULT false,
    "hasOffice" BOOLEAN NOT NULL DEFAULT false,
    "hasElevator" BOOLEAN NOT NULL DEFAULT false,
    "hasSolarEnergy" BOOLEAN NOT NULL DEFAULT false,
    "hasAirConditioning" BOOLEAN NOT NULL DEFAULT false,
    "hasSecurity" BOOLEAN NOT NULL DEFAULT false,
    "acceptsFinancing" BOOLEAN NOT NULL DEFAULT true,
    "acceptsFgts" BOOLEAN NOT NULL DEFAULT true,
    "acceptsTrade" BOOLEAN NOT NULL DEFAULT false,
    "legalStatus" TEXT,
    "registrationNumber" TEXT,
    "hasAverbacao" BOOLEAN,
    "hasHabiteSe" BOOLEAN,
    "legalNotes" TEXT,
    "customHighlights" TEXT[],
    "title" TEXT,
    "shortDescription" TEXT,
    "fullDescription" TEXT,
    "highlights" TEXT[],
    "coverPhotoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_photos" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_documents" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "property_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_price_history" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "salePrice" DECIMAL(14,2),
    "rentPrice" DECIMAL(14,2),
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_status_history" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "document" TEXT,
    "bankDataEncrypted" TEXT,
    "adAuthorization" BOOLEAN NOT NULL DEFAULT false,
    "intermediationContract" BOOLEAN NOT NULL DEFAULT false,
    "agreedCommissionPct" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_owners" (
    "propertyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownershipPercent" DECIMAL(5,2),

    CONSTRAINT "property_owners_pkey" PRIMARY KEY ("propertyId","ownerId")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "brokerUserId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "meetingPoint" TEXT,
    "notes" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'AGUARDANDO_CONFIRMACAO',
    "clientConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "ownerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "outcomeNotes" TEXT,
    "clientRating" INTEGER,
    "rejectionReason" TEXT,
    "nextAction" TEXT,
    "googleCalendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contactId" TEXT,
    "propertyId" TEXT,
    "assignedUserId" TEXT NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIA',
    "dueAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDENTE',
    "taskType" TEXT NOT NULL,
    "reminderAt" TIMESTAMP(3),
    "recurrenceRule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "listedPrice" DECIMAL(14,2),
    "proposedPrice" DECIMAL(14,2) NOT NULL,
    "downPayment" DECIMAL(14,2),
    "financing" DECIMAL(14,2),
    "fgts" DECIMAL(14,2),
    "trade" TEXT,
    "creditLetter" DECIMAL(14,2),
    "termDays" INTEGER,
    "conditions" TEXT,
    "validUntil" TIMESTAMP(3),
    "commissionPct" DECIMAL(5,2),
    "notes" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'EM_ELABORACAO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_versions" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "proposedPrice" DECIMAL(14,2) NOT NULL,
    "conditions" TEXT,
    "note" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "documentUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'em_andamento',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "totalValue" DECIMAL(14,2) NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'prevista',
    "paymentMethod" TEXT,
    "proofUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_splits" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "recipientLabel" TEXT NOT NULL,
    "userId" TEXT,
    "percentage" DECIMAL(5,2) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "commission_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financing_checklist_items" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT,
    "contactId" TEXT,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "responsibleUserId" TEXT,
    "documentUrl" TEXT,
    "validUntil" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financing_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTestMode" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "triggeredBy" JSONB NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_logs" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_accounts" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "label" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'desconectado',
    "config" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "calendarId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "google_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recebido',
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "costEstimate" DECIMAL(10,4),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'sistema',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pre_visualizacao',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "columnMapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_errors" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "rawData" JSONB,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "actorUserId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_order_key" ON "pipeline_stages"("order");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_metaLeadId_key" ON "contacts"("metaLeadId");

-- CreateIndex
CREATE INDEX "contacts_phone_idx" ON "contacts"("phone");

-- CreateIndex
CREATE INDEX "contacts_whatsapp_idx" ON "contacts"("whatsapp");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE INDEX "contacts_stageId_idx" ON "contacts"("stageId");

-- CreateIndex
CREATE INDEX "contacts_ownerUserId_idx" ON "contacts"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_tags_contactId_label_key" ON "contact_tags"("contactId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "contact_preferences_contactId_key" ON "contact_preferences"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_financial_info_contactId_key" ON "contact_financial_info"("contactId");

-- CreateIndex
CREATE INDEX "contact_stage_history_contactId_idx" ON "contact_stage_history"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "properties_internalCode_key" ON "properties"("internalCode");

-- CreateIndex
CREATE INDEX "properties_city_neighborhood_idx" ON "properties"("city", "neighborhood");

-- CreateIndex
CREATE INDEX "properties_propertyType_idx" ON "properties"("propertyType");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- CreateIndex
CREATE UNIQUE INDEX "matches_contactId_propertyId_key" ON "matches"("contactId", "propertyId");

-- CreateIndex
CREATE INDEX "visits_scheduledAt_idx" ON "visits"("scheduledAt");

-- CreateIndex
CREATE INDEX "tasks_assignedUserId_status_idx" ON "tasks"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "tasks_dueAt_idx" ON "tasks"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_proposalId_key" ON "contracts"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "google_accounts_userId_key" ON "google_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_externalId_key" ON "webhook_events"("provider", "externalId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_sourcePropertyId_fkey" FOREIGN KEY ("sourcePropertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_preferences" ADD CONSTRAINT "contact_preferences_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_financial_info" ADD CONSTRAINT "contact_financial_info_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_stage_history" ADD CONSTRAINT "contact_stage_history_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_stage_history" ADD CONSTRAINT "contact_stage_history_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_stage_history" ADD CONSTRAINT "contact_stage_history_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_price_history" ADD CONSTRAINT "property_price_history_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_status_history" ADD CONSTRAINT "property_status_history_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_brokerUserId_fkey" FOREIGN KEY ("brokerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "commissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "automation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_accounts" ADD CONSTRAINT "google_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
