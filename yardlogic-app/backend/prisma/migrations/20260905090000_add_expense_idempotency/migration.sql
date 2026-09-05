ALTER TABLE "Expense" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "Expense_clientRequestId_key" ON "Expense"("clientRequestId");