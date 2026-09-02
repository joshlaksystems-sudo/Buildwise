# 📋 Buildwise Setup Execution Checklist

**Project:** Buildwise by JC Nexus  
**Version:** 1.0.0  
**Date:** 2024-09-15  
**Status:** Ready for Setup

---

## 🎯 Pre-Setup Verification (Do This First)

- [ ] You have access to Google Cloud Console (project-92b2b5ff-5a11-4df5-a0d)
- [ ] You have admin access to the GCP project
- [ ] You have a code editor (VS Code recommended)
- [ ] You have Node.js v18+ installed (`node --version`)
- [ ] You have npm 9+ installed (`npm --version`)
- [ ] You have Git installed (`git --version`)
- [ ] You have access to GitHub account (for deployment)
- [ ] You have Vercel account (free tier OK) for deployment
- [ ] You have read BUILDWISE_README.md
- [ ] You have read QUICK_REFERENCE.md
- [ ] You understand the architecture (see ARCHITECTURE.md)

**If any checkbox is unchecked:** Complete that first before proceeding.

---

## 🏗️ Phase 1: Google Cloud Infrastructure Setup

### 1.1 PostgreSQL Cloud SQL Instance
**Estimated Time:** 15 minutes  
**Document:** GOOGLE_CLOUD_SETUP.md Part 1.1

- [ ] Go to GCP Console → Cloud SQL
- [ ] Create PostgreSQL instance named "buildwise-postgres"
- [ ] Set version to PostgreSQL 14 (or latest stable)
- [ ] Set region to asia-southeast1
- [ ] Set tier to db-f1-micro (smallest, scales later)
- [ ] Enable public IP (for local development)
- [ ] Create database named "buildwise_db"
- [ ] Create user "buildwise_app" (NOT root/postgres)
- [ ] Set a strong password for buildwise_app user
- [ ] Enable SSL enforcement
- [ ] Note the connection string (save it!)
- [ ] Test connection with Cloud SQL Proxy

**Verification:**
```bash
psql -h [CLOUD_SQL_IP] -U buildwise_app -d buildwise_db -c "SELECT 1;"
# Should return: 1
```

### 1.2 BigQuery Dataset
**Estimated Time:** 10 minutes  
**Document:** GOOGLE_CLOUD_SETUP.md Part 1.2

- [ ] Go to GCP Console → BigQuery
- [ ] Create dataset named "gst_transactions"
- [ ] Set location to asia-southeast1
- [ ] Set default expiration to 90 days (optional)
- [ ] Create table "invoices" from schema file (backend/bigquery/invoices_schema.json)
- [ ] Create table "payments" from schema file (backend/bigquery/payments_schema.json)
- [ ] Create table "expenses" from schema file (backend/bigquery/expenses_schema.json)
- [ ] Verify all tables created successfully
- [ ] Note dataset project ID (usually same as project ID)

**Verification:**
```bash
bq ls gst_transactions
# Should list: invoices, payments, expenses
```

### 1.3 Cloud Storage Bucket
**Estimated Time:** 5 minutes  
**Document:** GOOGLE_CLOUD_SETUP.md Part 1.3

- [ ] Go to GCP Console → Cloud Storage
- [ ] Create bucket named "docuvault-invoices"
- [ ] Set location to asia-southeast1
- [ ] Set storage class to Standard
- [ ] Block all public access (important for security!)
- [ ] Enable versioning (optional, for audit trail)
- [ ] Create folders: /invoices, /receipts, /reports
- [ ] Note the bucket name

**Verification:**
```bash
gsutil ls gs://docuvault-invoices/
# Should list: invoices/, receipts/, reports/
```

### 1.4 Service Account
**Estimated Time:** 10 minutes  
**Document:** GOOGLE_CLOUD_SETUP.md Part 1.4

- [ ] Go to GCP Console → IAM & Admin → Service Accounts
- [ ] Create service account named "buildwise-app"
- [ ] Add description: "Service account for Buildwise application"
- [ ] Click "Create and Continue"
- [ ] Grant these roles:
  - [ ] BigQuery Admin
  - [ ] Storage Admin (or Custom: storage.buckets.*, storage.objects.*)
  - [ ] Vertex AI User (or Custom: aiplatform.*)
  - [ ] Cloud SQL Client
- [ ] Click "Continue"
- [ ] Create a JSON key (NOT P12)
- [ ] Download the JSON key → save as "buildwise-key.json"
- [ ] Move buildwise-key.json to backend/ directory
- [ ] **IMPORTANT:** Add buildwise-key.json to .gitignore
- [ ] Note the service account email: buildwise-app@project-*.iam.gserviceaccount.com

**Verification:**
```bash
cat backend/buildwise-key.json
# Should contain: type, project_id, private_key, client_email
```

### 1.5 Cloud SQL Permissions
**Estimated Time:** 5 minutes  
**Document:** GOOGLE_CLOUD_SETUP.md Part 1.5

- [ ] Go to GCP Console → Cloud SQL → buildwise-postgres
- [ ] Click "Edit"
- [ ] Scroll to "Connectivity"
- [ ] Add your local machine IP to authorized networks
  - [ ] Find your IP (Google "what is my IP")
  - [ ] Add it with /32 suffix (e.g., 203.0.113.45/32)
- [ ] For Vercel, add Vercel's IP ranges (get from Vercel docs)
  - [ ] Or use Cloud SQL Proxy instead
- [ ] Click "Save"
- [ ] Wait for instance to update (2-3 minutes)

**Verification:**
```bash
psql "postgresql://buildwise_app:PASSWORD@[IP]:5432/buildwise_db"
# Should connect successfully
```

### 1.6 Enable Required APIs
**Estimated Time:** 5 minutes  
**Document:** GOOGLE_CLOUD_SETUP.md Part 1.6

- [ ] Go to GCP Console → APIs & Services → Enabled APIs
- [ ] Enable these APIs (search for each):
  - [ ] Cloud SQL Admin API
  - [ ] BigQuery API
  - [ ] Cloud Storage JSON API
  - [ ] Vertex AI API
- [ ] Wait for each to complete (usually instant)

**Status After Phase 1:** ✅ GCP infrastructure ready

---

## 🔧 Phase 2: Local Development Setup

### 2.1 Backend Setup
**Estimated Time:** 20 minutes  
**Document:** GOOGLE_CLOUD_SETUP.md Part 2

- [ ] Navigate to backend directory: `cd backend`
- [ ] Install dependencies: `npm install`
  - Wait for all 200+ packages to install
- [ ] Copy environment template: `cp .env.example .env`
- [ ] Edit backend/.env file with your actual values:
  - [ ] DATABASE_URL = `postgresql://buildwise_app:PASSWORD@[IP]:5432/buildwise_db`
  - [ ] GOOGLE_CLOUD_PROJECT_ID = `project-92b2b5ff-5a11-4df5-a0d`
  - [ ] GOOGLE_APPLICATION_CREDENTIALS = `./buildwise-key.json`
  - [ ] GCS_BUCKET = `docuvault-invoices`
  - [ ] BIGQUERY_DATASET = `gst_transactions`
  - [ ] JWT_SECRET = Generate random 32-character string (e.g., `openssl rand -hex 16`)
  - [ ] ANTHROPIC_API_KEY = Leave blank (optional, for fallback)
  - [ ] Leave others as defaults
- [ ] Verify buildwise-key.json exists in backend/
- [ ] Initialize database: `npx prisma migrate dev`
  - Answer "Yes" if prompted to create migration
  - Wait for database tables to be created
- [ ] Verify TypeScript compiles: `npx tsc --noEmit`
  - Should show: "0 errors"

**Verification:**
```bash
npm run dev
# Should print:
# ✅ Google Cloud services initialized
#    - Project: project-92b2b5ff-5a11-4df5-a0d
#    - Region: asia-southeast1
# Server running on http://localhost:4000

# In another terminal, test:
curl http://localhost:4000/health
# Should return: {"ok":true}
```

### 2.2 Frontend Setup
**Estimated Time:** 15 minutes  
**Document:** GOOGLE_CLOUD_SETUP.md Part 2

- [ ] Navigate to frontend directory: `cd frontend`
- [ ] Install dependencies: `npm install`
  - Wait for all packages to install
- [ ] Create .env file (or verify it exists)
  - [ ] VITE_API_URL = `http://localhost:4000`
  - [ ] VITE_COMPANY_NAME = `JC Nexus`
  - [ ] VITE_PRODUCT_NAME = `Buildwise`
- [ ] Verify TypeScript compiles: `npm run build`
  - Should complete without errors

**Verification:**
```bash
npm run dev
# Should print:
#   Local:        http://localhost:5174/
#   press h + enter to show help

# Visit http://localhost:5174 in browser
# You should see login page
```

### 2.3 Git Setup (Optional but Recommended)
**Estimated Time:** 10 minutes

- [ ] Initialize git (if not already): `git init`
- [ ] Create .gitignore (if doesn't exist):
  ```
  # Credentials
  buildwise-key.json
  backend/.env
  backend/.env.local
  frontend/.env.local
  
  # Dependencies
  node_modules/
  
  # Build
  dist/
  build/
  .next/
  
  # IDE
  .vscode/
  .idea/
  *.swp
  
  # OS
  .DS_Store
  Thumbs.db
  ```
- [ ] Add all files: `git add .`
- [ ] Commit: `git commit -m "Initial Buildwise setup"`
- [ ] Create GitHub repository
- [ ] Add remote: `git remote add origin https://github.com/username/buildwise.git`
- [ ] Push: `git push -u origin main`

**Status After Phase 2:** ✅ Backend & Frontend running locally

---

## ✅ Phase 3: Local Testing & Verification

**Estimated Time:** 45 minutes  
**Document:** TESTING_AND_VERIFICATION.md

### 3.1 Health Checks
- [ ] Backend health: `curl http://localhost:4000/health`
- [ ] Frontend loads: Open http://localhost:5174
- [ ] Database connected: Check backend logs (no connection errors)
- [ ] Google Cloud services initialized: Check backend startup message

### 3.2 Authentication Testing
- [ ] Sign up new account (email/password)
- [ ] Verify user created in database
- [ ] Login with correct password
- [ ] Verify JWT token received
- [ ] Logout successfully
- [ ] Try login with wrong password (should fail)
- [ ] Request OTP via email
- [ ] Verify OTP code in email
- [ ] Complete 2FA setup (TOTP)

### 3.3 Business Profile
- [ ] Create business profile
- [ ] Verify data saved to PostgreSQL
- [ ] Edit business profile
- [ ] Verify changes reflected
- [ ] Delete business profile (optional)

### 3.4 Invoices
- [ ] Create invoice
- [ ] Verify invoice in database
- [ ] Verify invoice logged to BigQuery (query after 5 minutes)
- [ ] Edit invoice
- [ ] Delete invoice
- [ ] Upload invoice PDF
- [ ] Verify PDF saved to GCS
- [ ] Verify signed URL works

### 3.5 Expenses
- [ ] Create expense with text
- [ ] Verify Vertex AI categorizes it
- [ ] Verify expense in database
- [ ] Upload receipt image
- [ ] Verify Vertex AI extracts amount/category
- [ ] Edit expense
- [ ] Delete expense

### 3.6 Payments
- [ ] Create payment
- [ ] Verify payment in database
- [ ] Verify payment logged to BigQuery
- [ ] Edit payment
- [ ] Delete payment

### 3.7 AI Features
- [ ] Test /ai/categorize-expense endpoint
- [ ] Test /ai/ask endpoint
- [ ] Test /ai/generate-report endpoint
- [ ] Test /ai/invoice-insights endpoint
- [ ] Verify Vertex AI responses or fallback to Claude

### 3.8 BigQuery Verification
- [ ] Query invoices table: `SELECT COUNT(*) FROM gst_transactions.invoices;`
- [ ] Query payments table: `SELECT COUNT(*) FROM gst_transactions.payments;`
- [ ] Query expenses table: `SELECT COUNT(*) FROM gst_transactions.expenses;`
- [ ] Verify data matches what you created

### 3.9 Cloud Storage Verification
- [ ] List GCS files: `gsutil ls gs://docuvault-invoices/**`
- [ ] Verify PDFs and images uploaded
- [ ] Test signed URL download
- [ ] Verify signed URLs expire (check expiry date)

**Status After Phase 3:** ✅ Everything working locally

---

## 🚀 Phase 4: Vercel Deployment

**Estimated Time:** 45 minutes  
**Document:** VERCEL_DEPLOYMENT.md

### 4.1 Create Vercel Account
- [ ] Go to vercel.com
- [ ] Sign up (or login if already have account)
- [ ] Link GitHub account
- [ ] Authorize Vercel to access repositories

### 4.2 Deploy Backend
- [ ] Create new project on Vercel
- [ ] Select "Backend" template (or skip template)
- [ ] Select your GitHub repository
- [ ] Configure build settings:
  - [ ] Framework: Node.js
  - [ ] Build command: `npm run build`
  - [ ] Output directory: `dist`
  - [ ] Install command: `npm install`
- [ ] Add environment variables (Vercel Dashboard → Settings → Environment Variables):
  - [ ] DATABASE_URL (Cloud SQL connection string)
  - [ ] GOOGLE_CLOUD_PROJECT_ID
  - [ ] GOOGLE_APPLICATION_CREDENTIALS (base64-encoded key.json)
  - [ ] GCS_BUCKET
  - [ ] BIGQUERY_DATASET
  - [ ] JWT_SECRET
  - [ ] VERTEX_AI_ENABLE, VERTEX_AI_LOCATION, VERTEX_AI_MODEL_ID
  - [ ] All other variables from .env.example
- [ ] Deploy
- [ ] Wait for deployment to complete
- [ ] Note the deployment URL (e.g., buildwise-backend.vercel.app)

**Verification:**
```bash
curl https://buildwise-backend.vercel.app/health
# Should return: {"ok":true}
```

### 4.3 Deploy Frontend
- [ ] Create new Vercel project for frontend
- [ ] Select GitHub repository (frontend directory)
- [ ] Configure build settings:
  - [ ] Framework: Vite/React
  - [ ] Build command: `npm run build`
  - [ ] Output directory: `dist`
  - [ ] Install command: `npm install`
- [ ] Add environment variables:
  - [ ] VITE_API_URL = `https://buildwise-backend.vercel.app` (or your custom backend URL)
  - [ ] VITE_COMPANY_NAME = `JC Nexus`
  - [ ] VITE_PRODUCT_NAME = `Buildwise`
- [ ] Deploy
- [ ] Wait for deployment to complete
- [ ] Note the deployment URL (e.g., buildwise-frontend.vercel.app)

**Verification:**
```bash
# Open in browser:
https://buildwise-frontend.vercel.app
# Should load login page
```

### 4.4 Custom Domain Setup (Optional)
- [ ] Purchase domain (Namecheap, Google Domains, etc.)
- [ ] Add domain to Vercel (Settings → Domains)
- [ ] Update DNS records to point to Vercel
- [ ] Wait for DNS propagation (5-30 minutes)
- [ ] Verify domain works

### 4.5 GitHub Actions CI/CD (Optional)
- [ ] Create `.github/workflows/deploy.yml` in repository
- [ ] Configure workflow to auto-deploy on push
- [ ] Set approval requirements for production

**Status After Phase 4:** ✅ Application deployed to Vercel

---

## 🧪 Phase 5: Production Verification

**Estimated Time:** 30 minutes  
**Document:** TESTING_AND_VERIFICATION.md Part 7-8

### 5.1 Staging Environment
- [ ] Test login on staging backend URL
- [ ] Create invoice on staging
- [ ] Verify invoice appears in database
- [ ] Test all core features on staging
- [ ] Check for errors in Vercel logs: `vercel logs buildwise-backend --follow`

### 5.2 Production Environment
- [ ] Switch frontend VITE_API_URL to production backend
- [ ] Redeploy frontend
- [ ] Test login on production
- [ ] Create invoice on production
- [ ] Verify invoice saved correctly
- [ ] Test all features
- [ ] Monitor logs for errors

### 5.3 Monitoring Setup
- [ ] Set up Google Cloud Monitoring alerts
  - [ ] CPU utilization
  - [ ] Database connections
  - [ ] API response time
  - [ ] BigQuery query errors
- [ ] Set up Vercel alerts
  - [ ] Deployment failures
  - [ ] Build failures
  - [ ] 50x errors
- [ ] (Optional) Set up Sentry for error tracking

### 5.4 Security Verification
- [ ] Verify HTTPS/SSL working
- [ ] Test that buildwise-key.json NOT served publicly
- [ ] Verify .env variables NOT exposed in client code
- [ ] Test authentication flows
- [ ] Test multi-tenancy isolation
- [ ] Verify audit logs working

### 5.5 Performance Verification
- [ ] Load test with artillery or Apache Bench
- [ ] Monitor response times (should be <500ms)
- [ ] Monitor database performance
- [ ] Check BigQuery performance
- [ ] Verify caching working (browser dev tools)

**Status After Phase 5:** ✅ Production ready and verified

---

## 📊 Completion Checklist

### Documentation Read (Pre-Setup)
- [ ] BUILDWISE_README.md
- [ ] QUICK_REFERENCE.md
- [ ] ARCHITECTURE.md

### Infrastructure Setup (Phase 1)
- [ ] PostgreSQL Cloud SQL (1.1)
- [ ] BigQuery Dataset (1.2)
- [ ] Cloud Storage Bucket (1.3)
- [ ] Service Account (1.4)
- [ ] Cloud SQL Permissions (1.5)
- [ ] Enable Required APIs (1.6)

### Local Development (Phase 2)
- [ ] Backend Setup (2.1)
- [ ] Frontend Setup (2.2)
- [ ] Git Setup (2.3)

### Local Testing (Phase 3)
- [ ] Health Checks (3.1)
- [ ] Authentication (3.2)
- [ ] Business Profile (3.3)
- [ ] Invoices (3.4)
- [ ] Expenses (3.5)
- [ ] Payments (3.6)
- [ ] AI Features (3.7)
- [ ] BigQuery Verification (3.8)
- [ ] Cloud Storage Verification (3.9)

### Vercel Deployment (Phase 4)
- [ ] Vercel Account (4.1)
- [ ] Backend Deployment (4.2)
- [ ] Frontend Deployment (4.3)
- [ ] Custom Domain (4.4)
- [ ] GitHub Actions (4.5)

### Production Verification (Phase 5)
- [ ] Staging Tests (5.1)
- [ ] Production Tests (5.2)
- [ ] Monitoring Setup (5.3)
- [ ] Security Verification (5.4)
- [ ] Performance Verification (5.5)

---

## 🎉 Success Criteria - All Complete When:

- [x] ✅ You have read all documentation
- [x] ✅ All GCP resources created and verified
- [x] ✅ Backend running locally showing "Google Cloud services initialized"
- [x] ✅ Frontend loads at http://localhost:5174
- [x] ✅ Can create invoice and see it in database
- [x] ✅ Can upload PDF and verify in Cloud Storage
- [x] ✅ Can categorize expense using Vertex AI
- [x] ✅ BigQuery shows logged transactions
- [x] ✅ Backend deployed to Vercel
- [x] ✅ Frontend deployed to Vercel
- [x] ✅ Production endpoints responding correctly
- [x] ✅ All TypeScript compiled without errors (0 errors)
- [x] ✅ No hardcoded credentials anywhere
- [x] ✅ buildwise-key.json in .gitignore
- [x] ✅ Ready for customers!

---

## 📞 Troubleshooting Quick Links

| Issue | Reference |
|-------|-----------|
| Database connection failed | GOOGLE_CLOUD_SETUP.md Part 1.1 + Troubleshooting |
| BigQuery permission denied | GOOGLE_CLOUD_SETUP.md Part 1.4 |
| GCS upload fails | GOOGLE_CLOUD_SETUP.md Part 1.3 + Part 1.5 |
| Vertex AI not working | GOOGLE_CLOUD_SETUP.md Part 1.6 |
| Frontend can't reach backend | VERCEL_DEPLOYMENT.md Part 2 |
| Deployment failed | VERCEL_DEPLOYMENT.md Troubleshooting |
| TypeScript errors | Run `npx tsc --noEmit` and fix |
| Environment variables wrong | Check QUICK_REFERENCE.md Environment Variables |

---

## ⏱️ Estimated Total Time

- Pre-Setup Verification: 5 min
- Phase 1 (GCP Setup): 50 min
- Phase 2 (Local Development): 35 min
- Phase 3 (Local Testing): 45 min
- Phase 4 (Vercel Deployment): 45 min
- Phase 5 (Production Verification): 30 min

**Total: ~3-4 hours**

---

**Created:** 2024-09-15  
**Last Updated:** 2024-09-15  
**Version:** 1.0.0

**Ready to start? Begin with Phase 1: Google Cloud Infrastructure Setup!** 🚀
