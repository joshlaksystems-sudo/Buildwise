# IBim ERP

IBim ERP is a separate application boundary for IBim Consulting's Tekla Structures consulting, detailing delivery, automation tools, training, recruitment, and finance workflows.

The existing YardLogic application is not modified by this project.

## Current foundation

- React 18 + TypeScript + Vite portal shell.
- Express + TypeScript API.
- Prisma schema isolated to PostgreSQL schema `ibim`.
- Organization membership roles: `ADMIN`, `STAFF_DETAILER`, `CLIENT`, `ENGINEER_TRAINEE`.
- Transactional registration and membership-aware JWT authentication.
- Server-side response masking for contact details and license keys.
- PostgreSQL outbox model for reliable BigQuery projections.
- BigQuery analytical contracts under `bigquery/schemas`.
- Concurrent time-entry writes with tenant-scoped idempotency and transactional outbox emission.

## Release status

This increment is a foundation and dashboard slice. Do not expose it as the complete ERP until the backend dependencies have been installed and the following gates pass: `prisma validate`, migration rehearsal against a disposable Neon branch, `npm test`, backend build, frontend build, organization-isolation integration tests, and authenticated smoke tests. Projects, timesheets, Stripe checkout, signed license issuance, academy, recruitment, Xero sync, and the BigQuery outbox publisher still require implementation before production feature claims are made.

## Local development

```powershell
Set-Location .\ibim-app\frontend
npm install
npm run dev

Set-Location ..\backend
npm install
Copy-Item .env.example .env
npx prisma generate
npm run dev
```

The frontend runs on `http://localhost:5175`; the API runs on `http://localhost:4100`.

## Data boundaries

PostgreSQL is the source of truth for identities, organization access, projects, delivery, payments, licenses, training, and recruitment. BigQuery receives normalized, privacy-minimized events through the outbox publisher. External providers never participate in a PostgreSQL transaction; provider callbacks are verified and reconciled idempotently.

Concurrent writes use PostgreSQL serializable transactions with bounded retries. Task and project rows carry optimistic `version` counters, while time entries use an organization-scoped idempotency key. The outbox is durable in PostgreSQL so BigQuery, Stripe, Xero, and future integration workers can retry without replaying business effects.

## Vertex AI Tekla assistant

The authenticated endpoint is `POST /ai/tekla-assistant`. It accepts `{ "prompt": "...", "teklaVersion": "Tekla 2024" }` and uses Gemini through Vertex AI. Configure these backend-only variables in Vercel or GitHub Actions:

```text
VERTEX_AI_ENABLE=true
GCP_PROJECT_ID=your-project-id
VERTEX_AI_LOCATION=australia-southeast1
VERTEX_AI_MODEL_ID=gemini-2.5-flash
GCP_SERVICE_ACCOUNT_KEY=<secret JSON value, never commit this>
```

The service account needs Vertex AI User access and the Vertex AI API enabled. Verify configuration with an authenticated request to `GET /ai/status`, then send a short Tekla prompt. The frontend only receives the generated answer; credentials never enter `VITE_*` variables.

Never commit `.env`, private signing keys, Stripe secrets, Xero secrets, GCP service-account JSON, refresh tokens, or database credentials.
