# Khatabook+ — the foundation for a more powerful Vyapar

This is a real, running scaffold: a Node/Express/Prisma/Postgres backend
and a React/Vite frontend, architected so **every** Vyapar-style feature
is an additive module, not a rewrite. It is not feature-complete with
Vyapar yet — nobody builds that in one sitting — but the hard part
(data model, sync-ready architecture, multi-tenant auth, and the AI
layer Vyapar doesn't have) is done and working.

## What's actually built right now

- **Tenant isolation, enforced server-side** — every request carries
  an `X-Business-Id` header, and `requireAuth` looks up the
  `UserBusiness` join row to confirm the logged-in user actually
  belongs to that business before any route runs. A customer can
  never see another customer's data by tampering with a header —
  this is checked on every single request, not assumed.
- **Multi-business auth, email or mobile** — OTP login
  (`/auth/otp/request` + `/auth/otp/verify`) is the primary path, so
  users log in with either an email or a phone number and no
  password to remember; password login still works as a fallback.
  One login can belong to many shops; the frontend's business
  switcher (top of the sidebar) changes which business's data every
  page shows.
- **Inventory** — items, barcode lookup, stock movements, low-stock /
  reorder alerts
- **GST billing** — line-item tax calc, discounts, auto bill numbering,
  stock deduction on sale, payment recording, GST vs non-GST invoice types
- **Estimates** — quote creation, one-click conversion to a real
  invoice without re-entering lines
- **Delivery challans** — dispatch tracking that only deducts stock
  once marked delivered
- **Customers & suppliers** — contact management, opening balances
- **Expenses** — manual entry, plus AI-powered categorization from
  pasted text or PDF/image receipts; selecting several receipts creates
  one reviewed expense per file and repeated files are idempotent
- **Supplier invoice intake** — upload a supplier PDF/image from Purchase
  Bills, review the extracted supplier invoice and item lines, link each
  line to inventory, then save once to create the purchase bill and update
  stock atomically
- **Reports** — sales, GST collected, outstanding receivables, expense
  totals — all scoped to the active business only, same as every
  other route
- **PDF invoices + WhatsApp share** — every invoice can be downloaded
  as a styled PDF, or shared via a `wa.me` link with the bill
  pre-filled. The shared PDF link uses a separate, narrowly-scoped
  token (`signInvoiceAccessToken`) so the customer receiving it on
  WhatsApp can open it with no account and no login — it only ever
  unlocks that one invoice, nothing else in your data
- **The actual differentiator**: an AI service (`/ai/categorize-expense`,
  `/ai/ask`) that turns OCR'd receipt text into a categorized, tax-split
  expense automatically, and answers plain-language questions
  ("how much did I sell last week") over your live data — this is the
  thing Vyapar's OCR feature stops short of

## Full feature matrix

✅ Built and working · 🧱 Modeled (schema + UI pattern exist, route not wired) · 🔌 Needs a paid GSP/SMS/email provider plugged into an existing seam

**Billing & Invoicing**
✅ GST invoices (B2B/B2C) · ✅ Quotations/estimates with one-click convert · ✅ Delivery challans · ✅ HSN code field on items · ✅ Multi-rate GST per line · ✅ PDF + WhatsApp share · 🧱 Credit/debit notes (schema + no routes yet) · 🧱 Proforma invoices (use Estimate, add a type flag) · 🧱 Custom per-industry templates (one PDF layout exists — templating is a `pdfService.ts` extension)

**GST Filing & Compliance**
✅ GSTR-1/3B *data prep* computed from real invoices (`/gst/gstr1`, `/gst/gstr3b`) · ✅ 2A/2B reconciliation matching logic (`/gst/reconcile-2a`) · ✅ RCM and TCS fields on invoices · 🔌 Actually filing GSTR-1/3B, e-invoice IRN, e-way bill generation — all route through `gspService.ts`, return HTTP 501 with a clear message until `GSP_API_KEY` is configured with a real GSP (ClearTax/Zoho/Vayana/Cygnet) · 🧱 Filing due-date reminders (use `PaymentReminder` pattern)

**Inventory**
✅ Stock tracking + barcode · ✅ Low-stock alerts · 🧱 Batch & expiry tracking (`ItemBatch` model, no routes yet) · 🧱 Unit conversion (`UnitConversion` model, no routes yet) · 🧱 Near-expiry alerts (query `ItemBatch.expiryDate`, not built)

**Cement-specific**
✅ Vehicle number & transporter ID on invoices · ✅ Grade field on items (OPC 43, PPC, freeform) · ✅ RCM/freight tax fields · 🧱 Bulk multi-truck e-way bills (`EwayBill` model exists, needs a batch-create route) · 🧱 Dealer credit limit (`Customer.creditLimit` field exists, no enforcement logic yet)

**Medical-specific**
✅ Drug license fields on Business · ✅ Schedule H/H1/X field on items · ✅ Salt/composition field on items · 🧱 Batch/expiry legal compliance (same `ItemBatch` model as cement — shared, not duplicated) · 🧱 MRP-enforcement at billing time (MRP field exists, enforcement check not added to invoice creation) · 🧱 Salt-based search (field exists, no search route yet) · 🧱 Supplier return tracking (`DebitNote` model exists, no routes yet)

**Accounting**
✅ Sales/expense/payment entries · ✅ Cash/UPI/card/bank payment modes · 🧱 P&L and balance sheet (reports currently give sales/tax/expense totals, not full statements) · 🧱 Payment reminders (`PaymentReminder` model exists, no send logic — same seam as OTP, needs a provider)

**Customer Growth**
🧱 Loyalty program (`LoyaltyTransaction` model exists, no earn/redeem routes yet) · 🧱 Bulk WhatsApp/SMS campaigns (`Campaign` model exists, no send routes yet) · 🧱 Customer segmentation (`Customer.lastPurchaseAt` field exists — segments are a query away, not built) · 🧱 Customer portal (would be a separate, restricted frontend reading the same API)

**AI & Analytics**
✅ AI expense categorization from OCR text · ✅ Plain-language business Q&A · 🧱 Demand forecasting (StockMovement history exists, no model built yet) · 🧱 Cash flow forecasting (same — data exists, prediction logic doesn't yet)

**Technical/Platform**
✅ Offline-first with auto-sync — `frontend/src/lib/offlineDb.ts` + `syncManager.ts`: every syncable model is cached in IndexedDB, writes go local-first and queue in an outbox when offline, `/sync/push` + `/sync/pull` + `/sync/bootstrap` on the backend handle last-write-wins conflict resolution by `updatedAt`. Currently wired end-to-end on the Items page as the reference implementation — same three functions (`readLocal`, `saveLocalFirst`, `pullChanges`) apply to every other page.
✅ Multi-user roles (Owner/Admin/Staff/Salesman/Accountant), enforced server-side · ✅ Multi-warehouse schema (`Warehouse` + `WarehouseStock`, no per-warehouse routes yet — 🧱) · 🧱 Tally import/export · 🧱 Backup & restore (Postgres-level, not app-level — standard `pg_dump` works today, no in-app UI for it)

## JoshLak build doc — Steps 1–6 (Step 7 intentionally excluded)

| Step | Status |
|---|---|
| 1 — Core billing & inventory (Cement as base) | ✅ Built (existing invoice/item/payment routes) |
| 2 — Metadata-driven vertical engine | ✅ Built — `MaterialTemplate` model, seeded with Cement/Steel/Bricks/Sand (`backend/src/services/materialTemplateSeeds.ts`), clone-a-template route (`POST /material-templates/clone`), items reference a template + a JSON `attributes` blob instead of one column per material |
| 3 — GST calculation & prep (not filing) | ✅ Built — `/gst/gstr1/:period`, `/gst/gstr3b/:period` compute real numbers from your invoices; RCM/TCS fields on Invoice |
| 4 — Dispatch & e-way bill automation | ✅ Built — vehicle/transporter fields, single (`POST /gst/invoices/:id/eway-bill`) and bulk (`POST /gst/eway-bills/bulk`) generation, expiry alerts (`GET /gst/eway-bills/expiring`) — the actual government-facing e-way bill number still needs a GSP, same as filing |
| 5 — Analytics & AI insights | ✅ Built — deterministic stock-out prediction (`GET /forecast/stock-out`), material-wise profit (`GET /forecast/material-profit`), dormant-customer detection (`GET /forecast/dormant-customers`), plus the existing AI Q&A and expense categorization |
| 6 — Security, payments, credit | ✅ Built — audit trail (`AuditLog`, written on invoice/item mutations), TOTP 2FA (`/auth/2fa/*`), credit limit enforcement (blocks an invoice that would push a customer over their limit), bank reconciliation (`/bank/import` + auto-match), payment gateway seam (`paymentGatewayService.ts`, same honest-stub pattern as GSP) |
| 7 — GST filing (GSP integration) | Excluded per instruction — the seam (`gspService.ts`) still exists from earlier so it's a drop-in once you're ready, not a rewrite |

**Step 2 in practice** — the whole point of the metadata engine is that adding a fifth material (say, Tiles) is:
```
POST /material-templates/clone
{ "sourceTemplateId": "<bricks-template-id>", "name": "Tiles", "attributeSchema": [...] }
```
No migration, no deploy — a template clone plus whatever attribute fields that material needs.

Three categories of feature in this list are not things any app — including the market leaders — can do standalone:
1. **GST filing / e-invoicing / e-way bills**: legally require a GSP contract with GSTN
2. **SMS/email/WhatsApp sending**: require a licensed provider (MSG91, Twilio, Resend, Meta's WhatsApp Business API)
3. **Real bank/payment settlement**: would require a payment gateway (Razorpay, Cashfree), not modeled here since it wasn't requested

Every one of these has a single, clearly-marked seam in the code
(`gspService.ts`, `notifyService.ts`) where a real integration plugs
in without touching anything else — that's the difference between
"not built" and "not fake."

## Running it

```bash
# Backend
cd backend
cp .env.example .env        # fill in DATABASE_URL and ANTHROPIC_API_KEY
npm install
npx prisma migrate dev --name init
npm run seed:templates      # loads the Cement/Steel/Bricks/Sand starter templates
npm run dev                 # http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

You'll need a Postgres instance — either local or something like Neon/
Supabase for a free hosted one. `ANTHROPIC_API_KEY` is only required for
the `/ai/*` endpoints; everything else works without it.

For an existing production database, deploy checked-in migrations before
the new backend code serves traffic:

```bash
cd backend
npm run prisma:deploy
```

Uploaded compliance documents are validated before storage and AI
processing. For production, install ClamAV and set
`MALWARE_SCAN_ENABLED=true` and `MALWARE_SCAN_REQUIRED=true`; when required,
the backend rejects uploads if ClamAV is unavailable.

## Why this architecture beats a Vyapar clone

1. **Offline sync was designed in, not bolted on.** The schema has no
   client-only state — every entity is server-authoritative with
   movement logs (`StockMovement`), so a future offline client just
   needs a local cache + a sync queue, not a redesign.
2. **AI is a first-class service, not a feature flag.** `aiService.ts`
   is the seam where every future AI capability (forecasting, anomaly
   detection, smarter categorization) plugs in against the same data.
3. **One API, N clients.** Web ships first; mobile and desktop are new
   frontends against the same endpoints, not separate codebases with
   their own sync logic — which is where Vyapar's desktop/mobile split
   actually shows its age.

## Suggested build order from here

1. Wire a real OTP provider (MSG91/Twilio for SMS, Resend/SendGrid for
   email) into `services/notifyService.ts` — currently it just logs
   to the console, which is fine for dev but not for real users
2. Barcode scanner UI (camera-based, using a JS barcode-reading lib)
3. Reorder prediction using `StockMovement` history (this is where the
   AI service earns its keep beyond OCR)
4. Mobile client (React Native) against the same API — the tenant
   isolation and OTP auth already work identically for any client
