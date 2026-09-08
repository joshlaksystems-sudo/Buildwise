# YardLogic Multi-Tenant Setup Guide

## Problem
After authentication, users with APPLICATION_ID='ALL' need to have separate workspaces for different applications (iBIM and YardLogic). Currently:
- iBIM businesses work fine (have applicationId='IBIM')
- YardLogic businesses don't exist (need applicationId='YARDLOGIC')

## Solution Overview

### Three-Step Process

#### Step 1: Use the New Workspace Creation Endpoint
Once authenticated with your existing account, call the new endpoint to create a YardLogic workspace:

**Endpoint:** `POST /auth/workspace/create`
**Auth:** Requires Bearer token from login

```bash
curl -X POST http://localhost:3000/auth/workspace/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "My YardLogic Business",
    "applicationId": "YARDLOGIC"
  }'
```

**Response (201):**
```json
{
  "workspace": {
    "id": "business-uuid-here",
    "name": "My YardLogic Business",
    "applicationId": "YARDLOGIC"
  },
  "user": {
    "id": "user-uuid-here",
    "name": "Your Name"
  },
  "businesses": [
    {
      "id": "ibim-business-id",
      "name": "iBIM Business",
      "applicationId": "IBIM",
      "role": "OWNER"
    },
    {
      "id": "yardlogic-business-id",
      "name": "My YardLogic Business",
      "applicationId": "YARDLOGIC",
      "role": "OWNER"
    }
  ]
}
```

#### Step 2: Log In with YardLogic Application ID
After creating the workspace, the frontend can filter to YardLogic by passing the applicationId:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "your@email.com",
    "password": "your-password",
    "applicationId": "YARDLOGIC"
  }'
```

#### Step 3: Use X-Business-Id Header
Once logged in, use the returned business ID in all subsequent requests:

```bash
curl -X GET http://localhost:3000/invoices \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-Business-Id: yardlogic-business-id"
```

---

## Frontend Integration

### After Login
```typescript
// In frontend auth flow, after successful login
const response = await apiClient.post('/auth/login', {
  identifier: email,
  password,
  applicationId: 'YARDLOGIC'  // Filter to YardLogic businesses
});

// If no YardLogic businesses returned:
if (!response.businesses.some(b => b.applicationId === 'YARDLOGIC')) {
  // Create new workspace
  const workspace = await apiClient.post('/auth/workspace/create', {
    businessName: 'My YardLogic Business',
    applicationId: 'YARDLOGIC'
  });
  
  // Use the new workspace
  setSelectedBusiness(workspace.workspace.id);
}
```

### Business Switcher
```typescript
// Render selector for both IBIM and YardLogic businesses
const businesses = loginResponse.businesses;
const ibimBusinesses = businesses.filter(b => b.applicationId === 'IBIM');
const yardlogicBusinesses = businesses.filter(b => b.applicationId === 'YARDLOGIC');
```

---

## Backend Route Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auth/signup` | POST | None | Create new user + first business |
| `/auth/login` | POST | None | Login user, filter by applicationId |
| `/auth/workspace/create` | POST | Bearer Token | Create new workspace for existing user |
| `/application/businesses` | GET | Bearer Token | List all user businesses |
| `/application/businesses/:id` | PATCH | Bearer Token | Classify UNASSIGNED business to IBIM/YARDLOGIC |

---

## Seeding Demo Data for iBIM

### Step 1: Locate the Seed Script
File: `yardlogic-app/backend/src/scripts/seed_ibim_demo_100.sql`

### Step 2: Run the Migration
```bash
# Using psql directly
psql -h your-db-host -U postgres -d your-database < yardlogic-app/backend/src/scripts/seed_ibim_demo_100.sql

# Or using Prisma CLI
# First, ensure seed_ibim_demo_100.sql is in prisma/migrations or accessible
```

### Step 3: Verify Demo Data
```sql
-- Check that demo data was created
SELECT
  (SELECT count(*) FROM "IbimMember" WHERE "businessId" = 'BUSINESS_ID' AND "externalRef" LIKE 'DEMO-%') AS demo_members,
  (SELECT count(*) FROM "IbimPolicy" WHERE "businessId" = 'BUSINESS_ID' AND "policyNumber" LIKE 'DEMO-POL-%') AS demo_policies,
  (SELECT count(*) FROM "IbimProposal" WHERE "businessId" = 'BUSINESS_ID') AS demo_proposals;
```

Expected output: 100 members, 100 policies, 10 proposals

---

## Environment Configuration

Ensure your backend is deployed with:
```bash
APPLICATION_ID=ALL        # Allow multi-tenancy
DATABASE_URL=...          # PostgreSQL connection
JWT_SECRET=...           # For token signing
```

For development:
```bash
cp .env.example .env.local
# Edit .env.local with your database URL
npm run dev
```

---

## Troubleshooting

### "No business linked with applicationId='YARDLOGIC'"
**Solution:** User needs to call `POST /auth/workspace/create` with `"applicationId": "YARDLOGIC"`

### "Only owner/admin can classify this business"
**Solution:** Use `/auth/workspace/create` instead of the classification endpoint. The classification endpoint is for existing UNASSIGNED businesses only.

### "This business is already classified"
**Solution:** The business has already been assigned an applicationId and cannot be changed. Create a new workspace instead.

### Demo data shows 0 records
**Possible causes:**
- SQL script didn't run successfully (check database logs)
- Business ID in the seed script doesn't match your iBIM business ID
- The SQL transaction was rolled back

**Solution:** 
1. Verify the business ID: `SELECT id, "applicationId" FROM "Business" WHERE "applicationId" = 'IBIM'`
2. Update the SQL script with the correct business ID
3. Rerun the seed script

---

## Production Deployment Checklist

- [ ] `APPLICATION_ID=ALL` configured in Vercel environment
- [ ] Database migrations applied (`npx prisma migrate deploy`)
- [ ] iBIM demo seed data (if using iBIM): run seed script
- [ ] Frontend handles business switcher for multi-tenant selection
- [ ] X-Business-Id header validation working in auth middleware
- [ ] Smoke tests passing with both IBIM and YARDLOGIC applicationIds
- [ ] Staff role management UI implemented (future: RBAC assignment screen)
- [ ] Email delivery webhooks wired (future: provider callbacks)
- [ ] GDPR export/anonymization API tested (future: user-facing screen)

---

## Next Steps After Setup

1. **Immediate:** Create YardLogic workspace using new endpoint
2. **Short-term:** Seed iBIM demo data, run smoke tests
3. **Medium-term:** 
   - Build staff role management UI (RBAC assignment)
   - Wire email delivery webhooks (Razormail/SendGrid callbacks)
   - Add GDPR user-facing privacy screen
4. **Long-term:**
   - Reconciliation field mapping confirmation with clients
   - Saved report templates implementation
   - Mobile responsive testing and polish
