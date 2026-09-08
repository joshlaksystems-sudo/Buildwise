# IBim Security and Testing Contract

This document is a release gate, not an aspirational checklist.

## Identity and authorization

- Every protected request must carry a short-lived JWT and resolve an active organization membership from PostgreSQL.
- The organization ID in a token is never trusted without a current membership lookup.
- All business queries must include the authenticated organization ID.
- `ADMIN`, `STAFF_DETAILER`, `CLIENT`, and `ENGINEER_TRAINEE` permissions are explicit policy checks.
- Password hashes, refresh-token hashes, payment secrets, and private license signing material never appear in API DTOs or logs.
- Login, registration, password reset, and provider webhook routes require rate limits and structured audit events before production enablement.
- The current increment implements login, registration rate limiting, and security headers; password reset, email verification, refresh-token rotation, session revocation, audit persistence, and provider webhook verification remain release blockers.

## Masking cases

Test every field for every role, including null, empty, short, malformed, and long values:

- Admin sees authorized full email, phone, and license key.
- Internal detailer sees partially masked contact values and formatted license key.
- Client and trainee see anonymized contact values and a SHA-256 license fingerprint.
- Unknown roles fail closed to the most restrictive representation.
- Nested arrays and DTOs are mapped explicitly; generic object spreading is prohibited for sensitive entities.

## ACID and idempotency cases

- Registration creates user, organization, and membership atomically.
- Duplicate email registration returns a conflict without a partial organization.
- Duplicate provider webhook events produce one payment state transition.
- A failed license issuance rolls back only the local transaction and leaves the external payment reconciliable.
- BigQuery outage does not fail a PostgreSQL transaction; the outbox event remains retryable.
- Concurrent time entries cannot double-count the same idempotency key.
- Project and task edits use optimistic `version` checks; stale clients receive a conflict instead of overwriting a newer update.
- Serializable transactions retry PostgreSQL serialization conflicts a bounded number of times and then fail visibly.
- Outbox rows have a deterministic dedupe key so an integration worker can retry safely.
- Organization A cannot read, mutate, or infer Organization B records by changing route IDs or headers.
- Deleted users cannot authenticate through previously issued tokens after membership/session revocation.
- Two simultaneous submissions of the same time-entry idempotency key return one persisted entry and increment totals once.
- Two different time entries submitted simultaneously both contribute exactly once to task and project totals.
- A task ID from another organization returns `404` and creates no time entry or outbox event.
- A BigQuery publisher crash before acknowledgement republishes the same `dedupeKey` without duplicating the analytical fact.
- Vertex AI disabled, malformed credentials, provider timeout, empty response, quota failure, and model permission failure return controlled errors without exposing credentials or provider internals.
- Copilot prompts are capped, rate-limited, organization-authenticated, and do not include unrelated organization records.

## Release commands

```powershell
Set-Location .\ibim-app\backend
npm install
npx prisma validate
npx prisma generate
npm run typecheck
npm run build

Set-Location ..\frontend
npm install
npm run typecheck
npm run build

Set-Location ..\..
 git diff --check
```

Deployment must run migrations, health checks, API contract tests, authorization tests, webhook replay tests, and a smoke test against the deployed frontend and backend before traffic is enabled.
