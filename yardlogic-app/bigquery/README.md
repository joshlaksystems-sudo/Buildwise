# Khatabook+ automation pipeline: Apps Script → Vercel → BigQuery

This is the data pipeline layered on top of the main app: Google
Apps Script pushes rows (from a Sheet, a form, or any Apps Script
trigger) to a Vercel serverless endpoint, which validates and
streams them into BigQuery. Credentials live only in Vercel's env
vars — Apps Script never touches your GCP service account key.

```
Apps Script (Code.gs) --POST--> Vercel (/api/insert.ts) --insert--> BigQuery
                                     ^
                          credentials from .env
```

## 1. Create the BigQuery tables

Every table from the main app's schema (`backend/prisma/schema.prisma`)
has a matching BigQuery table in `bigquery/schema.sql` — 16 tables,
nothing skipped: businesses, users, user_business, customers,
suppliers, items, stock_movements, invoices, invoice_items,
estimates, estimate_items, delivery_challans,
delivery_challan_items, expenses, payments, salesman_logs.

```bash
# Replace YOUR_PROJECT in the file first, then:
bq query --use_legacy_sql=false < bigquery/schema.sql
```

Or paste it straight into the BigQuery Studio SQL editor in the
Cloud Console.

## 2. Create a service account for ingest

In Cloud Console → IAM & Admin → Service Accounts:
1. Create `khatabook-ingest@your-project.iam.gserviceaccount.com`
2. Grant it **BigQuery Data Editor** on the `khatabook` dataset (not
   project-wide — keep the blast radius small)
3. Create a JSON key, download it — you'll need `client_email` and
   `private_key` from it

## 3. Deploy the Vercel ingest API

```bash
cd vercel-ingest
npm install
vercel link
vercel env add BIGQUERY_PROJECT_ID
vercel env add BIGQUERY_DATASET
vercel env add GOOGLE_CLIENT_EMAIL
vercel env add GOOGLE_PRIVATE_KEY      # paste with \n literal, see .env.example
vercel env add INGEST_SHARED_SECRET    # any long random string you generate
vercel deploy --prod
```

Your endpoint is now live at `https://<your-app>.vercel.app/api/insert`.
It only accepts `POST` requests carrying the `X-Ingest-Secret` header
matching `INGEST_SHARED_SECRET`, and only writes to the 16 tables
listed in `lib/bigquery.ts` — anything else is rejected with a 400
before it reaches BigQuery. Enum columns (`status`, `role`, `mode`,
etc.) are validated against the same allowed values as the SQL
comments in `schema.sql`, so a bad value never lands as a row.

## 4. Wire up Apps Script

1. Open (or create) an Apps Script project — from a Sheet:
   Extensions → Apps Script.
2. Paste in `appscript/Code.gs`.
3. Project Settings → Script Properties, add:
   - `INGEST_URL` = `https://<your-app>.vercel.app/api/insert`
   - `INGEST_SECRET` = the same string as `INGEST_SHARED_SECRET`
4. Two ways to push data, both included in `Code.gs`:
   - **Pull-based**: `syncInvoicesSheet()` reads a sheet tab and
     pushes every row — wire it to a time-driven trigger (Triggers →
     Add Trigger → time-driven → every 5/15/60 minutes) for
     automatic syncing.
   - **Push-based**: deploy the script itself as a Web App
     (Deploy → New deployment → Web app), and any external system
     can `POST` `{"table": "...", "rows": [...]}` straight to it —
     useful if your billing app's frontend fires the sync instead of
     a sheet.

## Why this shape (and not Apps Script → BigQuery directly)

Apps Script *can* call the BigQuery API directly via the built-in
BigQuery advanced service — but then your GCP service account
credentials, or at least OAuth scopes, live inside the Apps Script
project, which is harder to rotate, audit, and lock down than a
single Vercel env var. Routing through Vercel also gives you:
- one place to add validation (the enum checks in `insert.ts`)
- one place to add row-level auth if you later want per-business
  ingest tokens instead of one shared secret
- a normal Node runtime if you outgrow simple inserts and want to
  batch, dedupe, or transform rows before they land in BigQuery
