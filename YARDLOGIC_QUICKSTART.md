# YardLogic & iBIM Quick Start Guide

## Summary
Three production-ready features have been implemented to resolve the multi-tenant workspace issue:

1. **New Workspace Creation Endpoint** - Allows existing users to create new workspaces
2. **iBIM Demo Data Seeding** - Scripts to populate demo data for testing
3. **Complete Setup Documentation** - Full guide for backend and frontend integration

---

## 🚀 Quick Start: Get YardLogic Working (5 minutes)

### Step 1: Build & Deploy Backend
```powershell
cd yardlogic-app\backend
npm run build
npm test  # Optional: run tests
```

Deploy to Vercel or your hosting platform with:
```
APPLICATION_ID=ALL
```

### Step 2: Create YardLogic Workspace
After deploying, use your JWT token from logging in:

**PowerShell:**
```powershell
$token = "your-jwt-token-here"
$body = @{
    businessName = "My YardLogic Business"
    applicationId = "YARDLOGIC"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://your-backend.vercel.app/auth/workspace/create" `
  -Method POST `
  -Headers @{Authorization = "Bearer $token"; "Content-Type" = "application/json"} `
  -Body $body
```

**Bash/cURL:**
```bash
curl -X POST https://your-backend.vercel.app/auth/workspace/create \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "My YardLogic Business",
    "applicationId": "YARDLOGIC"
  }'
```

### Step 3: Log In with YardLogic Business
Frontend login now includes applicationId filtering:

```typescript
// In your frontend auth service
const response = await fetch(`${API_URL}/auth/login`, {
  method: 'POST',
  body: JSON.stringify({
    identifier: email,
    password: password,
    applicationId: 'YARDLOGIC'  // Filter to YardLogic
  })
});
```

---

## 🌱 Seed iBIM Demo Data (3 minutes)

### Step 1: Find Your iBIM Business ID
```bash
# Using psql
psql -h your-db-host -U postgres -d yardlogic -c \
  "SELECT id, name FROM \"Business\" WHERE \"applicationId\" = 'IBIM';"
```

Save this ID for the next step.

### Step 2: Run Seed Script (Windows)
```cmd
cd yardlogic-app\backend\src\scripts
seed_ibim_demo.bat YOUR_BUSINESS_ID_HERE localhost postgres yardlogic
```

### Step 3: Verify Demo Data
```bash
psql -h localhost -U postgres -d yardlogic -c \
  "SELECT count(*) as demo_members FROM \"IbimMember\" WHERE \"externalRef\" LIKE 'DEMO-%';"
```

Expected: 100 members, 100 policies

---

## 📚 Complete Documentation

### Backend Routes
| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/auth/signup` | POST | Create new user + workspace | None |
| `/auth/login` | POST | Login, filter by applicationId | None |
| **`/auth/workspace/create`** | **POST** | **Create workspace for existing user** | **Bearer Token** ⭐ |
| `/application/businesses` | GET | List all user businesses | Bearer Token |
| `/application/businesses/:id` | PATCH | Classify UNASSIGNED business | Bearer Token |

### Files Modified/Created

**Modified:**
- `backend/src/routes/auth.ts` - Added `/auth/workspace/create` endpoint

**Created:**
- `backend/src/scripts/YARDLOGIC_SETUP_GUIDE.md` - Full setup documentation
- `backend/src/scripts/seed_ibim_demo_flexible.sql` - Parameterized seed script
- `backend/src/scripts/seed_ibim_demo.bat` - Windows helper script
- `backend/src/scripts/seed_ibim_demo.sh` - Linux/Mac helper script

---

## 🔧 Frontend Integration (Update These Components)

### 1. Login Screen
```typescript
// components/Login.tsx
const handleLogin = async (email: string, password: string) => {
  const response = await apiClient.post('/auth/login', {
    identifier: email,
    password,
    applicationId: getSelectedApp() // 'YARDLOGIC' or 'IBIM'
  });
  
  if (response.businesses.length === 0) {
    showError('No businesses found for this app. Create one first.');
    return;
  }
  
  return response;
};
```

### 2. Business Switcher
```typescript
// components/BusinessSwitcher.tsx
const businesses = userBusinesses || [];
const yardlogicBusinesses = businesses.filter(
  b => b.applicationId === 'YARDLOGIC'
);
const ibimBusinesses = businesses.filter(
  b => b.applicationId === 'IBIM'
);

// Render tabs or dropdown for each app
```

### 3. Create Workspace Dialog
```typescript
// components/CreateWorkspaceDialog.tsx
const createWorkspace = async (name: string, app: 'YARDLOGIC' | 'IBIM') => {
  const response = await apiClient.post('/auth/workspace/create', {
    businessName: name,
    applicationId: app
  });
  
  // Refresh business list
  setUserBusinesses(response.businesses);
};
```

---

## ✅ Production Checklist

- [ ] Backend built and deployed with `APPLICATION_ID=ALL`
- [ ] Test `/auth/workspace/create` endpoint works
- [ ] Create YardLogic workspace successfully
- [ ] Log in with `applicationId: 'YARDLOGIC'` filter
- [ ] X-Business-Id header correctly set in all requests
- [ ] iBIM demo data seeded (100+ members visible)
- [ ] Frontend business switcher working for both apps
- [ ] Mobile responsive testing (next: focus area)
- [ ] Smoke tests pass for both IBIM and YARDLOGIC flows
- [ ] RBAC staff role assignment UI (future)
- [ ] Email webhook callbacks wired (future)

---

## 🐛 Troubleshooting

### Error: "No business linked with applicationId='YARDLOGIC'"
**Solution:** Create workspace using new endpoint (see Step 2 above)

### Error: "userBusinesses does not exist"
**Solution:** Backend code has been fixed. Rebuild with `npm run build`

### Seed script shows 0 records
**Solution:** 
1. Verify business ID is correct: `SELECT id FROM "Business" WHERE "applicationId" = 'IBIM';`
2. Update seed script with correct ID
3. Rerun: `seed_ibim_demo.bat YOUR_CORRECT_ID localhost postgres yardlogic`

### Frontend can't see YardLogic business after login
**Solution:** 
1. Ensure login sends `applicationId: 'YARDLOGIC'`
2. Check response.businesses array contains YardLogic business
3. Set X-Business-Id header on all subsequent requests

---

## 📝 Environment Variables

Ensure your deployment has these set:
```
APPLICATION_ID=ALL
DATABASE_URL=postgres://...
JWT_SECRET=your-secret
NODE_ENV=production
```

---

## 🎯 Next Priority Features

After setup validation:
1. **RBAC Management UI** - Staff role assignment screen
2. **Email Webhooks** - Delivery status tracking (Razormail callbacks)
3. **GDPR UI** - User-facing privacy/export screen
4. **Mobile Polish** - Responsive design testing
5. **Smoke Tests** - GitHub Actions validation

---

## 📖 References

- Full setup guide: `backend/src/scripts/YARDLOGIC_SETUP_GUIDE.md`
- Seed script (flexible): `backend/src/scripts/seed_ibim_demo_flexible.sql`
- Auth routes: `backend/src/routes/auth.ts`
- Database schema: `backend/prisma/schema.prisma`

---

## Questions?

Check the full documentation in `YARDLOGIC_SETUP_GUIDE.md` or review the auth routes implementation for detailed examples.
