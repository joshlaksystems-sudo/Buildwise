# Buildwise by JC Nexus - Google Cloud Integration Setup Guide

**Project Details:**
- Company: JC Nexus
- Product: Buildwise
- GCP Project ID: `project-92b2b5ff-5a11-4df5-a0d`
- BigQuery Dataset: `gst_transactions`
- GCS Bucket: `docuvault-invoices`
- Region: `asia-southeast1`
- Vertex AI Features: Full suite (expense categorization, report generation, invoice insights)

---

## PART 1: GOOGLE CLOUD SETUP (Do this first)

### Step 1.1: Create PostgreSQL in Google Cloud SQL

```bash
# Enable required APIs
gcloud services enable sqladmin.googleapis.com

# Create PostgreSQL instance (asia-southeast1)
gcloud sql instances create buildwise-postgres \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-southeast1 \
  --availability-type=REGIONAL \
  --backup-start-time=03:00 \
  --enable-bin-log \
  --storage-auto-increase \
  --network=default

# Set root password
gcloud sql users set-password postgres \
  --instance=buildwise-postgres \
  --password=YOUR_SECURE_PASSWORD_HERE

# Create database for Buildwise
gcloud sql databases create buildwise_db \
  --instance=buildwise-postgres

# Create application user (not root)
gcloud sql users create buildwise_app \
  --instance=buildwise-postgres \
  --password=YOUR_APP_PASSWORD_HERE

# Get the public IP (you'll need this for .env)
gcloud sql instances describe buildwise-postgres \
  --format='get(ipAddresses[0].ipAddress)'
```

**Output you'll need:**
- PostgreSQL Instance Name: `buildwise-postgres`
- Public IP: `[noted above]`
- Port: `5432`
- Database: `buildwise_db`
- User: `buildwise_app`
- Password: `[noted above]`

---

### Step 1.2: Create Google Cloud Storage Bucket (for invoices)

```bash
# Enable Storage API
gcloud services enable storage-api.googleapis.com

# Create bucket
gsutil mb -c STANDARD -l asia-southeast1 gs://docuvault-invoices/

# Set lifecycle policy (delete old invoices after 7 years for compliance)
cat > lifecycle.json << 'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 2555}
      }
    ]
  }
}
EOF

gsutil lifecycle set lifecycle.json gs://docuvault-invoices/

# Create folders in bucket
echo "" | gsutil cp - gs://docuvault-invoices/invoices/
echo "" | gsutil cp - gs://docuvault-invoices/receipts/
echo "" | gsutil cp - gs://docuvault-invoices/reports/

# Make bucket private (required for security)
gsutil uniformbucketlevelaccess set on gs://docuvault-invoices/
```

**Bucket URL:** `gs://docuvault-invoices`

---

### Step 1.3: Create BigQuery Dataset (for analytics)

```bash
# Enable BigQuery API
gcloud services enable bigquery.googleapis.com

# Create dataset
bq mk \
  --dataset \
  --location=asia-southeast1 \
  --description="Buildwise GST transactions and analytics" \
  gst_transactions

# Create invoice table
bq mk --table \
  gst_transactions.invoices \
  backend/bigquery/invoices_schema.json

# Create payment table
bq mk --table \
  gst_transactions.payments \
  backend/bigquery/payments_schema.json

# Create expense table
bq mk --table \
  gst_transactions.expenses \
  backend/bigquery/expenses_schema.json
```

---

### Step 1.4: Create Service Account (for app to access GCP services)

```bash
# Create service account
gcloud iam service-accounts create buildwise-app \
  --display-name="Buildwise Application Service Account"

# Service account email will be: buildwise-app@project-92b2b5ff-5a11-4df5-a0d.iam.gserviceaccount.com
gcloud iam service-accounts describe buildwise-app@project-92b2b5ff-5a11-4df5-a0d.iam.gserviceaccount.com

# Create and download key (JSON)
gcloud iam service-accounts keys create buildwise-key.json \
  --iam-account=buildwise-app@project-92b2b5ff-5a11-4df5-a0d.iam.gserviceaccount.com
```

**IMPORTANT:** Keep `buildwise-key.json` safe! Store it securely and add to `.gitignore`.

---

### Step 1.5: Assign IAM Permissions to Service Account

```bash
PROJECT_ID="project-92b2b5ff-5a11-4df5-a0d"
SERVICE_ACCOUNT="buildwise-app@${PROJECT_ID}.iam.gserviceaccount.com"

# Permissions for BigQuery (read + write invoices, payments, expenses)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/bigquery.jobUser"

# Permissions for Cloud Storage (read + write invoices)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/storage.objectCreator"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/storage.objectViewer"

# Permissions for Vertex AI (for AI features)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/aiplatform.user"

# Permissions for Cloud SQL (optional, if needing more control)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudsql.client"
```

**Permissions Summary:**
- ✅ BigQuery: Read/Write data + Run jobs
- ✅ Cloud Storage: Upload/Read invoices
- ✅ Vertex AI: Run agents and LLMs
- ✅ Cloud SQL: Connect to PostgreSQL

---

### Step 1.6: Configure PostgreSQL Network Access

```bash
# Allow Vercel IP ranges (Vercel uses multiple IPs)
# Add these CIDR ranges to Cloud SQL authorized networks:

gcloud sql instances patch buildwise-postgres \
  --authorized-networks=0.0.0.0/0 \
  --backup-start-time=03:00

# For production, replace 0.0.0.0/0 with specific Vercel IPs from:
# https://vercel.com/docs/infrastructure/data-cache#deploying-to-vercel

# Create Cloud SQL Proxy for local development:
# Download: https://cloud.google.com/sql/docs/postgres/sql-proxy
# Run locally: ./cloud_sql_proxy -instances=project-92b2b5ff-5a11-4df5-a0d:asia-southeast1:buildwise-postgres=tcp:5432
```

---

## PART 2: BACKEND SETUP (.env variables)

Create `.env` in `backend/` directory:

```bash
# ===== DATABASE (PostgreSQL on Google Cloud SQL) =====
DATABASE_URL="postgresql://buildwise_app:YOUR_APP_PASSWORD@[CLOUD_SQL_PUBLIC_IP]:5432/buildwise_db?schema=public"
# Example: postgresql://buildwise_app:SecurePass123@34.126.74.123:5432/buildwise_db?schema=public

# ===== GOOGLE CLOUD =====
GOOGLE_CLOUD_PROJECT_ID="project-92b2b5ff-5a11-4df5-a0d"
GOOGLE_APPLICATION_CREDENTIALS="./buildwise-key.json"  # Path to service account key
GCS_BUCKET="docuvault-invoices"
BIGQUERY_DATASET="gst_transactions"
BIGQUERY_REGION="asia-southeast1"

# ===== VERTEX AI =====
VERTEX_AI_LOCATION="asia-southeast1"
VERTEX_AI_MODEL_ID="gemini-1.5-pro"  # Latest Vertex AI model
VERTEX_AI_ENABLE=true
VERTEX_AI_SUBSCRIPTION_REQUIRED=true  # Only use AI if user subscribed

# ===== AUTHENTICATION =====
JWT_SECRET="your-super-secret-jwt-key-change-this"
ANTHROPIC_API_KEY="sk-ant-..."  # For fallback (non-Vertex) AI

# ===== SERVER =====
PORT=4000
NODE_ENV="development"

# ===== COMPANY BRANDING =====
COMPANY_NAME="JC Nexus"
PRODUCT_NAME="Buildwise"
INVOICES_PREFIX="BW"
```

---

## PART 3: FRONTEND SETUP (.env variables)

Create `.env` in `frontend/` directory:

```bash
VITE_API_URL="http://localhost:4000"  # Local dev
VITE_COMPANY_NAME="JC Nexus"
VITE_PRODUCT_NAME="Buildwise"
VITE_GCS_BUCKET="docuvault-invoices"
VITE_GCP_PROJECT_ID="project-92b2b5ff-5a11-4df5-a0d"
```

---

## PART 4: VERCEL DEPLOYMENT

### Step 4.1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 4.2: Set Environment Variables in Vercel

```bash
# Login to Vercel
vercel login

# Link project
vercel link

# Add secrets (production)
vercel env add DATABASE_URL
vercel env add GOOGLE_APPLICATION_CREDENTIALS
vercel env add GOOGLE_CLOUD_PROJECT_ID
vercel env add GCS_BUCKET
vercel env add BIGQUERY_DATASET
vercel env add JWT_SECRET
vercel env add VERTEX_AI_MODEL_ID
```

### Step 4.3: Vercel Environment Variables (Dashboard)

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Add these variables:

```
ENVIRONMENT: production
DATABASE_URL=postgresql://buildwise_app:PASSWORD@[CLOUD_SQL_PUBLIC_IP]:5432/buildwise_db?schema=public
GOOGLE_CLOUD_PROJECT_ID=project-92b2b5ff-5a11-4df5-a0d
GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-key.json
GCS_BUCKET=docuvault-invoices
BIGQUERY_DATASET=gst_transactions
BIGQUERY_REGION=asia-southeast1
VERTEX_AI_LOCATION=asia-southeast1
VERTEX_AI_MODEL_ID=gemini-1.5-pro
VERTEX_AI_ENABLE=true
VERTEX_AI_SUBSCRIPTION_REQUIRED=true
JWT_SECRET=[RANDOM_32_CHAR_STRING]
COMPANY_NAME=JC Nexus
PRODUCT_NAME=Buildwise
NODE_ENV=production
```

### Step 4.4: Create Vercel Build Configuration

File: `backend/vercel.json`

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "env": {
    "NODE_ENV": "production"
  },
  "functions": {
    "src/index.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

### Step 4.5: Update package.json Scripts

```json
{
  "scripts": {
    "build": "tsc && prisma generate",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  }
}
```

---

## PART 5: GOOGLE CLOUD STORAGE PERMISSIONS

### Storage Account Permissions

```bash
PROJECT_ID="project-92b2b5ff-5a11-4df5-a0d"
SERVICE_ACCOUNT="buildwise-app@${PROJECT_ID}.iam.gserviceaccount.com"
BUCKET="docuvault-invoices"

# Grant role to service account for bucket
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectCreator gs://${BUCKET}
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectViewer gs://${BUCKET}

# Verify permissions
gsutil iam get gs://${BUCKET}
```

### Folder Permissions (within bucket)

```bash
# Invoices folder (write)
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectCreator gs://${BUCKET}/invoices/

# Receipts folder (read/write)
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectEditor gs://${BUCKET}/receipts/

# Reports folder (read-only for app, write for scheduled jobs)
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectViewer gs://${BUCKET}/reports/
```

---

## PART 6: PostgreSQL PERMISSIONS

### Database User Permissions

```sql
-- Connect as postgres user via Cloud SQL Proxy
-- psql -h 127.0.0.1 -U postgres -d buildwise_db

-- Grant schema permissions
GRANT USAGE ON SCHEMA public TO buildwise_app;
GRANT CREATE ON SCHEMA public TO buildwise_app;

-- Grant table permissions (for existing tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO buildwise_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO buildwise_app;

-- Grant default permissions (for future tables)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO buildwise_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO buildwise_app;

-- Verify permissions
\du buildwise_app
\dn public
```

### Row-Level Security (optional, for multi-tenant safety)

```sql
-- Enable RLS on sensitive tables
ALTER TABLE "public"."Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Expense" ENABLE ROW LEVEL SECURITY;

-- Create policy (business-level isolation)
CREATE POLICY business_isolation ON "public"."Invoice"
  USING (businessId = current_setting('app.business_id'));
```

---

## PART 7: TESTING CHECKLIST

### Local Development Testing

- [ ] PostgreSQL connection works (via Cloud SQL Proxy)
- [ ] BigQuery dataset exists and is accessible
- [ ] GCS bucket is writable
- [ ] Vertex AI models are accessible
- [ ] JWT tokens generate and validate
- [ ] Invoices upload to GCS
- [ ] Transactions sync to BigQuery
- [ ] AI features work with subscription check

### Staging Testing (Vercel Preview)

- [ ] Environment variables loaded correctly
- [ ] PostgreSQL connection from Vercel works
- [ ] GCS uploads work
- [ ] BigQuery queries execute
- [ ] Vertex AI calls succeed
- [ ] Error logs appear in Vercel dashboard

### Production Testing (Vercel Main)

- [ ] All staging tests pass
- [ ] Database backups configured
- [ ] Monitoring alerts set up
- [ ] Error tracking (Sentry) working
- [ ] API response times acceptable
- [ ] GCS costs monitored

---

## PART 8: SECURITY CHECKLIST

- [ ] Service account key stored in `.env` (not committed to git)
- [ ] `.gitignore` includes `buildwise-key.json`, `.env`, `.env.local`
- [ ] PostgreSQL has strong password (20+ chars, mixed case + numbers)
- [ ] GCS bucket has uniform access control enabled
- [ ] BigQuery dataset has project-level access control
- [ ] Vercel secrets configured (not visible in logs)
- [ ] Cloud SQL has SSL enforcement enabled
- [ ] Backup policies configured
- [ ] VPC Service Controls configured (optional, for extra security)

---

## PART 9: MONITORING & ALERTS

### Google Cloud Monitoring

```bash
# Create alert for high database connections
gcloud alpha monitoring policies create \
  --notification-channels=[CHANNEL_ID] \
  --display-name="High PostgreSQL Connections" \
  --condition-display-name="Connections > 80" \
  --condition-threshold-value=80 \
  --condition-threshold-comparison-type=COMPARISON_GT
```

### Error Tracking

```bash
# Install Sentry or similar
npm install @sentry/node @sentry/tracing
```

### BigQuery Cost Monitoring

```bash
# Set up budget alerts
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="Buildwise BigQuery Budget" \
  --budget-amount=100 \
  --threshold-rule=percent=80
```

---

## TROUBLESHOOTING

### PostgreSQL Connection Error

```
Error: could not connect to database server: Connection timed out
```

**Fix:** Use Cloud SQL Proxy or whitelist your IP in SQL instance authorized networks

```bash
# Local dev: run Cloud SQL Proxy
./cloud_sql_proxy -instances=project-92b2b5ff-5a11-4df5-a0d:asia-southeast1:buildwise-postgres=tcp:5432
```

### GCS Permission Denied

```
Error: Permission denied. User does not have storage.objects.create
```

**Fix:** Verify service account has `roles/storage.objectCreator` for the bucket

```bash
gsutil iam get gs://docuvault-invoices/
```

### Vertex AI Model Not Found

```
Error: Model not found: gemini-1.5-pro
```

**Fix:** Verify model is available in your region and you have quota

```bash
gcloud ai-platform models list --location=asia-southeast1
```

### BigQuery Dataset Access Denied

```
Error: 403 Forbidden: User does not have bigquery.datasets.get permission
```

**Fix:** Grant `roles/bigquery.dataEditor` to service account

```bash
gcloud projects add-iam-policy-binding project-92b2b5ff-5a11-4df5-a0d \
  --member="serviceAccount:buildwise-app@project-92b2b5ff-5a11-4df5-a0d.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
```

---

## NEXT STEPS

1. **Complete Part 1** (Google Cloud setup) first
2. Update `.env` files with actual credentials
3. Run local tests with Prisma
4. Deploy to Vercel staging
5. Run integration tests
6. Deploy to production
7. Monitor logs and alerts

**Estimated setup time:** 2-3 hours for complete configuration
