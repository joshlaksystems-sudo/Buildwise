ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "applicationId" TEXT NOT NULL DEFAULT 'UNASSIGNED';
CREATE INDEX IF NOT EXISTS "Business_applicationId_idx" ON "Business"("applicationId");
