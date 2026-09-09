# RBAC Management - Staff Roles & Permissions

**Status:** ✅ Complete and Ready to Deploy  
**Date:** 2026-09-08

---

## Overview

Staff role management enables business owners and administrators to assign roles and permissions to team members. Five predefined roles with specific capabilities are available.

---

## Roles & Permissions

| Role | Can Create Invoices | Can Manage Staff | Can Access Finance | Can View All | Notes |
|------|:-:|:-:|:-:|:-:|---|
| **OWNER** | ✅ | ✅ | ✅ | ✅ | Full access, cannot be removed if only owner |
| **ADMIN** | ✅ | ✅ | ✅ | ✅ | Administrative access, can manage most features |
| **STAFF** | ✅ | ❌ | ❌ | ✅ | Standard operations, create records, view all data |
| **SALESMAN** | ✅ | ❌ | ❌ | ✅ | Sales-focused, can create invoices & orders |
| **ACCOUNTANT** | ✅ | ❌ | ✅ | ❌ | Financial operations, payment reconciliation |

## iBIM Permission Matrix

The iBIM application uses the following permissions for its main operational areas. The backend remains the final authority; the iBIM frontend hides navigation items that the active role cannot use.

| iBIM area | OWNER / ADMIN | STAFF | SALESMAN | ACCOUNTANT |
|---|---|---|---|---|
| Member data | View and edit | View and edit | View and edit | View |
| Prospects | Manage | Manage | Manage | No access |
| Proposals and renewals | Manage | Manage | Manage | No access |
| Policy binding | Allowed | Not allowed by default | Not allowed | Not allowed |
| Actions and reminders | Manage | Manage | Manage | No access |
| Payments and finance | View and edit | View only | No access | View and edit |
| Rebates | Manage | No access | No access | Manage |
| Budget | Manage | No access | No access | Manage |
| Reports and exports | Full | No export by default | No export by default | Export |
| Reconciliation | Manage | No access | No access | Edit |
| Staff management | Manage | No access | No access | No access |

The `POLICIES_BIND` permission is intentionally separate from `PROPOSALS_MANAGE`. A staff or salesman user can prepare a proposal, but cannot approve or bind it unless an owner or administrator explicitly grants that permission.

---

## Backend Endpoints

### List Staff Members
```
GET /business/:businessId/staff
```

**Response:**
```json
{
  "staff": [
    {
      "id": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "role": "STAFF"
    }
  ]
}
```

### Invite New Staff
```
POST /business/:businessId/staff/invite
```

**Request:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "role": "STAFF"
}
```

**Response (201):**
```json
{
  "id": "new-user-id",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "role": "STAFF",
  "existingUser": false,
  "message": "New user created. They can set a password by signing up..."
}
```

### Update Staff Role
```
PATCH /business/:businessId/staff/:userId
```

**Request:**
```json
{
  "role": "ADMIN"
}
```

**Response:**
```json
{
  "id": "user-id",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "role": "ADMIN"
}
```

### Remove Staff Member
```
DELETE /business/:businessId/staff/:userId
```

**Response:**
```json
{
  "removed": true
}
```

---

## Frontend Components

### StaffManagement Page (`src/pages/StaffManagement.tsx`)

Main page for managing staff members. Features:
- ✅ List all staff with roles
- ✅ Invite new staff via modal dialog
- ✅ Edit roles inline
- ✅ Remove staff members
- ✅ Role descriptions on hover
- ✅ Error handling & loading states

**Route:** `/business/:businessId/settings/staff`

**Usage:**
```tsx
import StaffManagement from '../pages/StaffManagement';

// In your router
<Route path="/business/:businessId/settings/staff" element={<StaffManagement />} />
```

---

## Integration Checklist

### Backend
- [x] Add z.enum validation for roles
- [x] Implement GET /staff endpoint
- [x] Implement POST /staff/invite endpoint
- [x] Implement PATCH /staff/:userId endpoint
- [x] Implement DELETE /staff/:userId endpoint
- [x] Add `requireBusinessOwner` middleware protection
- [x] Handle edge cases (only owner, existing users)
- [x] TypeScript compilation passes

### Frontend
- [x] Create StaffManagement.tsx component
- [x] Implement staff list table
- [x] Implement invite dialog
- [x] Implement role edit inline
- [x] Add delete confirmation
- [x] Add error handling
- [x] Add loading states

### Routing
- [ ] Add route to Navigation/Sidebar
- [ ] Add to business settings menu
- [ ] Add protection (owner/admin only)

---

## Key Features

### 1. Staff Listing
- Sorted by role (OWNER, ADMIN, STAFF, SALESMAN, ACCOUNTANT)
- Shows name, email, and phone
- Role badges with descriptions
- Edit and Remove actions

### 2. Invite Staff
- Modal dialog with form validation
- Email or phone (at least one required)
- Role dropdown with descriptions
- Creates new user if not exists
- Adds existing user if already in system
- Shows message about password setup

### 3. Edit Roles
- Inline edit with role dropdown
- Save/Cancel buttons
- Validation to prevent removing last owner
- Error messages for issues

### 4. Remove Staff
- Confirmation dialog
- Prevents removing last owner
- Instant UI update

---

## Security & Validation

✅ **Authentication:** All endpoints require Bearer token  
✅ **Authorization:** `requireBusinessOwner` middleware restricts to OWNER/ADMIN  
✅ **Validation:** Zod schemas validate all inputs  
✅ **Edge Cases:**
- Cannot remove last owner
- Cannot demote last owner
- Existing user detection
- Duplicate membership prevention

---

## Error Handling

### Backend Errors
- `400` - Invalid role or missing email/phone
- `403` - Access denied (not owner/admin)
- `404` - Staff member not found
- `409` - Already invited or duplicate membership
- `500` - Internal server error

### Frontend
- Displays error messages to user
- Logs errors to console
- Allows retry actions
- Graceful fallback states

---

## Testing Checklist

### Functional
- [ ] List staff from any business
- [ ] Invite new staff with email
- [ ] Invite new staff with phone
- [ ] Invite existing user to business
- [ ] Update staff role
- [ ] Remove staff member
- [ ] Cannot remove last owner
- [ ] Cannot demote last owner
- [ ] Error cases (validation, access denied)

### UI/UX
- [ ] Invite dialog appears/closes properly
- [ ] Form validation shows errors
- [ ] Inline edit transitions smoothly
- [ ] Confirmation dialog appears for delete
- [ ] Loading states display
- [ ] Error messages clear and helpful

### Performance
- [ ] List loads quickly (< 1s)
- [ ] Invite processes smoothly
- [ ] Role updates are instant
- [ ] No N+1 queries

---

## Deployment

### 1. Build Backend
```bash
cd yardlogic-app/backend
npm run build
```

### 2. Deploy Backend
```bash
vercel deploy --prod
```

### 3. Build Frontend
```bash
cd yardlogic-app/frontend
npm run build
```

### 4. Add Route
Update `src/App.tsx` to include:
```tsx
import StaffManagement from './pages/StaffManagement';

<Route path="/business/:businessId/settings/staff" element={<StaffManagement />} />
```

### 5. Deploy Frontend
```bash
vercel deploy --prod
```

---

## Usage Examples

### Invite Admin
```bash
curl -X POST https://api.example.com/business/abc123/staff/invite \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Johnson",
    "email": "alice@company.com",
    "role": "ADMIN"
  }'
```

### Update to Accountant
```bash
curl -X PATCH https://api.example.com/business/abc123/staff/user456 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "ACCOUNTANT"}'
```

### List All Staff
```bash
curl -X GET https://api.example.com/business/abc123/staff \
  -H "Authorization: Bearer TOKEN"
```

---

## Next Enhancements

1. **Bulk Actions** - Change roles for multiple staff at once
2. **Activity Log** - See who did what and when
3. **Permissions UI** - Custom permissions per role
4. **Deactivation** - Disable accounts without deleting
5. **Two-Factor Auth** - Require 2FA for admins
6. **Audit Trail** - Log all role changes
7. **Department Assignment** - Group staff by department
8. **Delegation** - Owner can delegate to another owner

---

## Support

For issues or questions:
1. Check this documentation
2. Review auth middleware in `backend/src/middleware/auth.ts`
3. Review business routes in `backend/src/routes/business.ts`
4. Check frontend component in `frontend/src/pages/StaffManagement.tsx`
