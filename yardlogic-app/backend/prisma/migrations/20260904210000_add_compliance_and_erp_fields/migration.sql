-- Additive production migration for compliance, governance, and ERP extensions.
-- All changes are nullable/defaulted so existing production rows remain valid.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "stateCode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "placeOfSupplyStateCode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cgstTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "sgstTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "igstTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "lockReason" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseBillItem" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT;
ALTER TABLE "PurchaseBillItem" ADD COLUMN IF NOT EXISTS "itcEligible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PurchaseBillItem" ADD COLUMN IF NOT EXISTS "itcBlockedReason" TEXT;

CREATE TABLE IF NOT EXISTS "ProductCategory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductCategory_businessId_parentId_idx" ON "ProductCategory"("businessId", "parentId");

CREATE TABLE IF NOT EXISTS "StockReservation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockReservation_businessId_itemId_entityType_entityId_idx" ON "StockReservation"("businessId", "itemId", "entityType", "entityId");

CREATE TABLE IF NOT EXISTS "StockLedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION DEFAULT 0,
    "reason" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockLedgerEntry_businessId_itemId_createdAt_idx" ON "StockLedgerEntry"("businessId", "itemId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockLedgerEntry_businessId_warehouseId_createdAt_idx" ON "StockLedgerEntry"("businessId", "warehouseId", "createdAt");

CREATE TABLE IF NOT EXISTS "StockAudit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "itemId" TEXT NOT NULL,
    "countedQty" DOUBLE PRECISION NOT NULL,
    "systemQty" DOUBLE PRECISION NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockAudit_businessId_status_createdAt_idx" ON "StockAudit"("businessId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "RecurringInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "number" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecurringInvoice_businessId_number_key" ON "RecurringInvoice"("businessId", "number");

CREATE TABLE IF NOT EXISTS "RecurringInvoiceItem" (
    "id" TEXT NOT NULL,
    "recurringInvoiceId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "RecurringInvoiceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecurringInvoiceItem_recurringInvoiceId_idx" ON "RecurringInvoiceItem"("recurringInvoiceId");

CREATE TABLE IF NOT EXISTS "CurrencyRate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'INR',
    "target" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CurrencyRate_businessId_target_asOf_idx" ON "CurrencyRate"("businessId", "target", "asOf");

CREATE TABLE IF NOT EXISTS "StaffAttendance" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffAttendance_businessId_userId_date_key" ON "StaffAttendance"("businessId", "userId", "date");
CREATE INDEX IF NOT EXISTS "StaffAttendance_businessId_date_idx" ON "StaffAttendance"("businessId", "date");

CREATE TABLE IF NOT EXISTS "CommissionEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommissionEntry_businessId_userId_createdAt_idx" ON "CommissionEntry"("businessId", "userId", "createdAt");

CREATE TABLE IF NOT EXISTS "TdsEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "vendorId" TEXT,
    "type" TEXT NOT NULL,
    "section" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION,
    "deductionDate" TIMESTAMP(3),
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TdsEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TdsEntry_businessId_deductionDate_idx" ON "TdsEntry"("businessId", "deductionDate");

CREATE TABLE IF NOT EXISTS "FixedAsset" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "cost" DOUBLE PRECISION NOT NULL,
    "salvageValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usefulLifeYears" INTEGER,
    "depreciationMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FixedAsset_businessId_status_idx" ON "FixedAsset"("businessId", "status");

CREATE TABLE IF NOT EXISTS "FixedAssetDepreciation" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FixedAssetDepreciation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FixedAssetDepreciation_assetId_period_idx" ON "FixedAssetDepreciation"("assetId", "period");

CREATE TABLE IF NOT EXISTS "CustomerPortalSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPortalSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPortalSession_token_key" ON "CustomerPortalSession"("token");
CREATE INDEX IF NOT EXISTS "CustomerPortalSession_businessId_customerId_idx" ON "CustomerPortalSession"("businessId", "customerId");

CREATE TABLE IF NOT EXISTS "AiInsight" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "score" DOUBLE PRECISION DEFAULT 0,
    "actionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiInsight_businessId_type_createdAt_idx" ON "AiInsight"("businessId", "type", "createdAt");

CREATE TABLE IF NOT EXISTS "SalesForecast" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "itemId" TEXT,
    "forecastDate" TIMESTAMP(3) NOT NULL,
    "predictedQuantity" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "method" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesForecast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SalesForecast_businessId_forecastDate_idx" ON "SalesForecast"("businessId", "forecastDate");

ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAudit" ADD CONSTRAINT "StockAudit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAudit" ADD CONSTRAINT "StockAudit_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringInvoiceItem" ADD CONSTRAINT "RecurringInvoiceItem_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CurrencyRate" ADD CONSTRAINT "CurrencyRate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TdsEntry" ADD CONSTRAINT "TdsEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPortalSession" ADD CONSTRAINT "CustomerPortalSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesForecast" ADD CONSTRAINT "SalesForecast_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
