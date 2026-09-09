CREATE TABLE IF NOT EXISTS "IbimProspect" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "memberId" TEXT,
  "policyId" TEXT,
  "companyName" TEXT NOT NULL,
  "email" TEXT,
  "renewalDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'IMPORTED',
  "lastContactedAt" TIMESTAMP(3),
  "responseAt" TIMESTAMP(3),
  "lostReason" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimProspect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IbimProspect_businessId_companyName_renewalDate_key" UNIQUE ("businessId", "companyName", "renewalDate")
);
CREATE TABLE IF NOT EXISTS "IbimPayment" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "memberId" TEXT,
  "policyId" TEXT,
  "amountDue" DECIMAL(12,2) NOT NULL,
  "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "dueDate" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "method" TEXT,
  "reference" TEXT,
  "financeProvider" TEXT,
  "financeAgreementNumber" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IbimPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IbimProspect_businessId_status_renewalDate_idx" ON "IbimProspect"("businessId", "status", "renewalDate");
CREATE INDEX IF NOT EXISTS "IbimPayment_businessId_status_dueDate_idx" ON "IbimPayment"("businessId", "status", "dueDate");
ALTER TABLE "IbimProspect" ADD CONSTRAINT "IbimProspect_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimProspect" ADD CONSTRAINT "IbimProspect_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "IbimMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimProspect" ADD CONSTRAINT "IbimProspect_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "IbimPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimPayment" ADD CONSTRAINT "IbimPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IbimPayment" ADD CONSTRAINT "IbimPayment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "IbimMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IbimPayment" ADD CONSTRAINT "IbimPayment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "IbimPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
