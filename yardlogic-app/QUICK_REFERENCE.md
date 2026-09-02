# Buildwise by JC Nexus - Quick Reference Card

**Status:** ✅ Production Ready | **Phases:** 1-5 Complete | **Cloud:** Google Cloud

---

## 🎯 30-Second Overview

Buildwise is a **complete, production-ready business management SaaS** with:
- 📱 React frontend + Node.js backend (Vercel)
- 🗄️ PostgreSQL (Google Cloud SQL)
- 🤖 Vertex AI (expense categorization, reports, insights)
- 📊 BigQuery (transaction analytics)
- 💾 Cloud Storage (invoice management)
- ✅ Zero hardcoded credentials
- 🔒 Multi-tenant, role-based access

**Estimated Setup Time:** 3-4 hours total

---

## 📚 Documentation (Read in This Order)

| # | Document | Time | Purpose |
|---|----------|------|---------|
| 1 | [BUILDWISE_README.md](BUILDWISE_README.md) | 10 min | Project overview + quick start |
| 2 | [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md) | 90 min | **START HERE** - Create GCP resources |
| 3 | [backend/.env.example](backend/.env.example) | 5 min | Copy values from GCP setup into .env |
| 4 | [TESTING_AND_VERIFICATION.md](TESTING_AND_VERIFICATION.md) | 30 min | Validate everything works locally |
| 5 | [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) | 45 min | Deploy to production |

---

## ⚡ Quick Start (5 Minutes)

```bash
# 1. Get credentials from GCP (GOOGLE_CLOUD_SETUP.md Part 1-6)
# Copy buildwise-key.json to backend/

# 2. Setup environment
cd backend
npm install
cp .env.example .env
# Edit .env with GCP credentials

# 3. Initialize database
npx prisma migrate dev

# 4. Start backend
npm run dev
# Should print: ✅ Google Cloud services initialized

# 5. In another terminal: Start frontend
cd frontend
npm install
npm run dev
# Access at http://localhost:5174
```

---

## 🔑 Key Files Reference

### Google Cloud Integration
- **Service:** `backend/src/services/googleCloud.ts` (main GCP client)
- **Routes:** `backend/src/routes/ai.ts` (Vertex AI endpoints)
- **Schemas:** `backend/bigquery/*.json` (BigQuery tables)

### Configuration
- **Backend:** `backend/.env` (create from .env.example)
- **Environment:** See GOOGLE_CLOUD_SETUP.md Part 2
- **Database:** `backend/prisma/schema.prisma`

### Documentation
- **Setup:** GOOGLE_CLOUD_SETUP.md (9 comprehensive sections)
- **Deploy:** VERCEL_DEPLOYMENT.md (full deployment guide)
- **Test:** TESTING_AND_VERIFICATION.md (complete test suite)

---

## 🚀 Deployment Checklist

### Local Setup (Do First)
- [ ] Create GCP resources (GOOGLE_CLOUD_SETUP.md Parts 1-6)
- [ ] Download buildwise-key.json
- [ ] Create backend/.env file
- [ ] Run `npx prisma migrate dev`
- [ ] Verify `npm run dev` shows "Google Cloud services initialized"
- [ ] Test all endpoints (TESTING_AND_VERIFICATION.md Parts 1-6)

### Staging Deployment (Then)
- [ ] Follow VERCEL_DEPLOYMENT.md Part 1 (backend)
- [ ] Set environment variables in Vercel
- [ ] Verify staging endpoints work
- [ ] Run staging tests (TESTING_AND_VERIFICATION.md Part 7)

### Production Deployment (Finally)
- [ ] Follow VERCEL_DEPLOYMENT.md Part 2 (frontend)
- [ ] Deploy backend with `vercel --prod`
- [ ] Deploy frontend with `vercel --prod`
- [ ] Run production tests (TESTING_AND_VERIFICATION.md Part 8)
- [ ] Setup monitoring & alerts

---

## 🔧 Essential Commands

```bash
# Backend
cd backend
npm install                          # Install dependencies
npx prisma migrate dev              # Run database migrations
npm run dev                         # Start dev server (port 4000)
npx tsc --noEmit                   # Check TypeScript
npm test                           # Run tests

# Frontend
cd frontend
npm install                         # Install dependencies
npm run dev                        # Start dev server (port 5174)
npm run build                      # Build for production

# Google Cloud
gcloud auth login                  # Authenticate with GCP
gcloud sql connect buildwise-postgres --user=postgres  # Connect to DB
gsutil ls gs://docuvault-invoices/                    # List GCS files
bq query "SELECT * FROM gst_transactions.invoices"    # Query BigQuery
```

---

## 🌍 Environment Variables Summary

### Backend `.env` (Required)

```
# Database
DATABASE_URL=postgresql://buildwise_app:PASSWORD@[IP]:5432/buildwise_db

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=project-92b2b5ff-5a11-4df5-a0d
GOOGLE_APPLICATION_CREDENTIALS=./buildwise-key.json
GCS_BUCKET=docuvault-invoices
BIGQUERY_DATASET=gst_transactions

# AI
VERTEX_AI_ENABLE=true
VERTEX_AI_LOCATION=asia-southeast1
VERTEX_AI_MODEL_ID=gemini-1.5-pro

# Auth
JWT_SECRET=[RANDOM_32_CHAR_STRING]

# Branding
COMPANY_NAME=JC Nexus
PRODUCT_NAME=Buildwise
```

### Frontend `env` (Required)

```
VITE_API_URL=http://localhost:4000  # dev, or https://backend.vercel.app prod
VITE_COMPANY_NAME=JC Nexus
VITE_PRODUCT_NAME=Buildwise
```

---

## 🔐 Security Essentials

- ✅ **Never commit** buildwise-key.json (add to .gitignore)
- ✅ **Never commit** .env files with real credentials
- ✅ **Use** Vercel secrets for production
- ✅ **Rotate** service account keys regularly
- ✅ **Enable** Cloud SQL SSL enforcement
- ✅ **Check** Cloud Storage bucket policies
- ✅ **Verify** IAM roles quarterly

---

## 📊 API Quick Reference

### Authentication
```
POST /auth/login              - Login (email + password)
POST /auth/signup             - Create account
POST /auth/request-otp        - Get OTP
POST /auth/verify-otp         - Verify OTP & login
```

### AI Features
```
POST /ai/categorize-expense   - Categorize receipt (Vertex AI)
POST /ai/ask                  - Natural language query
POST /ai/generate-report      - Generate AI report
POST /ai/invoice-insights     - Get invoice analysis
```

### Core Features
```
POST /invoices                - Create invoice
GET  /invoices                - List invoices
POST /expenses                - Create expense
POST /bank/statements/upload  - Upload bank CSV
GET  /notifications           - Get alerts
```

**Add headers to all requests:**
```
Authorization: Bearer [JWT_TOKEN]
X-Business-Id: [BUSINESS_UUID]
Content-Type: application/json
```

---

## 🐛 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "Database connection refused" | Run Cloud SQL Proxy: `./cloud_sql_proxy -instances=...` |
| "Vertex AI permission denied" | Add `roles/aiplatform.user` to service account (GOOGLE_CLOUD_SETUP.md) |
| "Cannot find buildwise-key.json" | Download from GCP Console IAM → Service Accounts |
| "Frontend can't reach backend" | Update `VITE_API_URL` in frontend/.env |
| "BigQuery quota exceeded" | Increase quota in Google Cloud Console → APIs & Services |
| "GCS upload fails" | Run: `gsutil iam ch serviceAccount:buildwise-app@...:objectCreator gs://docuvault-invoices` |

See full troubleshooting in:
- GOOGLE_CLOUD_SETUP.md PART 9
- VERCEL_DEPLOYMENT.md TROUBLESHOOTING
- TESTING_AND_VERIFICATION.md TROUBLESHOOTING

---

## 📞 Support Resources

**Setup Issues:** → GOOGLE_CLOUD_SETUP.md TROUBLESHOOTING (Part 9)
**Deployment Issues:** → VERCEL_DEPLOYMENT.md TROUBLESHOOTING
**Testing Issues:** → TESTING_AND_VERIFICATION.md (Part 9)
**Code Issues:** → Check console output + Vercel logs
**Database Issues:** → Check Prisma migrations + Cloud SQL dashboard

---

## ✅ Success Verification

After setup, you should see:

```
✅ Google Cloud services initialized
   - Project: project-92b2b5ff-5a11-4df5-a0d
   - Region: asia-southeast1
   - BigQuery Dataset: gst_transactions
   - GCS Bucket: docuvault-invoices

✅ TypeScript: 0 errors (npx tsc --noEmit)

✅ Database: Connected (SELECT 1 via psql)

✅ API: Health check returns {"ok":true}

✅ AI: Vertex AI categorizes expenses automatically

✅ Notifications: Real-time alerts working

✅ BigQuery: Invoices logging automatically
```

---

## 🎯 Feature Checklist (Post-Deployment)

- [ ] Login works (email/password + OTP)
- [ ] Create invoice & see in database
- [ ] Upload expense → AI categorizes
- [ ] Upload bank CSV → Auto-matches payments
- [ ] Dashboard shows KPIs
- [ ] Notifications appear for low stock
- [ ] Invoice PDF uploads to GCS
- [ ] Transaction logs in BigQuery
- [ ] Custom business pages accessible
- [ ] 2FA (TOTP) setup optional

---

## 📈 Production Monitoring

```bash
# View logs
vercel logs buildwise-backend --follow

# Check health
curl https://buildwise-backend.vercel.app/health

# Database backup
pg_dump -h [IP] -U buildwise_app buildwise_db > backup.sql

# BigQuery usage
gcloud billing budgets describe [BUDGET_ID]
```

---

## 🎓 Learning Resources

- [Express.js Docs](https://expressjs.com/)
- [Prisma ORM Docs](https://www.prisma.io/docs/)
- [Google Cloud Docs](https://cloud.google.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Docs](https://react.dev/)

---

## 🎉 You're Ready!

**Next Step:** Follow GOOGLE_CLOUD_SETUP.md and start building!

Questions? Check the full documentation in order:
1. BUILDWISE_README.md
2. GOOGLE_CLOUD_SETUP.md  
3. VERCEL_DEPLOYMENT.md
4. TESTING_AND_VERIFICATION.md

---

**Buildwise by JC Nexus**  
**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** 2024-09-15
