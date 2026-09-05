# Buildwise by JC Nexus - Testing & Verification Guide

Complete testing suite for Google Cloud integration, authentication, and all features.

---

## PART 1: LOCAL DEVELOPMENT SETUP TEST

### Step 1.1: Verify Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Check TypeScript compiles
npm run build

# Verify environment
cat .env | grep -E "DATABASE_URL|GOOGLE_CLOUD|VERTEX_AI"

# Start server (should show "Google Cloud services initialized")
npm run dev
# Output should include:
# ✅ Google Cloud services initialized
#    - Project: project-92b2b5ff-5a11-4df5-a0d
#    - Region: asia-southeast1
#    - BigQuery Dataset: gst_transactions
#    - GCS Bucket: docuvault-invoices
```

### Step 1.2: Verify Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Check TypeScript compiles
npm run build

# Start dev server
npm run dev
# Should be available at http://localhost:5174
```

### Step 1.3: Verify Database Connection

```bash
# Option 1: With Cloud SQL Proxy
./cloud_sql_proxy -instances=project-92b2b5ff-5a11-4df5-a0d:asia-southeast1:buildwise-postgres=tcp:5432 &

# Option 2: Test connection directly
psql -h [CLOUD_SQL_IP] -U buildwise_app -d buildwise_db -c "SELECT 1"
# Expected output: 1

# Via backend server
curl http://localhost:4000/health
# Expected output: {"ok":true}
```

---

## PART 2: AUTHENTICATION TEST

### Test JWT Token Generation

```bash
# 1. Create user (signup)
curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123456",
    "name": "Test User"
  }'

# Expected response:
# {
#   "user": {"id": "...", "email": "test@example.com"},
#   "token": "eyJhbGc..."
# }

# 2. Login with credentials
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123456"
  }'

# 3. Use token in requests
export TOKEN="eyJhbGc..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/business
```

### Test OTP 2FA

```bash
# 1. Request OTP
curl -X POST http://localhost:4000/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Check database for OTP (valid 5 minutes)
# psql> SELECT * FROM "OTP" WHERE email='test@example.com';

# 2. Verify OTP
curl -X POST http://localhost:4000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "otp": "123456"  # From database
  }'
```

---

## PART 3: GOOGLE CLOUD SERVICES TEST

### Test BigQuery Connection

```bash
# Via gcloud CLI
bq ls datasets
# Expected: gst_transactions

bq head -5 gst_transactions.invoices
# Expected: Empty table initially

# Via backend (create an invoice to trigger logging)
curl -X POST http://localhost:4000/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  -d '{
    "customerName": "Test Customer",
    "lineItems": [{"itemId": "item1", "quantity": 1, "rate": 100}],
    "taxRate": 18
  }'

# Verify in BigQuery
bq query --use_legacy_sql=false 'SELECT * FROM `project-92b2b5ff-5a11-4df5-a0d.gst_transactions.invoices` LIMIT 1'
```

### Test Cloud Storage Connection

```bash
# Create test invoice
curl -X POST http://localhost:4000/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  -d '{...}'

# Verify file in GCS
gsutil ls -h gs://docuvault-invoices/invoices/[BUSINESS_ID]/
# Expected: BW-001.pdf (or similar)

# Test download
gsutil cp gs://docuvault-invoices/invoices/[BUSINESS_ID]/BW-001.pdf ./test.pdf
file ./test.pdf  # Should be PDF
```

### Test Vertex AI Connection

```bash
# Test expense categorization with Vertex AI
curl -X POST http://localhost:4000/ai/categorize-expense \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  -d '{
    "rawText": "TCS Consulting Invoice INV-001\nInvoice Date: 2024-09-01\nAmount: ₹50,000\nTax (18% GST): ₹9,000\nTotal: ₹59,000"
  }'

# Expected response:
# {
#   "expense": {
#     "category": "Professional Services",
#     "amount": 50000,
#     "taxAmount": 9000
#   },
#   "aiReasoning": "This is a consulting invoice from TCS..."
# }
```

### Test GCP Service Account Permissions

```bash
# Verify all required roles are assigned
PROJECT_ID="project-92b2b5ff-5a11-4df5-a0d"
SERVICE_ACCOUNT="buildwise-app@${PROJECT_ID}.iam.gserviceaccount.com"

# Check BigQuery permissions
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/bigquery.* AND bindings.members:${SERVICE_ACCOUNT}"

# Check Storage permissions
gsutil iam get gs://docuvault-invoices | grep buildwise-app

# Check Vertex AI permissions
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/aiplatform.* AND bindings.members:${SERVICE_ACCOUNT}"
```

---

## PART 4: FEATURE TESTING

### Test Expense Categorization (AI)

The expense upload accepts PDF, JPEG, and PNG files up to 10 MB. Select
several receipt files to create one expense preview per file. Selecting the
same file more than once, or confirming the same preview again, must not
create another database row.

For one image/PDF containing a table of expenses, Vertex AI returns one
preview per distinct row. Headers, blank rows, subtotals, tax-only rows, and
repeated OCR text are ignored. A normal itemized shopping receipt remains one
expense for its receipt total unless the document clearly labels its lines as
separate expenses. Unreadable rows are omitted for review instead of being
invented.

```bash
# Text-based receipt
curl -X POST http://localhost:4000/ai/categorize-expense \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  -d '{
    "rawText": "Stationery Purchase from ABC Stores\nDate: 2024-09-15\nNotebooks: ₹500\nPens: ₹200\nTotal: ₹700 (inc. 18% GST: ₹108)"
  }'

# With image URL
curl -X POST http://localhost:4000/ai/categorize-expense \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  -d '{
    "rawText": "...",
    "imageUrl": "gs://docuvault-invoices/receipts/.../receipt.jpg"
  }'

# Verify in database
curl -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  http://localhost:4000/expenses

# If Vertex AI returns a model, region, quota, or permission error and
# GEMINI_API_KEY is configured, the backend retries through Gemini API.
# This endpoint returns non-secret readiness data:
curl http://localhost:4000/health/google-cloud

# Supplier invoices are reviewed through the Purchase Bills page. Upload the
# PDF/image, match every extracted line to an inventory item, and save only
# after all lines are linked; the save transaction then increments stock.
```

### Test Bank Reconciliation

```bash
# Upload bank statement CSV
curl -X POST http://localhost:4000/bank/statements/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  -F "file=@statement.csv"

# Get matches
curl -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  http://localhost:4000/bank/statements

# Get discrepancies
curl -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  http://localhost:4000/bank/statements/discrepancies
```

### Test Notifications

```bash
# Trigger low stock notification
# 1. Create item with low quantity
curl -X POST http://localhost:4000/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  -d '{
    "name": "Test Item",
    "sku": "ITEM-001",
    "quantity": 2,
    "reorderLevel": 5
  }'

# 2. Trigger check
curl -X POST http://localhost:4000/notifications/check-low-stock \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]"

# 3. Get notifications
curl -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  http://localhost:4000/notifications

# Expected: LOW_STOCK notification created
```

### Test Dashboard KPIs

```bash
# Get summary report
curl -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  http://localhost:4000/reports/summary

# Expected response:
# {
#   "sales": 100000,
#   "gstCollected": 18000,
#   "receivables": 50000,
#   "expenses": 30000,
#   "payables": 20000,
#   "cashBalance": 25000,
#   "lastUpdated": "2024-09-15T10:30:00Z"
# }
```

---

## PART 5: SECURITY TESTING

### Test Authentication Enforcement

```bash
# Without token - should fail
curl http://localhost:4000/invoices
# Expected: 401 Unauthorized

# With invalid token - should fail
curl -H "Authorization: Bearer invalid_token" http://localhost:4000/invoices
# Expected: 401 Unauthorized

# With expired token - should fail
curl -H "Authorization: Bearer [EXPIRED_TOKEN]" http://localhost:4000/invoices
# Expected: 401 Unauthorized
```

### Test Business-Level Isolation

```bash
# Create business 1
curl -X POST http://localhost:4000/business \
  -H "Authorization: Bearer $TOKEN_USER1" \
  -d '{"name": "Business 1"}'
# Response: {"id": "biz1", ...}

# Create business 2 (different user)
curl -X POST http://localhost:4000/business \
  -H "Authorization: Bearer $TOKEN_USER2" \
  -d '{"name": "Business 2"}'
# Response: {"id": "biz2", ...}

# Try to access business 1 data with user 2 token
curl -H "Authorization: Bearer $TOKEN_USER2" \
  -H "X-Business-Id: biz1" \
  http://localhost:4000/invoices
# Expected: 403 Forbidden or empty results
```

### Test Rate Limiting (if implemented)

```bash
# Make 100+ requests rapidly
for i in {1..101}; do
  curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/health
done

# Expected: 429 Too Many Requests after limit
```

---

## PART 6: PERFORMANCE TESTING

### Load Test Database Queries

```bash
# Using Apache Bench
ab -n 1000 -c 10 \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  http://localhost:4000/invoices

# Expected: < 100ms average response time
```

### BigQuery Query Performance

```bash
# Test large data query
bq query --use_legacy_sql=false \
  'SELECT COUNT(*) as invoice_count FROM `project-92b2b5ff-5a11-4df5-a0d.gst_transactions.invoices`'

# Expected: < 2 seconds
```

### Vertex AI Response Time

```bash
# Measure AI request latency
time curl -X POST http://localhost:4000/ai/categorize-expense \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  -d '{...}'

# Expected: < 5 seconds (Vertex AI is slower than Claude)
```

---

## PART 7: STAGING DEPLOYMENT TEST

### Deploy to Vercel Staging

```bash
# Build and deploy to preview
vercel --prod --token $VERCEL_TOKEN

# Get staging URL
vercel ls

# Test all endpoints with staging backend
curl https://buildwise-backend-staging.vercel.app/health
```

### Test Staging Database Connection

```bash
# Verify Cloud SQL connection works from Vercel
curl -X POST https://buildwise-backend-staging.vercel.app/business \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Staging Test"}' \
  | jq

# Expected: 201 Created with new business data
```

### Test Staging BigQuery Logging

```bash
# Create invoice in staging
curl -X POST https://buildwise-backend-staging.vercel.app/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: [BUSINESS_ID]" \
  -d '{...}'

# Verify in BigQuery
bq query 'SELECT * FROM gst_transactions.invoices WHERE createdAt > CURRENT_TIMESTAMP() - INTERVAL 5 MINUTE'
```

---

## PART 8: PRODUCTION DEPLOYMENT TEST

### Pre-Production Checklist

- [ ] All tests pass locally
- [ ] TypeScript compiles without errors
- [ ] Database backups created
- [ ] Service account credentials rotated
- [ ] Environment variables set in Vercel
- [ ] Custom domain configured
- [ ] SSL certificates verified
- [ ] CDN cache configured
- [ ] Rate limiting enabled
- [ ] Error tracking configured

### Post-Deployment Verification

```bash
# 1. Health check
curl https://buildwise.app/health
# Expected: {"ok":true}

# 2. Auth flow
curl -X POST https://buildwise.app/auth/login \
  -d '{"email":"...","password":"..."}'

# 3. Create invoice
curl -X POST https://buildwise.app/invoices \
  -H "Authorization: Bearer $PROD_TOKEN" \
  -d '{...}'

# 4. Verify BigQuery logging (wait 1-2 minutes)
bq query 'SELECT COUNT(*) FROM gst_transactions.invoices'

# 5. Monitor errors
vercel logs buildwise-backend --follow

# 6. Check Google Cloud metrics
gcloud monitoring metrics-descriptors list | grep api
```

---

## PART 9: AUTOMATED TEST SUITE

Create `backend/tests/integration.test.ts`:

```typescript
import request from "supertest";
import app from "../src/index";

describe("Buildwise API Integration Tests", () => {
  let token: string;
  let businessId: string;

  beforeAll(async () => {
    // Create test user
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({
        email: "test@buildwise.app",
        password: "Test@123456",
        name: "Test User",
      });

    token = signupRes.body.token;

    // Create business
    const bizRes = await request(app)
      .post("/business")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Business" });

    businessId = bizRes.body.id;
  });

  describe("Authentication", () => {
    it("should reject requests without token", async () => {
      const res = await request(app).get("/invoices");
      expect(res.status).toBe(401);
    });

    it("should accept requests with valid token", async () => {
      const res = await request(app)
        .get("/invoices")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Business-Id", businessId);

      expect(res.status).toBe(200);
    });
  });

  describe("Google Cloud Integration", () => {
    it("should log invoice to BigQuery", async () => {
      const res = await request(app)
        .post("/invoices")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Business-Id", businessId)
        .send({
          customerName: "Test Customer",
          lineItems: [{ quantity: 1, rate: 100 }],
        });

      expect(res.status).toBe(201);
      // BigQuery logging is fire-and-forget, so we just check API response
    });

    it("should categorize expense with Vertex AI", async () => {
      const res = await request(app)
        .post("/ai/categorize-expense")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Business-Id", businessId)
        .send({
          rawText: "Stationery purchase ₹500 + GST ₹90 = ₹590",
        });

      expect(res.status).toBe(201);
      expect(res.body.expense.category).toBeDefined();
      expect(res.body.aiReasoning).toBeDefined();
    });
  });

  describe("Notifications", () => {
    it("should create low stock notification", async () => {
      await request(app)
        .post("/items")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Business-Id", businessId)
        .send({
          name: "Low Stock Item",
          quantity: 2,
          reorderLevel: 5,
        });

      const res = await request(app)
        .get("/notifications")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Business-Id", businessId);

      expect(res.status).toBe(200);
      // Check if LOW_STOCK notification exists
    });
  });
});
```

Run tests:

```bash
npm test
# or with coverage
npm test -- --coverage
```

---

## TROUBLESHOOTING

### Database Connection Fails

```bash
# Check if Cloud SQL Proxy is running
ps aux | grep cloud_sql_proxy

# Restart if needed
./cloud_sql_proxy -instances=project-92b2b5ff-5a11-4df5-a0d:asia-southeast1:buildwise-postgres=tcp:5432 &

# Verify connection
psql -h 127.0.0.1 -U buildwise_app -d buildwise_db -c "SELECT 1"
```

### Vertex AI Returns 403 Forbidden

```bash
# Verify service account has role
gcloud projects get-iam-policy project-92b2b5ff-5a11-4df5-a0d \
  --flatten="bindings[].members" \
  --filter="bindings.members:buildwise-app@* AND bindings.role:roles/aiplatform.user"

# Add role if missing
gcloud projects add-iam-policy-binding project-92b2b5ff-5a11-4df5-a0d \
  --member="serviceAccount:buildwise-app@project-92b2b5ff-5a11-4df5-a0d.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

### GCS Upload Fails

```bash
# Check bucket permissions
gsutil iam get gs://docuvault-invoices

# Add service account if missing
gsutil iam ch serviceAccount:buildwise-app@project-92b2b5ff-5a11-4df5-a0d.iam.gserviceaccount.com:objectCreator gs://docuvault-invoices
```

### BigQuery Quota Exceeded

```bash
# Check quota usage
bq show --project_id=project-92b2b5ff-5a11-4df5-a0d

# Increase quota: Google Cloud Console → APIs & Services → Quotas
```

---

## NEXT STEPS

✅ Run all tests in development
✅ Deploy to staging environment
✅ Run integration tests on staging
✅ Resolve any issues
✅ Deploy to production
✅ Monitor logs and metrics
✅ Set up alerts
