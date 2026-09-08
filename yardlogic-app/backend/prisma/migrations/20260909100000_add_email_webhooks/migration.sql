-- AddTable IbimEmailWebhookEvent
CREATE TABLE "IbimEmailWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IbimEmailWebhookEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "IbimEmailDelivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AddIndex
CREATE INDEX "IbimEmailWebhookEvent_deliveryId_processedAt_idx" ON "IbimEmailWebhookEvent"("deliveryId", "processedAt");

-- AddIndex
CREATE INDEX "IbimEmailWebhookEvent_provider_eventType_idx" ON "IbimEmailWebhookEvent"("provider", "eventType");

CREATE UNIQUE INDEX "IbimEmailWebhookEvent_provider_providerEventId_key" ON "IbimEmailWebhookEvent"("provider", "providerEventId");

-- AddIndex to IbimEmailDelivery for faster webhook lookups
CREATE INDEX "IbimEmailDelivery_providerRef_idx" ON "IbimEmailDelivery"("providerRef");
