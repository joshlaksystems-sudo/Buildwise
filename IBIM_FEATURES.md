# iBIM Insurance Mutual Platform

## 1. Purpose

The iBIM application is a web-based operational platform for a UK insurance broker managing a mutual for trade association members. It replaces spreadsheet-led administration and manual email chasing with:

- A tenant-scoped master member and policy record.
- Digital proposal and renewal workflows.
- Prospect, new-business, underwriting, quote, bind, and renewal operations.
- Finance, payments, rebates, budgets, and bordereaux controls.
- Management reporting, KPI summaries, exports, reconciliation, audit, and privacy tools.
- Role-based and permission-based access control.
- Scheduled renewal campaigns and overdue chases.

The platform is designed for the current operating scale of approximately 100 or fewer proposals per week. It uses PostgreSQL/Prisma for transactional data and can publish analytics copies separately where configured.

## 2. Application and Tenant Isolation

The production deployment can serve both applications from one backend using:

```text
APPLICATION_ID=ALL
```

Every protected request requires:

1. A valid bearer token.
2. A valid `X-Business-Id` membership.
3. A matching `X-Application-Id` when the backend is configured as `ALL`.
4. A valid role or named permission for restricted operations.

All iBIM operational entities are scoped by `businessId`. YardLogic and iBIM may share user identity and authentication records, but their business-owned operational records are isolated.

## 3. Main Navigation

### Workspace

- Control room.
- All member data.
- Prospects.
- New business.
- Renewals.
- Actions.
- Bordereaux.

### Finance and Accounts

- Payments.
- Rebates.
- Budget.

### Business Insights

- Weekly reporting.
- Monthly reporting.
- Board pack.

### Operations and Governance

- Proposal forms.
- Policy register.
- Spreadsheet migration.
- Policy-system reconciliation.
- Email delivery.
- Activity timeline.
- Audit history.
- Staff and permission management.

## 4. Control Room and Management Overview

The iBIM control room provides summary visibility for:

- Active members.
- Open proposals.
- Renewals due in the reporting horizon.
- Open workflow actions.
- Premium tracked.
- Latest proposals.
- Work in motion.
- Outstanding workflow actions.

The overview is business-scoped and reads from the iBIM master records and workflow tables.

## 5. Master Member Data

`IbimMember` is the master member record. It supports:

- Legal name.
- Trading name.
- Contact name.
- Email.
- Phone.
- Address.
- External reference.
- Source: form, import, or manual.
- Status: prospect, active, or inactive.
- Created and updated timestamps.

The member record links to:

- Proposals.
- Policies.
- Workflow tasks.
- Workflow events.
- Rebate allocations.
- Payments.
- Migration evidence.

### Member import

The migration workflow supports:

- CSV upload.
- Field alias normalization.
- Required field validation.
- Duplicate detection by email, phone, external reference, and legal name.
- Same-file duplicate detection.
- Accepted, rejected, and flagged outcomes.
- Migration batch and row evidence.
- Audit history.
- Privacy export and anonymization routes.

## 6. Prospects

Prospects have a dedicated `IbimProspect` record with:

- Company name.
- Email.
- Renewal date.
- Linked member.
- Linked policy.
- Source.
- Campaign status.
- Last contacted timestamp.
- Response timestamp.
- Lost reason.

Supported statuses include:

```text
IMPORTED
FLAGGED
CONTACTED
PROPOSAL_RECEIVED
CONVERTED
LOST
```

Available operations:

```text
GET  /ibim/prospects
POST /ibim/prospects
```

The automation service also creates or updates prospects from qualifying renewal policies.

## 7. Digital Proposal Forms

The proposal model supports both:

- `NEW_BUSINESS`
- `RENEWAL`

Each proposal stores:

- Business and member links.
- Form definition and version.
- Previous proposal link for renewal chains.
- JSON form data.
- Validation issues.
- Submission timestamp.
- Effective date.
- Workflow status.
- Audit and workflow events.

The current validated proposal fields include:

- Business description.
- Trade association.
- Annual turnover.
- Employee count.
- Requested cover.

Proposal operations include:

```text
GET  /ibim/proposals
POST /ibim/proposals
POST /ibim/proposals/:id/access-link
POST /ibim/proposals/:id/renew
PATCH /ibim/proposals/:id/status
```

Renewal creation copies the previous proposal data into a new renewal draft and creates a review task.

### Public proposal access

A signed, time-limited proposal token allows a prospect to:

- Open a proposal form without an account.
- Submit validated proposal data.
- Move the proposal to `SUBMITTED`.

Public routes are scoped by the signed proposal token and never expose other proposals.

## 8. Proposal and Underwriting Workflow

The supported status vocabulary includes:

```text
DRAFT
SUBMITTED
PROPOSAL_RECEIVED
IN_REVIEW
AWAITING_UNDERWRITING
QUOTE_APPROVED
QUOTE_PREPARED
QUOTE_SENT
QUOTED
ACCEPTED
BOUND
DECLINED
RENEWAL_OVERDUE
LAPSED
```

The workflow supports the following operational stages:

1. Enquiry or prospect identified.
2. Proposal requested.
3. Proposal submitted or returned.
4. Underwriting review.
5. Quote approved.
6. Quote prepared in the external policy system.
7. Quote sent.
8. Client decision.
9. Accepted or declined.
10. Policy bound.
11. Post-bind finance and reporting.

### Atomic policy binding

When a proposal is moved to `BOUND` with a policy number, the backend transaction:

- Updates the proposal.
- Creates or updates the policy.
- Stores premium, commission, insurer, reference, inception, and renewal data.
- Creates a premium transaction when a premium is supplied.
- Completes open tasks for that proposal.
- Writes an audit event.

This prevents a partially bound record where the proposal says bound but the policy or financial ledger is missing.

## 9. Policies and Renewals

`IbimPolicy` stores:

- Policy number.
- Insurer.
- External policy reference.
- Policy status.
- Inception date.
- Renewal date.
- Premium.
- Commission.
- Member and proposal links.

Renewal views include:

- Renewal list filtering.
- Renewal calendar.
- Overdue policies.
- Next 30 days.
- 31-60 days.
- 61-90 days.
- Renewal tasks.
- Renewal proposal creation.

## 10. Automated Renewal Campaigns

The scheduled automation uses date buckets and an idempotent `IbimAutomationRun` record. Supported campaign points are:

- 42 days before renewal: initial renewal campaign.
- 28 days before renewal: first reminder.
- 14 days before renewal: second reminder.
- 7 days before renewal: final reminder.
- 1 day overdue: overdue reminder.
- 7 days overdue: overdue escalation.
- 14 days overdue: further escalation.
- 21 days overdue: management escalation point.

Each campaign action can:

- Create a prospect record.
- Create a workflow task.
- Send an email when an email address exists.
- Record email delivery success or failure.
- Write an idempotency record so the same bucket is not sent twice.

Vercel production execution uses:

```text
GET /internal/cron/ibim
```

The endpoint requires:

```text
Authorization: Bearer <CRON_SECRET>
```

It is scheduled daily at 00:00 UTC in the backend Vercel configuration to remain compatible with Vercel Hobby accounts. A local process also starts an hourly scheduler when the backend runs as a persistent process.

## 11. Actions and Workflow Tasks

`IbimWorkflowTask` supports:

- Prospecting.
- New business.
- Renewal.
- Chaser.
- Post-bind.

Each task stores:

- Business.
- Member.
- Proposal.
- Policy.
- Assigned user.
- Status.
- Due date.
- Note.
- Completion timestamp.

Task operations include:

- View open actions.
- Complete an action.
- Send a chase email.
- Record the delivery result.
- View action history and activity timeline.

## 12. Payments and Finance

`IbimPayment` is the dedicated payment record. It stores:

- Member.
- Policy.
- Amount due.
- Amount paid.
- Due date.
- Paid date.
- Payment status.
- Payment method.
- Payment reference.
- Finance provider.
- Finance agreement number.
- Notes.

Payment statuses include:

```text
AWAITING_PAYMENT
PART_PAID
PAID
OVERDUE
CANCELLED
```

Operations include:

```text
GET   /ibim/payments
POST  /ibim/payments
PATCH /ibim/payments/:id
```

A bound policy with a premium automatically receives one payment record if one does not already exist. This is idempotent and prevents duplicate payment records during repeated automation runs.

`IbimTransaction` remains the policy financial ledger for:

- Premium.
- Payment.
- Rebate.
- Commission.

## 13. Rebates

Rebates are intentionally independent of the policy workflow.

The rebate module includes:

- Annual rebate fund.
- Mutual aggregate pot.
- Member allocation.
- Entitlement amount.
- Paid amount.
- Outstanding, part-paid, and paid statuses.
- Rebate payment history.
- Rebate statements source data.

Models:

- `IbimRebateFund`
- `IbimRebateAllocation`
- `IbimRebatePayment`

Operations include:

```text
GET  /ibim/rebates
POST /ibim/rebates/funds
POST /ibim/rebates/:fundId/allocations
POST /ibim/rebates/allocations/:id/payments
```

The rebate module is not automatically calculated from policy data unless an allocation is explicitly created. This preserves the brief's requirement that rebates remain a standalone mutual-pot process.

## 14. Budget and Budget Versus Actual

The budget module supports:

- Annual budget year.
- Budget status: draft, approved, or closed.
- Monthly target lines.
- Income or finance category.
- Budget-versus-actual comparison.
- Actual transaction totals by transaction type.

Models:

- `IbimBudget`
- `IbimBudgetLine`

Operations include:

```text
GET /ibim/budgets/:year
PUT /ibim/budgets/:year
```

The current budget implementation provides the durable target and actual data foundation. Forecasting, run-rate, traffic-light variance, and full-year projection can be added on top of these records.

## 15. Bordereaux

Bordereaux are generated from policy data and closed into monthly periods.

The module supports:

- Monthly period.
- Open or closed status.
- Close timestamp.
- New business versus renewal classification.
- Policy snapshot at close.
- Policy number.
- Member name.
- Premium.
- Commission.
- Inception date.
- Renewal date.
- Idempotent period row creation.
- CSV export.

Models:

- `IbimBordereauxPeriod`
- `IbimBordereauxRow`

Operations include:

```text
POST /ibim/bordereaux/:year/:month/close
GET  /ibim/reports/bordereaux/:year/:month.csv
GET  /ibim/reports/bordereaux.csv
```

Closed rows are snapshots. Later master-record changes do not rewrite the historical closed period.

## 16. Management Reporting and KPIs

The reporting layer supports:

- Proposal funnel.
- Policy status summary.
- Financial activity by transaction type.
- Premium.
- Commission.
- Income.
- Rebate transactions.
- Member count.
- Quote rate.
- Conversion rate.
- Bound/accepted count.
- Handler performance base data.
- Date filtering.
- CSV exports.
- KPI PDF export.

Endpoints include:

```text
GET /ibim/reports/management
GET /ibim/reports/filtered
GET /ibim/reports/kpis
GET /ibim/reports/kpis.pdf
```

The weekly reporting, monthly reporting, and board-pack views use the same business-scoped reporting foundation. Board-specific layouts and insurer-specific report templates can be layered on top without changing the master records.

## 17. Reconciliation and External Policy System Support

The reconciliation module accepts policy-system data and compares it with platform records by:

- Policy number.
- External policy reference.
- Status.
- Premium.
- Renewal date.

It records:

- Matching policy.
- Missing policy.
- Differences.
- Source system.
- Source data.
- Reconciliation timestamp.

This supports controlled exchange with Acturis or another external policy administration system. A live Acturis API integration is not included; the current integration seam is file or payload reconciliation.

## 18. Email and Delivery Tracking

The platform supports email delivery records for:

- Verification.
- Proposal requests.
- Renewal campaigns.
- Chasers.

Each delivery records:

- Recipient.
- Subject.
- Delivery type.
- Sent/failed status.
- Provider reference.
- Error message.
- Sent timestamp.
- Delivered timestamp.
- Provider webhook events where configured.

Automation records provider failures rather than crashing the entire scheduled run.

## 19. Audit, Activity, and Privacy

Audit and activity records cover:

- Member creation/import.
- Proposal creation and status changes.
- Policy creation and binding.
- Financial transactions.
- Workflow actions.
- Bordereaux close.
- Rebate fund changes.
- Staff permission changes through the management endpoint.

Privacy operations include:

- Member data export.
- Member anonymization.
- Business-scoped access validation.

## 20. Role-Based and Permission-Based Access

Every protected business request is tenant-checked. The system supports both coarse roles and named permissions.

### Roles

- `OWNER`: full access.
- `ADMIN`: administrative access.
- `STAFF`: standard operational access.
- `SALESMAN`: sales-focused access.
- `ACCOUNTANT`: finance-focused access.

### Named permissions

```text
MEMBERS_VIEW
MEMBERS_EDIT
PROSPECTS_MANAGE
PROPOSALS_MANAGE
POLICIES_BIND
ACTIONS_MANAGE
FINANCE_VIEW
FINANCE_EDIT
REBATES_MANAGE
BUDGET_MANAGE
BORDEREAUX_CLOSE
REPORTS_EXPORT
STAFF_MANAGE
```

Owners and admins have full access. Other roles receive defaults, and owners/admins can add per-user permissions for a specific business.

Staff Management supports:

- Role change.
- Staff invite.
- Staff removal.
- Permission matrix loading.
- Permission checkbox assignment.
- Save permissions.
- Reset to role defaults.

Permission management APIs:

```text
GET /business/:businessId/permissions
PUT /business/:businessId/staff/:userId/permissions
```

## 21. Data Reliability and Redundancy Controls

The platform includes the following reliability controls:

- Business-scoped foreign keys.
- Unique policy numbers per business.
- Unique rebate fund per business and year.
- Unique budget per business and year.
- Unique bordereaux period per business, year, and month.
- Unique bordereaux row per period and policy.
- Unique automation run per business, job, and run key.
- Unique membership permission per user membership and permission.
- Transactional policy binding.
- Transactional rebate payment updates.
- Transactional budget replacement.
- Idempotent scheduled campaign execution.
- Duplicate-aware migration import.
- Audit and delivery evidence.
- Server-side authorization independent of frontend visibility.

## 22. API Security and Access Boundaries

All authenticated iBIM routes are mounted under:

```text
/ibim
```

Public proposal routes are mounted under:

```text
/ibim/public
```

Public proposal access uses a signed proposal token. It does not grant general account, business, or member access.

The internal automation endpoint is:

```text
/internal/cron/ibim
```

It is protected by `CRON_SECRET` and should never be exposed in frontend code.

## 23. Database Migrations

Important iBIM migrations include:

```text
20260908170000_add_ibim_insurance_foundation
20260908173000_add_ibim_operational_tables
20260908190000_add_ibim_delivery_and_reconciliation
20260909100000_add_ibim_finance_automation
20260909103000_add_ibim_prospects_payments
20260909110000_add_membership_permissions
```

Production deployment applies Prisma migrations through the existing GitHub Actions deployment workflow.

## 24. Production Configuration

Required or important values:

```text
APPLICATION_ID=ALL
DATABASE_URL=<production PostgreSQL URL>
JWT_SECRET=<JWT signing secret>
CRON_SECRET=<Vercel cron authentication secret>
VITE_API_URL=<backend production URL>
VITE_APPLICATION_ID=ALL
```

For email automation, configure the Gmail provider values used by the notification service.

The GitHub Actions deployment must have `CRON_SECRET` configured as a repository secret. It is passed to the backend deployment and used by the daily Vercel Cron request.

## 25. Verification Checklist

### Authentication and tenant isolation

- [ ] YardLogic account cannot select an iBIM business.
- [ ] iBIM account cannot select a YardLogic business.
- [ ] Shared backend rejects a missing or mismatched application header.
- [ ] Browser storage is cleared once after the application-context fix is deployed.

### Master data and workflows

- [ ] Member import preview detects duplicates.
- [ ] Accepted, rejected, and flagged import results are visible.
- [ ] New-business proposal can be created.
- [ ] Renewal proposal copies previous proposal data.
- [ ] Proposal status can be moved through the required workflow.
- [ ] Binding creates the policy and premium ledger atomically.

### Automation

- [ ] `CRON_SECRET` exists in GitHub Actions secrets.
- [ ] Vercel Cron deployment is active.
- [ ] A six-week campaign creates one idempotent prospect action.
- [ ] Reminder and overdue buckets create the expected tasks.
- [ ] Failed email delivery is recorded.
- [ ] Re-running the same cron does not duplicate actions.

### Finance and reporting

- [ ] Bound policy creates one payment record.
- [ ] Payment can move from awaiting to part-paid or paid.
- [ ] Rebate fund and allocation can be created.
- [ ] Rebate payment cannot exceed entitlement.
- [ ] Budget lines and actuals are visible.
- [ ] Bordereaux period closes once and can be exported.
- [ ] KPI JSON, CSV, and PDF endpoints return business-scoped data.

### RBAC

- [ ] Owner/admin can view staff permissions.
- [ ] Owner/admin can save custom permissions.
- [ ] Reset to role defaults clears custom overrides.
- [ ] A user without `FINANCE_EDIT` cannot update payments.
- [ ] A user without `BORDEREAUX_CLOSE` cannot close a period.
- [ ] Permission assignments do not cross business boundaries.

## 26. Known Integration Boundaries

The following are intentionally provider-dependent or not fully implemented as external integrations:

- Live Acturis API integration.
- Live insurer submission integration.
- GSP/GST filing provider integration.
- Payment gateway provider integration.
- Rebate spreadsheet-specific import templates.
- Insurer-specific bordereaux templates.
- Full board-pack presentation templates.
- Full forecasting and retention analytics beyond the current KPI foundation.

These boundaries do not change the transactional iBIM master records or the tenant and permission model.

## 27. Source Locations

Primary implementation locations:

- Backend application mounting: `yardlogic-app/backend/src/app.ts`
- iBIM routes: `yardlogic-app/backend/src/routes/ibim.ts`
- Finance and reporting routes: `yardlogic-app/backend/src/routes/ibimOperations.ts`
- Automation: `yardlogic-app/backend/src/services/ibimAutomation.ts`
- Authentication and permissions: `yardlogic-app/backend/src/middleware/auth.ts`
- Staff permissions: `yardlogic-app/backend/src/routes/business.ts`
- Prisma schema: `yardlogic-app/backend/prisma/schema.prisma`
- iBIM workspace UI: `yardlogic-app/frontend/src/pages/IbimWorkspace.tsx`
- Staff management UI: `yardlogic-app/frontend/src/pages/StaffManagement.tsx`
- Vercel backend configuration: `yardlogic-app/backend/vercel.json`
- Production deployment workflow: `.github/workflows/deploy.yml`
