-- Track who prepared GST data and preserve source documents by business.
ALTER TABLE "GstFiling" ADD COLUMN "preparedByUserId" TEXT;

CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "period" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageUrl" TEXT,
    "storagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ComplianceDocument_businessId_period_documentType_idx" ON "ComplianceDocument"("businessId", "period", "documentType");
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
