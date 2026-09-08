-- iBIM insurance mutual foundation. Additive and safe for existing YardLogic tenants.
CREATE TABLE IF NOT EXISTS "IbimMember" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "externalRef" TEXT,
  "legalName" TEXT NOT NULL,
  "tradingName" TEXT,
  "contactName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PROSPECT',
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimMember_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IbimMember_businessId_status_idx" ON "IbimMember"("businessId", "status");
CREATE INDEX IF NOT EXISTS "IbimMember_businessId_externalRef_idx" ON "IbimMember"("businessId", "externalRef");

CREATE TABLE IF NOT EXISTS "IbimProposal" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "memberId" TEXT,
  "previousProposalId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "formVersion" TEXT,
  "data" JSONB NOT NULL,
  "validationIssues" JSONB,
  "submittedAt" TIMESTAMP(3),
  "effectiveDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IbimProposal_businessId_status_type_idx" ON "IbimProposal"("businessId", "status", "type");
CREATE INDEX IF NOT EXISTS "IbimProposal_memberId_createdAt_idx" ON "IbimProposal"("memberId", "createdAt");

CREATE TABLE IF NOT EXISTS "IbimPolicy" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "memberId" TEXT,
  "proposalId" TEXT,
  "policyNumber" TEXT NOT NULL,
  "insurerName" TEXT,
  "externalPolicyRef" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "inceptionDate" TIMESTAMP(3),
  "renewalDate" TIMESTAMP(3),
  "premium" DECIMAL(12,2),
  "commission" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimPolicy_businessId_policyNumber_key" UNIQUE ("businessId", "policyNumber")
);
CREATE INDEX IF NOT EXISTS "IbimPolicy_businessId_renewalDate_status_idx" ON "IbimPolicy"("businessId", "renewalDate", "status");

CREATE TABLE IF NOT EXISTS "IbimWorkflowTask" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "memberId" TEXT,
  "proposalId" TEXT,
  "policyId" TEXT,
  "assignedToId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3),
  "note" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimWorkflowTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IbimWorkflowTask_businessId_status_dueAt_idx" ON "IbimWorkflowTask"("businessId", "status", "dueAt");

CREATE TABLE IF NOT EXISTS "IbimTransaction" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IbimTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IbimTransaction_businessId_transactionDate_type_idx" ON "IbimTransaction"("businessId", "transactionDate", "type");

ALTER TABLE "IbimMember" ADD CONSTRAINT "IbimMember_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimProposal" ADD CONSTRAINT "IbimProposal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimProposal" ADD CONSTRAINT "IbimProposal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "IbimMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimProposal" ADD CONSTRAINT "IbimProposal_previousProposalId_fkey" FOREIGN KEY ("previousProposalId") REFERENCES "IbimProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimPolicy" ADD CONSTRAINT "IbimPolicy_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimPolicy" ADD CONSTRAINT "IbimPolicy_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "IbimMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimPolicy" ADD CONSTRAINT "IbimPolicy_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "IbimProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowTask" ADD CONSTRAINT "IbimWorkflowTask_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowTask" ADD CONSTRAINT "IbimWorkflowTask_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "IbimMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowTask" ADD CONSTRAINT "IbimWorkflowTask_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "IbimProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowTask" ADD CONSTRAINT "IbimWorkflowTask_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "IbimPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimWorkflowTask" ADD CONSTRAINT "IbimWorkflowTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimTransaction" ADD CONSTRAINT "IbimTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimTransaction" ADD CONSTRAINT "IbimTransaction_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "IbimPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
