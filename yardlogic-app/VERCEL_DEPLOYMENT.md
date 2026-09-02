# Buildwise by JC Nexus - Vercel Deployment Guide

This guide covers deploying the Buildwise backend (Express API) to Vercel and configuring frontend (React/Vite) deployment.

---

## PART 1: BACKEND DEPLOYMENT (Node.js API on Vercel)

### Step 1.1: Prepare Vercel Configuration Files

Create `backend/vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

Create `backend/.vercelignore`:

```
node_modules/
.git/
.env
.env.local
buildwise-key.json
*.log
dist/
```

Update `backend/package.json` build script:

```json
{
  "scripts": {
    "build": "tsc && prisma generate",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  }
}
```

### Step 1.2: Deploy to Vercel

```bash
cd backend

# Install Vercel CLI
npm install -g vercel

# Login and deploy
vercel login
vercel

# Follow prompts:
# - Select project name: buildwise-backend
# - Link to existing project? No (first time)
# - Framework preset? Other
# - Root directory? . (current)
# - Build command: npm run build
# - Output directory: dist
# - Development command: npm run dev
```

### Step 1.3: Set Environment Variables in Vercel Dashboard

```bash
# Via CLI (preferred for secrets)
vercel env add DATABASE_URL
vercel env add GOOGLE_CLOUD_PROJECT_ID
vercel env add GOOGLE_APPLICATION_CREDENTIALS
vercel env add GCS_BUCKET
vercel env add BIGQUERY_DATASET
vercel env add BIGQUERY_REGION
vercel env add VERTEX_AI_ENABLE
vercel env add VERTEX_AI_LOCATION
vercel env add VERTEX_AI_MODEL_ID
vercel env add JWT_SECRET
vercel env add COMPANY_NAME
vercel env add PRODUCT_NAME
vercel env add INVOICES_PREFIX
vercel env add NODE_ENV=production
```

Or via **Vercel Dashboard** → Your Project → Settings → Environment Variables:

```
DATABASE_URL=postgresql://buildwise_app:PASSWORD@[CLOUD_SQL_IP]:5432/buildwise_db?schema=public
GOOGLE_CLOUD_PROJECT_ID=project-92b2b5ff-5a11-4df5-a0d
GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-key.json
GCS_BUCKET=docuvault-invoices
BIGQUERY_DATASET=gst_transactions
BIGQUERY_REGION=asia-southeast1
VERTEX_AI_ENABLE=true
VERTEX_AI_LOCATION=asia-southeast1
VERTEX_AI_MODEL_ID=gemini-1.5-pro
VERTEX_AI_SUBSCRIPTION_REQUIRED=false
JWT_SECRET=[GENERATE_RANDOM_32_CHAR_STRING]
COMPANY_NAME=JC Nexus
PRODUCT_NAME=Buildwise
INVOICES_PREFIX=BW
NODE_ENV=production
```

### Step 1.4: Handle GCP Service Account Key

**Option A: Via Vercel Build Script (RECOMMENDED)**

Create `backend/scripts/setup-gcp-credentials.sh`:

```bash
#!/bin/bash
# This script runs during Vercel build to create the GCP credentials file

if [ -n "$GCP_SERVICE_ACCOUNT_KEY" ]; then
  echo "$GCP_SERVICE_ACCOUNT_KEY" > /tmp/buildwise-key.json
  export GOOGLE_APPLICATION_CREDENTIALS="/tmp/buildwise-key.json"
fi
```

Update `backend/package.json`:

```json
{
  "scripts": {
    "build": "bash scripts/setup-gcp-credentials.sh && tsc && prisma generate",
    "start": "node dist/index.js"
  }
}
```

In Vercel Dashboard, add environment variable:

```
GCP_SERVICE_ACCOUNT_KEY=<entire JSON content of buildwise-key.json as a string>
```

**Option B: Via Vercel Secrets (SIMPLER)**

```bash
# Copy entire JSON key as single line
cat buildwise-key.json | jq -c . | xclip

# Paste into Vercel dashboard as: GCP_SERVICE_ACCOUNT_KEY
```

### Step 1.5: Database Migrations on Deploy

Create `backend/scripts/migrate.sh`:

```bash
#!/bin/bash
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "✅ Migrations complete"
```

Update `vercel.json` post-build hook:

```json
{
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "env": {
    "NODE_ENV": "production"
  },
  "functions": {
    "dist/index.js": {
      "memory": 1024,
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    }
  ]
}
```

**Note:** Migrations in serverless are tricky. Instead, run locally before deploying:

```bash
# Local: Run migrations before deployment
npx prisma migrate deploy

# Then deploy
vercel --prod
```

### Step 1.6: Get Your Backend URL

After deployment:

```bash
vercel ls  # List projects
vercel env ls  # Verify variables

# Your backend URL will be:
# https://buildwise-backend.vercel.app
```

---

## PART 2: FRONTEND DEPLOYMENT (React on Vercel)

### Step 2.1: Update Frontend Environment

Create `frontend/.env.production`:

```
VITE_API_URL=https://buildwise-backend.vercel.app
VITE_COMPANY_NAME=JC Nexus
VITE_PRODUCT_NAME=Buildwise
VITE_GCS_BUCKET=docuvault-invoices
VITE_GCP_PROJECT_ID=project-92b2b5ff-5a11-4df5-a0d
```

Update `frontend/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
```

### Step 2.2: Deploy Frontend to Vercel

```bash
cd frontend

# Login (same account as backend)
vercel login

# Deploy
vercel

# Prompts:
# - Project name: buildwise-frontend
# - Framework: Vite
# - Output directory: dist
# - Build command: npm run build
# - Installation command: npm install
```

### Step 2.3: Set Frontend Environment Variables

Via Vercel Dashboard → Frontend Project → Settings → Environment Variables:

```
VITE_API_URL=https://buildwise-backend.vercel.app
VITE_COMPANY_NAME=JC Nexus
VITE_PRODUCT_NAME=Buildwise
```

### Step 2.4: Configure Domains

```bash
# Add custom domain (optional)
vercel domains add buildwise.app

# Add DNS records (shown in Vercel dashboard)
# Nameservers or CNAME records depending on provider
```

---

## PART 3: MONITORING & DEBUGGING

### View Logs

```bash
# Backend logs
vercel logs buildwise-backend

# Frontend logs
vercel logs buildwise-frontend

# Real-time logs
vercel logs buildwise-backend --follow
```

### Common Issues

**Issue: Database Connection Timeout**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:** Cloud SQL Proxy not running. Update DATABASE_URL to use public IP:

```
DATABASE_URL=postgresql://user:pass@[CLOUD_SQL_PUBLIC_IP]:5432/buildwise_db?sslmode=require
```

**Issue: Vertex AI Permission Denied**

```
Error: 403 Forbidden: User does not have aiplatform.user
```

**Fix:** Verify service account has role `roles/aiplatform.user`:

```bash
gcloud projects get-iam-policy project-92b2b5ff-5a11-4df5-a0d \
  --flatten="bindings[].members" \
  --filter="bindings.members:buildwise-app@*"
```

**Issue: GCS Upload Fails**

```
Error: Permission denied. User does not have storage.objects.create
```

**Fix:** Grant storage permissions:

```bash
gsutil iam ch serviceAccount:buildwise-app@PROJECT_ID.iam.gserviceaccount.com:objectCreator gs://docuvault-invoices
```

---

## PART 4: CONTINUOUS DEPLOYMENT

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: cd backend && npm install

      - name: Run tests
        run: cd backend && npm test || true

      - name: Deploy to Vercel
        run: |
          cd backend
          npx vercel --prod \
            --token=${{ secrets.VERCEL_TOKEN }} \
            --build-env DATABASE_URL=${{ secrets.DATABASE_URL }} \
            --build-env GOOGLE_CLOUD_PROJECT_ID=${{ secrets.GOOGLE_CLOUD_PROJECT_ID }}

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: cd frontend && npm install

      - name: Build
        run: cd frontend && npm run build

      - name: Deploy to Vercel
        run: |
          cd frontend
          npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### Environment Secrets in GitHub

```bash
# Add to GitHub Secrets (Settings → Secrets and variables)
VERCEL_TOKEN=<from https://vercel.com/account/tokens>
DATABASE_URL=postgresql://...
GOOGLE_CLOUD_PROJECT_ID=project-92b2b5ff-5a11-4df5-a0d
GCP_SERVICE_ACCOUNT_KEY=<JSON key as string>
```

---

## PART 5: ROLLBACK & VERSIONING

### Rollback to Previous Deployment

```bash
# List deployments
vercel ls

# Rollback to specific deployment
vercel promote [deployment-url]

# Or use dashboard: Deployments → Click → Promote
```

### Semantic Versioning

Update `backend/package.json`:

```json
{
  "version": "1.0.0"
}
```

Tag releases:

```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

---

## CHECKLIST: PRE-DEPLOYMENT

- [ ] All tests pass locally (`npm test`)
- [ ] TypeScript compiles without errors (`tsc --noEmit`)
- [ ] `.env.example` updated with all required variables
- [ ] Database backup created (`pg_dump`)
- [ ] Migrations tested locally
- [ ] GCP credentials loaded and tested
- [ ] Vercel project created and linked
- [ ] Environment variables set in Vercel
- [ ] Custom domain configured (if applicable)
- [ ] Error tracking (Sentry) configured
- [ ] CDN cache settings optimized
- [ ] Rate limiting configured
- [ ] Monitoring alerts set up

---

## NEXT STEPS

1. Complete Part 1 (Backend deployment)
2. Complete Part 2 (Frontend deployment)
3. Test all endpoints from deployed URLs
4. Monitor logs for errors
5. Set up alerts and monitoring
