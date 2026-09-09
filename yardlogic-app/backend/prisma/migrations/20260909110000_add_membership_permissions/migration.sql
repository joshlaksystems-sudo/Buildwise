CREATE TABLE IF NOT EXISTS "UserBusinessPermission" (
  "id" TEXT NOT NULL,
  "userBusinessId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBusinessPermission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserBusinessPermission_userBusinessId_permission_key" UNIQUE ("userBusinessId", "permission")
);
CREATE INDEX IF NOT EXISTS "UserBusinessPermission_permission_idx" ON "UserBusinessPermission"("permission");
ALTER TABLE "UserBusinessPermission" ADD CONSTRAINT "UserBusinessPermission_userBusinessId_fkey" FOREIGN KEY ("userBusinessId") REFERENCES "UserBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;
