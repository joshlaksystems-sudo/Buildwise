CREATE TYPE "ProjectStatus" AS ENUM ('LEAD', 'IN_PROGRESS', 'REVISION_REQUESTED', 'COMPLETED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INACTIVE');

CREATE TABLE "Project" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "clientId" TEXT, "title" TEXT NOT NULL,
  "projectType" TEXT NOT NULL, "status" "ProjectStatus" NOT NULL DEFAULT 'LEAD',
  "estimatedHours" DOUBLE PRECISION NOT NULL, "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Task" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "assigneeId" TEXT, "title" TEXT NOT NULL,
  "hoursLogged" DOUBLE PRECISION NOT NULL DEFAULT 0, "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TimeEntry" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL,
  "minutes" INTEGER NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "businessId" TEXT NOT NULL, "provider" TEXT NOT NULL DEFAULT 'STRIPE',
  "providerCustomerId" TEXT, "providerSubscriptionId" TEXT, "plan" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING', "currentPeriodEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BillingEvent" (
  "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL, "payload" JSONB NOT NULL, "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TimeEntry_businessId_idempotencyKey_key" ON "TimeEntry"("businessId", "idempotencyKey");
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE UNIQUE INDEX "BillingEvent_providerEventId_key" ON "BillingEvent"("providerEventId");
CREATE INDEX "Project_businessId_status_idx" ON "Project"("businessId", "status");
CREATE INDEX "Task_projectId_isCompleted_idx" ON "Task"("projectId", "isCompleted");
CREATE INDEX "TimeEntry_businessId_startedAt_idx" ON "TimeEntry"("businessId", "startedAt");
CREATE INDEX "Subscription_businessId_status_idx" ON "Subscription"("businessId", "status");
CREATE INDEX "BillingEvent_provider_eventType_createdAt_idx" ON "BillingEvent"("provider", "eventType", "createdAt");
ALTER TABLE "Project" ADD CONSTRAINT "Project_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;