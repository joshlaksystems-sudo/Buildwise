-- Prevent repeated client submissions from creating duplicate documents.
ALTER TABLE "Invoice" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "DeliveryChallan" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Invoice_clientRequestId_key" ON "Invoice"("clientRequestId");
CREATE UNIQUE INDEX "Estimate_clientRequestId_key" ON "Estimate"("clientRequestId");
CREATE UNIQUE INDEX "PurchaseBill_clientRequestId_key" ON "PurchaseBill"("clientRequestId");
CREATE UNIQUE INDEX "DeliveryChallan_clientRequestId_key" ON "DeliveryChallan"("clientRequestId");
