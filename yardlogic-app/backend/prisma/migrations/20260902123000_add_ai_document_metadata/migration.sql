ALTER TABLE "ComplianceDocument" ADD COLUMN "aiDocumentType" TEXT;
ALTER TABLE "ComplianceDocument" ADD COLUMN "aiConfidence" DOUBLE PRECISION;
ALTER TABLE "ComplianceDocument" ADD COLUMN "extractedData" JSONB;

CREATE INDEX "ComplianceDocument_businessId_aiDocumentType_idx" ON "ComplianceDocument"("businessId", "aiDocumentType");