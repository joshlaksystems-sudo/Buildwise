CREATE TABLE IF NOT EXISTS "IbimRebateFund" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "rebateYear" INTEGER NOT NULL,
  "totalPot" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimRebateFund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimRebateFund_businessId_rebateYear_key" UNIQUE ("businessId", "rebateYear")
);
CREATE TABLE IF NOT EXISTS "IbimRebateAllocation" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "entitlement" DECIMAL(12,2) NOT NULL,
  "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OUTSTANDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimRebateAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimRebateAllocation_fundId_memberId_key" UNIQUE ("fundId", "memberId")
);
CREATE TABLE IF NOT EXISTS "IbimRebatePayment" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" TEXT,
  CONSTRAINT "IbimRebatePayment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "IbimBudget" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "budgetYear" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimBudget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimBudget_businessId_budgetYear_key" UNIQUE ("businessId", "budgetYear")
);
CREATE TABLE IF NOT EXISTS "IbimBudgetLine" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "target" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "IbimBudgetLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimBudgetLine_budgetId_category_month_key" UNIQUE ("budgetId", "category", "month")
);
CREATE TABLE IF NOT EXISTS "IbimBordereauxPeriod" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimBordereauxPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimBordereauxPeriod_businessId_year_month_key" UNIQUE ("businessId", "year", "month")
);
CREATE TABLE IF NOT EXISTS "IbimBordereauxRow" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "proposalId" TEXT,
  "businessType" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IbimBordereauxRow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimBordereauxRow_periodId_policyId_key" UNIQUE ("periodId", "policyId")
);
CREATE TABLE IF NOT EXISTS "IbimAutomationRun" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "runKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IbimAutomationRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimAutomationRun_businessId_jobType_runKey_key" UNIQUE ("businessId", "jobType", "runKey")
);
CREATE INDEX IF NOT EXISTS "IbimRebateAllocation_businessId_status_idx" ON "IbimRebateAllocation"("businessId", "status");
CREATE INDEX IF NOT EXISTS "IbimRebatePayment_businessId_paidAt_idx" ON "IbimRebatePayment"("businessId", "paidAt");
CREATE INDEX IF NOT EXISTS "IbimBudgetLine_businessId_category_month_idx" ON "IbimBudgetLine"("businessId", "category", "month");
CREATE INDEX IF NOT EXISTS "IbimBordereauxRow_businessId_businessType_idx" ON "IbimBordereauxRow"("businessId", "businessType");
CREATE INDEX IF NOT EXISTS "IbimAutomationRun_businessId_jobType_createdAt_idx" ON "IbimAutomationRun"("businessId", "jobType", "createdAt");
ALTER TABLE "IbimRebateFund" ADD CONSTRAINT "IbimRebateFund_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimRebateAllocation" ADD CONSTRAINT "IbimRebateAllocation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimRebateAllocation" ADD CONSTRAINT "IbimRebateAllocation_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "IbimRebateFund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IbimRebateAllocation" ADD CONSTRAINT "IbimRebateAllocation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "IbimMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimRebatePayment" ADD CONSTRAINT "IbimRebatePayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimRebatePayment" ADD CONSTRAINT "IbimRebatePayment_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "IbimRebateAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IbimBudget" ADD CONSTRAINT "IbimBudget_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimBudgetLine" ADD CONSTRAINT "IbimBudgetLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimBudgetLine" ADD CONSTRAINT "IbimBudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "IbimBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IbimBordereauxPeriod" ADD CONSTRAINT "IbimBordereauxPeriod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimBordereauxRow" ADD CONSTRAINT "IbimBordereauxRow_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimBordereauxRow" ADD CONSTRAINT "IbimBordereauxRow_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "IbimBordereauxPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IbimBordereauxRow" ADD CONSTRAINT "IbimBordereauxRow_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "IbimPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimBordereauxRow" ADD CONSTRAINT "IbimBordereauxRow_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "IbimProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimAutomationRun" ADD CONSTRAINT "IbimAutomationRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;