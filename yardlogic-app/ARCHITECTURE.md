# Buildwise Architecture Diagram

## High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BUILDWISE BY JC NEXUS (v1.0.0)                      │
│                            Production Architecture                            │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   Vercel    │
                              │   (Global   │
                              │    CDN)     │
                              └──────┬──────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
           ┌────────▼────────┐  ┌────▼──────────┐  ┌─▼──────────────┐
           │  React Frontend │  │ Node.js       │  │  Static Assets │
           │  (localhost:    │  │ Backend       │  │  (HTML/CSS/JS) │
           │   5174)         │  │ (localhost:   │  │                │
           │                 │  │  4000)        │  │                │
           │ • Dashboard     │  │               │  │ • Logo         │
           │ • Invoices      │  │ • API Routes  │  │ • Images       │
           │ • Expenses      │  │ • Auth        │  │ • Icons        │
           │ • Contacts      │  │ • Services    │  │                │
           │ • Reports       │  │               │  │                │
           │ • 2FA/OTP       │  │               │  │                │
           └────────┬────────┘  └────┬──────────┘  └──────────────┘
                    │                │
                    │ API            │ HTTP/HTTPS
                    │ Requests       │
                    └────────────────┴─────────────────────────────┐
                                     │                             │
                      ┌──────────────▼───────────────┐             │
                      │   Express.js Backend         │             │
                      │   (Vercel Serverless)        │             │
                      │                              │             │
                      │ ├─ Authentication            │             │
                      │ │  ├─ JWT Token              │             │
                      │ │  ├─ OTP (Email)            │             │
                      │ │  └─ TOTP (2FA)             │             │
                      │ ├─ Business Logic            │             │
                      │ │  ├─ Invoices               │             │
                      │ │  ├─ Expenses               │             │
                      │ │  ├─ Payments               │             │
                      │ │  └─ Reports                │             │
                      │ ├─ Google Cloud Integration  │             │
                      │ │  ├─ BigQuery Logging       │             │
                      │ │  ├─ Cloud Storage          │             │
                      │ │  ├─ Vertex AI              │             │
                      │ │  └─ Authentication         │             │
                      │ └─ Audit Logging             │             │
                      └──────────────┬───────────────┘             │
                                     │                             │
                    ┌────────────────┼─────────────────────────┐   │
                    │                │                         │   │
         ┌──────────▼──────────┐ ┌──▼──────────────┐  ┌──────▼──┐
         │  Google Cloud SQL   │ │  Google Cloud   │  │ Google  │
         │  (PostgreSQL)       │ │  Storage        │  │ Vertex  │
         │                     │ │  (docuvault-    │  │ AI      │
         │ • User Data         │ │   invoices)     │  │         │
         │ • Business Profile  │ │                 │  │ • Gem   │
         │ • Invoices          │ │ • Invoices      │  │   1.5   │
         │ • Expenses          │ │ • Receipts      │  │   Pro   │
         │ • Payments          │ │ • Reports       │  │         │
         │ • Audit Logs        │ │ • 7-90 day URLs │  │ Features│
         │ • Contacts          │ │                 │  │ • Exp.  │
         │ • Items             │ │ Signed URLs     │  │   Cat.  │
         │ • GST Data          │ │ (auto-expire)   │  │ • Report│
         │                     │ │                 │  │ • Insight
         └─────────────────────┘ └─────────────────┘  └────────┘
                    │                     │                 │
                    └────────────────────┬┴────────────────┘
                                        │
                        ┌───────────────▼──────────────┐
                        │   BigQuery Analytics         │
                        │   (gst_transactions)         │
                        │                              │
                        │ Tables:                      │
                        │ • invoices (15 fields)       │
                        │ • payments (10 fields)       │
                        │ • expenses (9 fields)        │
                        │                              │
                        │ Fire-and-forget logging      │
                        │ (never blocks operations)    │
                        └──────────────────────────────┘
```

---

## Data Flow Architecture

### Authentication Flow
```
Browser                     Backend                  Google Cloud
  │                           │                           │
  ├─ POST /auth/login ──────→ │                           │
  │  (email, password)        │                           │
  │                           ├─ Verify password ────→ PostgreSQL
  │                           │                           │
  │                     ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
  │                           │                           │
  │                  ← JWT + OTP Request ───────────┐    │
  │                           │                     │    │
  │                           ├─ Send OTP Email    │    │
  │                           │                    │    │
  ├─ POST /auth/verify-otp ─→ │                    │    │
  │  (otp_code)               │                    │    │
  │                           ├─ Validate OTP     │    │
  │                           │                    │    │
  │                   ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤    │
  │                           │                         │
  │                   ← JWT Token + User Data ─ ─ ─ ─ ┤
  │                           │                         │
  └─ Logged In ───────────────────────────────────────┘
```

### Invoice Creation & Logging Flow
```
Browser                     Backend                  Google Cloud
  │                           │                           │
  ├─ POST /invoices ────────→ │                           │
  │  (invoice data)           │                           │
  │                           ├─ Save to DB ────────→ PostgreSQL
  │                           │                           │
  │                           ├─ Log to BigQuery (async)→ BigQuery
  │                           │    (never blocks)         │
  │                           │                           │
  │                           ├─ Create Audit Log ───→ PostgreSQL
  │                           │                           │
  │                   ← Invoice ID ─ ─ ─ ─ ─ ─ ─ ─ ─┤
  │                           │                         │
  └─ Invoice Created ─────────────────────────────────┘

[Meanwhile, in background]
BigQuery Query
  │
  ├─ SELECT * FROM gst_transactions.invoices
  │  WHERE businessId = 'XXX'
  │
  └─ Returns: Logged transactions (async, non-blocking)
```

### Expense Categorization Flow (with AI)
```
Browser                     Backend                  Google Cloud
  │                           │                           │
  ├─ POST /ai/categorize ──→ │                           │
  │  (receipt_image,          │                           │
  │   raw_text)               │                           │
  │                           ├─ Check Subscription     │
  │                           │                         │
  │                           ├─ Try Vertex AI ────────→ Vertex AI
  │                           │  (Gemini 1.5 Pro)        │
  │                           │                         │
  │                      ← Category/Amount/Tax ─ ─ ─┤
  │                           │                         │
  │                    ← Extract JSON ──────────────┤
  │                           │                         │
  │                  (If Vertex fails)                  │
  │                           │                         │
  │                           ├─ Fallback: Claude ─────→ Anthropic
  │                           │  (uses ANTHROPIC_API_KEY)
  │                           │                         │
  │                      ← Category ─ ─ ─ ─ ─ ─ ─ ┤
  │                           │                         │
  │                           ├─ Save Expense ────────→ PostgreSQL
  │                           │                           │
  │                           ├─ Log to BigQuery ────→ BigQuery
  │                           │                           │
  │                   ← Categorized Expense ─ ─ ─ ─┤
  │                           │                         │
  └─ Display Result ──────────────────────────────────┘
```

### Invoice Upload & Storage Flow
```
Browser                     Backend                  Google Cloud
  │                           │                           │
  ├─ POST /invoices/upload ─→ │                           │
  │  (invoice_pdf)            │                           │
  │                           ├─ Upload to GCS ───────→ Cloud Storage
  │                           │  (docuvault-invoices/     │
  │                           │   invoices/)              │
  │                           │                           │
  │                           ├─ Create Signed URL ──→ Expires in 7 days
  │                           │                           │
  │                           ├─ Save URL & Metadata ─→ PostgreSQL
  │                           │                           │
  │                           ├─ Log Transaction ────→ BigQuery
  │                           │                           │
  │                   ← Signed URL ─ ─ ─ ─ ─ ─ ─ ─┤
  │                           │                         │
  └─ Download Link Ready ──────────────────────────────┘

[Signed URL]
  │
  └─ Valid for 7 days
     ├─ Auto-expires (security)
     └─ No credentials needed (user can download directly)
```

---

## Database Schema Overview

### Core Tables (PostgreSQL - Google Cloud SQL)

```
┌──────────────────────────────────────────────┐
│                   USER                       │
├──────────────────────────────────────────────┤
│ id: UUID (PK)                               │
│ email: String (unique)                      │
│ password_hash: String                       │
│ phone: String (optional)                    │
│ otp_code: String (expires in 5 min)        │
│ otp_verified: Boolean                       │
│ totp_secret: String (optional, 2FA)        │
│ created_at: DateTime                        │
│ updated_at: DateTime                        │
└──────────────────────────────────────────────┘
           │
           │ (joins via UserBusiness)
           │
┌──────────────────────────────────────────────┐
│                BUSINESS                      │
├──────────────────────────────────────────────┤
│ id: UUID (PK)                               │
│ name: String                                │
│ email: String                               │
│ phone: String                               │
│ address: String                             │
│ city: String                                │
│ state: String                               │
│ pincode: String                             │
│ gst_number: String (unique)                │
│ pan: String (optional)                      │
│ created_at: DateTime                        │
│ updated_at: DateTime                        │
└──────────────────────────────────────────────┘
           │
           ├─ has many ─→ INVOICE
           ├─ has many ─→ EXPENSE
           ├─ has many ─→ CUSTOMER
           ├─ has many ─→ SUPPLIER
           └─ has many ─→ AUDIT_LOG
           
┌──────────────────────────────────────────────┐
│                 INVOICE                      │
├──────────────────────────────────────────────┤
│ id: UUID (PK)                               │
│ business_id: UUID (FK)                      │
│ invoice_number: String (unique per biz)    │
│ customer_id: UUID (FK)                      │
│ amount: Decimal                             │
│ tax_amount: Decimal                         │
│ discount_amount: Decimal                    │
│ grand_total: Decimal                        │
│ amount_paid: Decimal                        │
│ status: Enum (DRAFT/UNPAID/PARTIAL/PAID)   │
│ issue_date: DateTime                        │
│ due_date: DateTime                          │
│ gcs_url: String (optional, GCS link)       │
│ created_at: DateTime                        │
│ updated_at: DateTime                        │
└──────────────────────────────────────────────┘
           │
           ├─ has many ─→ INVOICE_ITEM
           └─ has many ─→ PAYMENT

┌──────────────────────────────────────────────┐
│                 EXPENSE                      │
├──────────────────────────────────────────────┤
│ id: UUID (PK)                               │
│ business_id: UUID (FK)                      │
│ category: String (via Vertex AI)            │
│ amount: Decimal                             │
│ tax_amount: Decimal                         │
│ note: String                                │
│ ai_category_confidence: Float (0-1)        │
│ gcs_url: String (optional, receipt image)  │
│ date: DateTime                              │
│ created_at: DateTime                        │
│ updated_at: DateTime                        │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│                 PAYMENT                      │
├──────────────────────────────────────────────┤
│ id: UUID (PK)                               │
│ business_id: UUID (FK)                      │
│ invoice_id: UUID (FK)                       │
│ amount: Decimal                             │
│ mode: Enum (CASH/BANK/CHEQUE/CREDIT)      │
│ date: DateTime                              │
│ reconciled: Boolean                         │
│ bank_reference: String (optional)           │
│ created_at: DateTime                        │
│ updated_at: DateTime                        │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│                AUDIT_LOG                     │
├──────────────────────────────────────────────┤
│ id: UUID (PK)                               │
│ business_id: UUID (FK)                      │
│ user_id: UUID (FK)                          │
│ action: String (CREATE/UPDATE/DELETE)      │
│ entity_type: String (Invoice/Expense/etc) │
│ entity_id: UUID                             │
│ changes: JSON (old → new values)            │
│ created_at: DateTime                        │
│ ip_address: String (optional)               │
│ user_agent: String (optional)               │
└──────────────────────────────────────────────┘
```

### BigQuery Tables (Analytics & Logging)

```
┌─────────────────────────────────────────────┐
│ Dataset: gst_transactions                   │
├─────────────────────────────────────────────┤
│                                             │
│ Table: invoices                             │
│ ├─ invoiceId (string)                       │
│ ├─ businessId (string)                      │
│ ├─ invoiceNumber (string)                   │
│ ├─ customerId (string)                      │
│ ├─ amount (float64)                         │
│ ├─ taxAmount (float64)                      │
│ ├─ discountAmount (float64)                 │
│ ├─ status (string)                          │
│ ├─ issueDate (timestamp)                    │
│ ├─ dueDate (timestamp)                      │
│ ├─ amountPaid (float64)                     │
│ ├─ isPaid (boolean)                         │
│ ├─ createdAt (timestamp)                    │
│ ├─ updatedAt (timestamp)                    │
│ └─ notes (string, nullable)                 │
│                                             │
│ Table: payments                             │
│ ├─ paymentId (string)                       │
│ ├─ businessId (string)                      │
│ ├─ invoiceId (string)                       │
│ ├─ billId (string, nullable)                │
│ ├─ amount (float64)                         │
│ ├─ mode (string)                            │
│ ├─ direction (string) [IN/OUT]              │
│ ├─ reconciled (boolean)                     │
│ ├─ date (timestamp)                         │
│ └─ createdAt (timestamp)                    │
│                                             │
│ Table: expenses                             │
│ ├─ expenseId (string)                       │
│ ├─ businessId (string)                      │
│ ├─ category (string)                        │
│ ├─ amount (float64)                         │
│ ├─ taxAmount (float64)                      │
│ ├─ note (string)                            │
│ ├─ aiCategoryConfidence (float64)           │
│ ├─ date (timestamp)                         │
│ └─ createdAt (timestamp)                    │
│                                             │
└─────────────────────────────────────────────┘
```

### Cloud Storage Bucket Structure

```
gs://docuvault-invoices/
├── invoices/
│   ├── INV-001-2024-01-15.pdf
│   ├── INV-002-2024-01-20.pdf
│   └── INV-003-2024-02-10.pdf
│
├── receipts/
│   ├── EXP-001-receipt.jpg
│   ├── EXP-002-receipt.png
│   └── EXP-003-receipt.pdf
│
└── reports/
    ├── Q1-2024-report.pdf
    ├── Q2-2024-report.pdf
    └── annual-2024-report.pdf

Each file has:
├─ Signed URL (expires after 7 days for invoices, 90 days for receipts)
├─ Metadata (businessId, type, uploadDate)
└─ No public access (authenticated only)
```

---

## Deployment Architecture

### Local Development
```
Your Machine
├── Frontend (React)
│   └── http://localhost:5174
│       └─ Vite dev server (hot reload)
│
├── Backend (Node.js)
│   └── http://localhost:4000
│       └─ Express dev server (nodemon)
│
└── Database
    └── Cloud SQL PostgreSQL (direct connection)
        └─ Via Cloud SQL Proxy or direct IP
```

### Production Deployment (Vercel)
```
Vercel (Global CDN)
├── Frontend
│   ├── https://buildwise.vercel.app (or custom domain)
│   │   └─ React SPA (cached globally)
│   │   └─ Automatic deployments from GitHub
│   │
│   └── Environment Variables:
│       ├─ VITE_API_URL=https://api.buildwise.vercel.app
│       ├─ VITE_COMPANY_NAME=JC Nexus
│       └─ VITE_PRODUCT_NAME=Buildwise
│
├── Backend API
│   ├── https://api.buildwise.vercel.app (or custom domain)
│   │   └─ Node.js Serverless Functions
│   │   └─ Auto-scales with traffic
│   │
│   └── Environment Variables (Vercel Secrets):
│       ├─ DATABASE_URL (Cloud SQL connection)
│       ├─ GOOGLE_APPLICATION_CREDENTIALS (base64 key)
│       ├─ GCS_BUCKET=docuvault-invoices
│       ├─ BIGQUERY_DATASET=gst_transactions
│       ├─ VERTEX_AI_ENABLE=true
│       ├─ JWT_SECRET (random 32 chars)
│       └─ ANTHROPIC_API_KEY (optional fallback)
│
└── GitHub Integration
    ├── Push to main → Auto-deploy backend
    └── Push to frontend branch → Auto-deploy frontend
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   SECURITY LAYERS                        │
└─────────────────────────────────────────────────────────┘

Layer 1: Transport Security
├─ HTTPS/TLS for all connections
├─ Cloud SQL SSL enforcement
├─ Signed URLs (auto-expire)
└─ No cookies for API (stateless JWT)

Layer 2: Authentication
├─ Email + Password (hashed with bcrypt)
├─ OTP via email (5-minute expiry)
├─ TOTP 2FA (optional, uses Google Authenticator)
└─ JWT tokens with short expiry (15 min refresh)

Layer 3: Authorization
├─ Business-level isolation (X-Business-Id header)
├─ Role-based access control (OWNER/ADMIN/STAFF/etc)
├─ Row-level security (users see only their business data)
└─ Feature flags (subscription checks for AI)

Layer 4: Data Protection
├─ No hardcoded credentials (all environment vars)
├─ Service account authentication (not API keys)
├─ Audit logs for all mutations
├─ Database encryption at rest (GCP default)
└─ Backup retention (30 days, configurable)

Layer 5: API Security
├─ Rate limiting (configured per endpoint)
├─ CORS validation (frontend domain whitelist)
├─ Request validation (Zod schemas)
├─ SQL injection protection (Prisma ORM)
└─ XSS protection (React escaping)

Layer 6: Cloud Security
├─ GCP IAM (least privilege roles)
├─ Service account key rotation (yearly)
├─ VPC networks (optional, for Cloud SQL)
├─ Firewall rules (Cloud SQL IP whitelist)
└─ Monitoring & alerts (enabled by default)
```

---

## Performance Architecture

```
Optimization Layers:

1. Frontend (Browser)
   ├─ React code splitting (lazy loading)
   ├─ Vite bundling (fast dev + optimized build)
   ├─ Offline support (IndexedDB)
   └─ Sync manager (auto-retry, batching)

2. Backend (API)
   ├─ Prisma query optimization
   │   ├─ Connection pooling (PgBouncer on Cloud SQL)
   │   ├─ Selective includes (prevent N+1 queries)
   │   └─ Indexes on frequently queried fields
   │
   ├─ Async operations (non-blocking)
   │   ├─ BigQuery logging (fire-and-forget)
   │   └─ Email sending (queued)
   │
   ├─ Caching strategies
   │   ├─ Response caching headers
   │   ├─ Browser cache (static assets)
   │   └─ CDN cache (Vercel)
   │
   └─ Serverless auto-scaling (Vercel)
       └─ Handles load automatically

3. Database (PostgreSQL)
   ├─ Cloud SQL auto-scaling
   ├─ Read replicas (optional)
   ├─ Connection pooling
   ├─ Query optimization
   └─ Regular vacuuming

4. Analytics (BigQuery)
   ├─ Streaming inserts (async)
   ├─ Partition pruning (by date)
   └─ Non-blocking (never slows down API)

5. CDN (Vercel)
   ├─ Global edge locations
   ├─ Automatic compression
   ├─ Long cache headers
   └─ Instant global availability
```

---

This architecture diagram shows how all components work together to provide a secure, scalable, and performant SaaS application.

**Key Principles:**
- ✅ Separation of concerns (frontend, backend, database, analytics)
- ✅ Non-blocking operations (BigQuery logging never slows down users)
- ✅ Security at every layer (authentication, authorization, encryption)
- ✅ Scalability (serverless auto-scaling, managed services)
- ✅ No single point of failure (load balanced, replicated)
- ✅ Observable (audit logs, monitoring, alerts)

**Next Step:** Review GOOGLE_CLOUD_SETUP.md to implement this architecture!
