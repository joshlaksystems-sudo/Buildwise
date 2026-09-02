-- CreateTable
CREATE TABLE "AIWallet" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIWalletTransaction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT,
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIWalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AIWallet_businessId_key" ON "AIWallet"("businessId");
CREATE UNIQUE INDEX "AIWalletTransaction_idempotencyKey_key" ON "AIWalletTransaction"("idempotencyKey");
CREATE INDEX "AIWalletTransaction_businessId_createdAt_idx" ON "AIWalletTransaction"("businessId", "createdAt");

ALTER TABLE "AIWallet" ADD CONSTRAINT "AIWallet_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIWalletTransaction" ADD CONSTRAINT "AIWalletTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIWalletTransaction" ADD CONSTRAINT "AIWalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "AIWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AIDailyUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "usageDate" DATE NOT NULL,
    "freeTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "freeChatsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIDailyUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AIDailyUsage_userId_businessId_usageDate_key" ON "AIDailyUsage"("userId", "businessId", "usageDate");
CREATE INDEX "AIDailyUsage_businessId_usageDate_idx" ON "AIDailyUsage"("businessId", "usageDate");
ALTER TABLE "AIDailyUsage" ADD CONSTRAINT "AIDailyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIDailyUsage" ADD CONSTRAINT "AIDailyUsage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;