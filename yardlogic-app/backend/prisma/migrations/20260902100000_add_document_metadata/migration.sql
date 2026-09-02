-- Additive document metadata. Existing records remain valid because all new fields are nullable.
ALTER TABLE "Invoice" ADD COLUMN "dueDate" TIMESTAMP(3), ADD COLUMN "notes" TEXT, ADD COLUMN "terms" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "validUntil" TIMESTAMP(3), ADD COLUMN "notes" TEXT, ADD COLUMN "terms" TEXT;
ALTER TABLE "DeliveryChallan" ADD COLUMN "vehicleNumber" TEXT, ADD COLUMN "transporterId" TEXT, ADD COLUMN "notes" TEXT;
