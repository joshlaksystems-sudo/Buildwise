CREATE TABLE IF NOT EXISTS "IbimEmailDelivery" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "memberId" TEXT,
  "proposalId" TEXT,
  "taskId" TEXT,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "providerRef" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "IbimEmailDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IbimEmailDelivery_businessId_status_sentAt_idx" ON "IbimEmailDelivery"("businessId", "status", "sentAt");
CREATE INDEX IF NOT EXISTS "IbimEmailDelivery_businessId_memberId_sentAt_idx" ON "IbimEmailDelivery"("businessId", "memberId", "sentAt");
ALTER TABLE "IbimEmailDelivery" ADD CONSTRAINT "IbimEmailDelivery_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "IbimReconciliation" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "externalRef" TEXT,
  "policyNumber" TEXT,
  "policyId" TEXT,
  "status" TEXT NOT NULL,
  "differences" JSONB,
  "sourceData" JSONB NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IbimReconciliation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IbimReconciliation_businessId_sourceSystem_status_idx" ON "IbimReconciliation"("businessId", "sourceSystem", "status");
CREATE INDEX IF NOT EXISTS "IbimReconciliation_businessId_checkedAt_idx" ON "IbimReconciliation"("businessId", "checkedAt");
ALTER TABLE "IbimReconciliation" ADD CONSTRAINT "IbimReconciliation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimReconciliation" ADD CONSTRAINT "IbimReconciliation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "IbimPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
