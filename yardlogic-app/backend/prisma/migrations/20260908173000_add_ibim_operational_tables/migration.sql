-- iBIM operational model: versioned forms, migration evidence, and workflow history.
-- All writes remain in Neon/Postgres; BigQuery receives analytics copies only.
ALTER TABLE "IbimProposal" ADD COLUMN IF NOT EXISTS "formDefinitionId" TEXT;

CREATE TABLE IF NOT EXISTS "IbimFormDefinition" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "schema" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimFormDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimFormDefinition_businessId_type_version_key" UNIQUE ("businessId", "type", "version")
);
CREATE INDEX IF NOT EXISTS "IbimFormDefinition_businessId_type_active_idx" ON "IbimFormDefinition"("businessId", "type", "active");

CREATE TABLE IF NOT EXISTS "IbimMigrationBatch" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "accepted" INTEGER NOT NULL DEFAULT 0,
  "rejected" INTEGER NOT NULL DEFAULT 0,
  "flagged" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "IbimMigrationBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IbimMigrationBatch_businessId_startedAt_idx" ON "IbimMigrationBatch"("businessId", "startedAt");
CREATE INDEX IF NOT EXISTS "IbimMigrationBatch_businessId_status_idx" ON "IbimMigrationBatch"("businessId", "status");

CREATE TABLE IF NOT EXISTS "IbimMigrationRow" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "outcome" TEXT NOT NULL,
  "sourceData" JSONB NOT NULL,
  "memberId" TEXT,
  "issues" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IbimMigrationRow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimMigrationRow_batchId_rowNumber_key" UNIQUE ("batchId", "rowNumber")
);
CREATE INDEX IF NOT EXISTS "IbimMigrationRow_businessId_outcome_idx" ON "IbimMigrationRow"("businessId", "outcome");

CREATE TABLE IF NOT EXISTS "IbimWorkflowEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "memberId" TEXT,
  "proposalId" TEXT,
  "policyId" TEXT,
  "taskId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "actorUserId" TEXT,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IbimWorkflowEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IbimWorkflowEvent_businessId_createdAt_idx" ON "IbimWorkflowEvent"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "IbimWorkflowEvent_businessId_eventType_createdAt_idx" ON "IbimWorkflowEvent"("businessId", "eventType", "createdAt");

ALTER TABLE "IbimProposal" ADD CONSTRAINT "IbimProposal_formDefinitionId_fkey" FOREIGN KEY ("formDefinitionId") REFERENCES "IbimFormDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimFormDefinition" ADD CONSTRAINT "IbimFormDefinition_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimMigrationBatch" ADD CONSTRAINT "IbimMigrationBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimMigrationRow" ADD CONSTRAINT "IbimMigrationRow_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimMigrationRow" ADD CONSTRAINT "IbimMigrationRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IbimMigrationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IbimMigrationRow" ADD CONSTRAINT "IbimMigrationRow_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "IbimMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowEvent" ADD CONSTRAINT "IbimWorkflowEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowEvent" ADD CONSTRAINT "IbimWorkflowEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "IbimMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowEvent" ADD CONSTRAINT "IbimWorkflowEvent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "IbimProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowEvent" ADD CONSTRAINT "IbimWorkflowEvent_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "IbimPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowEvent" ADD CONSTRAINT "IbimWorkflowEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "IbimWorkflowTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
