-- Remove credential material from the analytics projection.
-- PostgreSQL remains the authentication source of truth; BigQuery must never store password hashes.
ALTER TABLE `YOUR_PROJECT.khatabook.users`
DROP COLUMN IF EXISTS password_hash;
