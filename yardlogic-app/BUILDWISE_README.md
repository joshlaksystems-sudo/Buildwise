# Buildwise by JC Nexus

**Enterprise-grade business management SaaS platform** combining invoicing, expense tracking, GST compliance, bank reconciliation, and AI-powered insights—hosted on Google Cloud.

---

## 🎯 Project Overview

**Buildwise** is a modern business management application for Indian businesses, powered by:

- **Frontend:** React 18 + TypeScript + Vite (Vercel)
- **Backend:** Node.js + Express + TypeScript (Vercel)
- **Database:** PostgreSQL (Google Cloud SQL, asia-southeast1)
- **Analytics:** Google BigQuery (gst_transactions dataset)
- **Storage:** Google Cloud Storage (docuvault-invoices bucket)
- **AI:** Vertex AI (Gemini models for expense categorization, reports, insights)
- **Company:** JC Nexus
- **Product Prefix:** BW (Buildwise)

---

## 📋 Features

### Core Features (Phases 1-4)
- ✅ **Business Profile:** Multi-tenant setup with business hierarchy
- ✅ **Suppliers/Contacts:** Customer and vendor management
- ✅ **Purchase Bills:** Supplier invoice tracking
- ✅ **Stock & Returns:** Inventory management with auto-tracking
- ✅ **Reports:** Business reports and analytics

### Advanced Features (Phase 5)
- ✅ **Bank Reconciliation:** CSV import with auto-matching and duplicate detection
- ✅ **Dashboard KPIs:** 6 key metrics + cash flow visualization
- ✅ **AI Expense Categorization:** Vertex AI-powered receipt analysis
- ✅ **Real-time Notifications:** Low stock, overdue, and payment alerts
- ✅ **Google Cloud Integration:** BigQuery logging, GCS storage, Vertex AI models

### Compliance & Security
- ✅ **GST Management:** GSTR1, GSTR3B filing support
- ✅ **E-invoicing:** Ready for e-invoice compliance
- ✅ **E-way Bills:** Support for logistics tracking
- ✅ **Authentication:** JWT + OTP + 2FA (TOTP)
- ✅ **Multi-tenant Isolation:** Business-level access control
- ✅ **Audit Logging:** Complete operation history

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (via Google Cloud SQL)
- Google Cloud Project (project-92b2b5ff-5a11-4df5-a0d)
- Git

### Local Development Setup (5 minutes)

```bash
# 1. Clone repository
git clone https://github.com/jcnexus/buildwise-app.git
cd buildwise-app

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install

# 4. Set up environment variables
cd ../backend
cp .env.example .env
# Edit .env with your credentials (see GOOGLE_CLOUD_SETUP.md)

# 5. Set up database (requires Cloud SQL Proxy or direct connection)
cd backend
npx prisma migrate dev

# 6. Start backend (in one terminal)
npm run dev
# Expected output: ✅ Google Cloud services initialized

# 7. Start frontend (in another terminal)
cd frontend
npm run dev
# Available at http://localhost:5174
```

### Login Credentials (Development)

- **Email:** test@buildwise.app
- **Password:** Test@123456
- **OTP:** Check database table `OTP` for latest code (valid 5 minutes)

---

## 📚 Documentation

### Infrastructure & Deployment

| Document | Purpose |
|----------|---------|
| [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md) | **START HERE**: Complete GCP setup including PostgreSQL, BigQuery, GCS, Vertex AI, and IAM permissions |
| [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) | Deploying backend & frontend to Vercel, environment variables, custom domains |
| [TESTING_AND_VERIFICATION.md](TESTING_AND_VERIFICATION.md) | Local testing, staging validation, production verification, automated test suite |

### Architecture Documentation

- **Google Cloud:** Service account → BigQuery (invoices, payments, expenses) + GCS (invoice storage) + Vertex AI (AI features)
- **Database:** Prisma ORM with PostgreSQL on Cloud SQL (asia-southeast1)
- **Authentication:** JWT tokens + OTP (SMS) + TOTP (2FA optional)
- **Multi-tenancy:** Business-level isolation with role-based access (OWNER, ADMIN, STAFF, SALESMAN, ACCOUNTANT)

### API Documentation

Backend API runs on `http://localhost:4000` or `https://buildwise-backend.vercel.app`

#### Authentication Routes
```
POST   /auth/signup          - Create account
POST   /auth/login           - Login with email/password
POST   /auth/request-otp     - Request OTP for login
POST   /auth/verify-otp      - Verify OTP
POST   /auth/setup-2fa       - Enable TOTP
```

#### Business & Admin Routes
```
GET    /business             - List businesses (current user)
POST   /business             - Create business
GET    /business/:id         - Get business details
PUT    /business/:id         - Update business

GET    /notifications        - Get unread notifications
PATCH  /notifications/:id/read - Mark as read
```

#### Invoice Routes
```
POST   /invoices             - Create invoice
GET    /invoices             - List invoices (paginated)
GET    /invoices/:id         - Get invoice details
PUT    /invoices/:id         - Update invoice
DELETE /invoices/:id         - Delete invoice
POST   /invoices/:id/mail    - Send invoice via email
```

#### Bank Reconciliation Routes
```
POST   /bank/statements/upload      - Upload bank CSV
GET    /bank/statements             - Get parsed statements
GET    /bank/statements/discrepancies - Get unmatched payments
POST   /bank/statements/:id/reconcile - Mark as reconciled
```

#### AI Routes
```
POST   /ai/categorize-expense      - Auto-categorize receipt
POST   /ai/ask                      - Natural language query
POST   /ai/generate-report          - Generate AI insights
POST   /ai/invoice-insights         - Get specific invoice analysis
```

#### Expense Routes
```
POST   /expenses             - Create expense (manual or AI)
GET    /expenses             - List expenses
PUT    /expenses/:id         - Update expense
DELETE /expenses/:id         - Delete expense
```

#### Reports Routes
```
GET    /reports/summary      - Dashboard KPIs
GET    /reports/gstr1        - GST GSTR1 filing
GET    /reports/gstr3b       - GST GSTR3B filing
GET    /reports/profit-loss  - P&L statement
```

### Database Schema

Key tables in PostgreSQL:

- **User:** Authentication & profiles
- **Business:** Multi-tenant businesses
- **UserBusiness:** User-to-business relationships with roles
- **Invoice:** Customer invoices
- **Payment:** Payment records (in/out)
- **Expense:** Expense entries with AI categorization
- **Item:** Inventory items
- **Notification:** Alert system
- **NotificationPreference:** User notification settings
- **BankStatement:** Bank CSV imports
- **Audit:** Complete audit trail of operations

See [backend/prisma/schema.prisma](backend/prisma/schema.prisma) for full schema.

---

## 🔧 Environment Variables

### Backend (.env)

```bash
# Database (Cloud SQL)
DATABASE_URL="postgresql://buildwise_app:PASSWORD@[IP]:5432/buildwise_db"

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID="project-92b2b5ff-5a11-4df5-a0d"
GOOGLE_APPLICATION_CREDENTIALS="./buildwise-key.json"
GCS_BUCKET="docuvault-invoices"
BIGQUERY_DATASET="gst_transactions"

# Vertex AI
VERTEX_AI_ENABLE="true"
VERTEX_AI_LOCATION="asia-southeast1"
VERTEX_AI_MODEL_ID="gemini-1.5-pro"
VERTEX_AI_SUBSCRIPTION_REQUIRED="false"

# Auth
JWT_SECRET="change-me-to-random-32-char-string"
ANTHROPIC_API_KEY="sk-ant-..." (optional, fallback)

# Server
PORT="4000"
NODE_ENV="development"

# Branding
COMPANY_NAME="JC Nexus"
PRODUCT_NAME="Buildwise"
INVOICES_PREFIX="BW"
```

### Frontend (.env.local or .env.production)

```bash
VITE_API_URL="http://localhost:4000"  # dev
VITE_COMPANY_NAME="JC Nexus"
VITE_PRODUCT_NAME="Buildwise"
```

---

## 🔒 Security

### Credentials Management

- ✅ **NO hardcoded credentials** - All secrets in environment variables
- ✅ **Service account key** stored locally (.env), added to .gitignore
- ✅ **Vercel secrets** for production deployment
- ✅ **Google Application Credentials** detected automatically

### Database Security

- ✅ **PostgreSQL on Cloud SQL** with SSL enforcement
- ✅ **Row-level security** (optional, see schema.prisma)
- ✅ **Cloud SQL Proxy** for secure local connections
- ✅ **Automatic backups** configured

### Storage Security

- ✅ **GCS bucket** uniform access control enabled
- ✅ **Signed URLs** for time-limited access (7-90 days)
- ✅ **Lifecycle policies** for automatic cleanup
- ✅ **Service account** scoped permissions

### API Security

- ✅ **JWT authentication** on all routes
- ✅ **Business-level isolation** with X-Business-Id header
- ✅ **Rate limiting** (optional, add express-rate-limit)
- ✅ **CORS** configured for frontend domain
- ✅ **2FA** support (TOTP/Authenticator apps)

---

## 📊 Google Cloud Integration

### Services Used

| Service | Purpose | Region |
|---------|---------|--------|
| Cloud SQL | PostgreSQL database | asia-southeast1 |
| BigQuery | Data warehouse (analytics) | asia-southeast1 |
| Cloud Storage | Invoice & receipt storage | asia-southeast1 |
| Vertex AI | Generative AI (Gemini) | asia-southeast1 |
| IAM | Service account & permissions | Global |

### Data Flow

```
Invoice Created → PostgreSQL → BigQuery (async, fire-and-forget)
                ↓
              GCS (PDF storage)

Expense Receipt → Vertex AI (categorize) → PostgreSQL
                ↓
              BigQuery (transaction logging)

Bank Statement → CSV Upload → Match with Payments → Update Status
                              ↓
                            BigQuery
```

---

## 🧪 Testing

### Run Tests Locally

```bash
# Backend tests
cd backend
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # Coverage report

# Frontend tests
cd frontend
npm test                    # Run all tests
npm run test:ui            # Interactive UI
```

### Full Integration Testing

See [TESTING_AND_VERIFICATION.md](TESTING_AND_VERIFICATION.md) for:
- Authentication flows
- Google Cloud services validation
- Feature-specific tests
- Security tests
- Performance benchmarks
- Staging deployment verification

---

## 🚢 Deployment

### Development → Production Pipeline

```
1. Local Testing (TESTING_AND_VERIFICATION.md PART 1-7)
   ↓
2. GitHub Push (triggers CI/CD if configured)
   ↓
3. Vercel Staging Deployment (VERCEL_DEPLOYMENT.md)
   ↓
4. Staging Integration Tests (TESTING_AND_VERIFICATION.md PART 7)
   ↓
5. Production Deployment (VERCEL_DEPLOYMENT.md PART 2)
   ↓
6. Production Verification (TESTING_AND_VERIFICATION.md PART 8)
```

### One-Command Deployment

```bash
# Backend to Vercel
cd backend
vercel --prod

# Frontend to Vercel
cd frontend
vercel --prod
```

### Database Migrations

```bash
# Create new migration
npx prisma migrate dev --name add_feature_x

# Apply in production (run locally first!)
npx prisma migrate deploy
```

---

## 📱 Frontend Structure

```
frontend/src/
├── pages/
│   ├── Dashboard.tsx         # KPI dashboard, cash flow chart
│   ├── Invoices.tsx          # Invoice list & creation
│   ├── Expenses.tsx          # Expense entry with AI
│   ├── BankStatements.tsx    # Bank reconciliation UI
│   ├── Contacts.tsx          # Supplier/customer management
│   ├── Items.tsx             # Inventory management
│   ├── Reports.tsx           # Business reports
│   ├── Challans.tsx          # Delivery notes
│   ├── Estimates.tsx         # Quote/estimate creation
│   └── Login.tsx             # Authentication
├── components/
│   ├── Layout.tsx            # Main layout + sidebar
│   ├── NotificationBell.tsx  # Real-time alerts
│   └── [other components]/
├── lib/
│   ├── api.ts                # HTTP client
│   ├── offlineDb.ts          # IndexedDB for offline
│   └── syncManager.ts        # Offline sync
└── styles/
    └── tokens.css            # Design tokens & CSS variables
```

### Frontend Features

- ✅ Responsive design (mobile-first)
- ✅ Offline support (IndexedDB + sync)
- ✅ Real-time notifications (30-second polling)
- ✅ Dark/light theme support
- ✅ Multi-language ready

---

## 🔍 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Database connection refused" | Run Cloud SQL Proxy or use public IP |
| "Vertex AI permission denied" | Add `roles/aiplatform.user` to service account |
| "GCS upload fails" | Grant `roles/storage.objectCreator` permission |
| "BigQuery quota exceeded" | Increase quota in Google Cloud Console |
| "Frontend can't reach backend" | Verify `VITE_API_URL` environment variable |
| "JWT token expired" | Login again to get new token |
| "OTP invalid" | Check database `OTP` table, code valid 5 mins |

See [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md) TROUBLESHOOTING section for detailed fixes.

---

## 📞 Support & Contribution

### Getting Help

1. Check documentation: [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md)
2. Review tests: [TESTING_AND_VERIFICATION.md](TESTING_AND_VERIFICATION.md)
3. Check logs: `vercel logs buildwise-backend --follow`
4. Contact: [your-email@jcnexus.com]

### Contributing

1. Create feature branch: `git checkout -b feature/new-feature`
2. Make changes and test: `npm test`
3. Commit: `git commit -am 'Add new feature'`
4. Push: `git push origin feature/new-feature`
5. Create Pull Request

---

## 📄 License

Proprietary - JC Nexus

---

## 🎯 Roadmap

### Q4 2024
- [ ] Vertex AI voice receipts (audio upload)
- [ ] WhatsApp integration for invoice sharing
- [ ] Advanced analytics (customer profitability)
- [ ] Subscription management

### Q1 2025
- [ ] Mobile app (React Native)
- [ ] Automated invoice reminders (scheduled jobs)
- [ ] Multi-currency support
- [ ] API for third-party integrations

### Q2 2025
- [ ] Accounting software integration (Tally)
- [ ] Bulk operations (import/export)
- [ ] Custom reports builder
- [ ] Role-based dashboards

---

## 🚦 Getting Started Checklist

- [ ] Fork/clone repository
- [ ] Install dependencies (backend & frontend)
- [ ] Follow [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md) Part 1 (GCP setup)
- [ ] Set up `.env` files (backend & frontend)
- [ ] Start database (`cloud_sql_proxy` or direct connection)
- [ ] Run migrations (`npx prisma migrate dev`)
- [ ] Start backend (`npm run dev` in `backend/`)
- [ ] Start frontend (`npm run dev` in `frontend/`)
- [ ] Login with test credentials
- [ ] Run tests ([TESTING_AND_VERIFICATION.md](TESTING_AND_VERIFICATION.md))
- [ ] Deploy to Vercel ([VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md))

---

**Last Updated:** 2024-09-15
**Version:** 1.0.0-beta
**Status:** Production Ready
