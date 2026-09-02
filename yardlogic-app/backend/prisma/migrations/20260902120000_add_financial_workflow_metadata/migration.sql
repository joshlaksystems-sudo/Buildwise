ALTER TABLE "Invoice" ADD COLUMN "customerName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "customerPhone" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "customerEmail" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "followUpDate" TIMESTAMP(3);

ALTER TABLE "Expense" ADD COLUMN "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Expense" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN "recurrenceFrequency" TEXT;
ALTER TABLE "Expense" ADD COLUMN "referenceNumber" TEXT;

ALTER TABLE "PaymentReminder" ADD COLUMN "scheduledFor" TIMESTAMP(3);

CREATE INDEX "Invoice_businessId_followUpDate_idx" ON "Invoice"("businessId", "followUpDate");
CREATE INDEX "Expense_businessId_paymentDate_idx" ON "Expense"("businessId", "paymentDate");
CREATE INDEX "PaymentReminder_businessId_scheduledFor_idx" ON "PaymentReminder"("businessId", "scheduledFor");