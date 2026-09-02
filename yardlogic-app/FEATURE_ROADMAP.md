# JoshLak Business Platform — Feature Roadmap

**Status:** Core foundations in place (invoices, items, customers, reports, GST)  
**Goal:** Full ERP / Vyapar-level functionality  
**Timeline:** Prioritized in 6 phases

---

## Phase 1: Business Profile Master Data (Week 1)

Add comprehensive business setup fields so shops can fully configure themselves.

### Schema Changes
- [ ] Extend `Business` model with:
  - `ownerName` (String)
  - `ownerPhone` (String)
  - `ownerEmail` (String)
  - `stateName` (String) — e.g., "Maharashtra", "Gujarat"
  - `stateCode` (String) — 2-letter state code for GST e-invoice (MH, GJ, etc.)
  - `gstnType` (String) — "Individual" | "Partnership" | "Private Ltd" | "Public Ltd" | "Trust" | "LLP" | "OPC"
  - `financialYearStart` (Int) — e.g., 4 (April in India)
  - `invoicePrefix` (String) — e.g., "JL-2026-" or "INV"
  - `invoiceStartNumber` (Int) — default 1
  - `estimatePrefix` (String)
  - `estimateStartNumber` (Int)
  - `challanPrefix` (String)
  - `challanStartNumber` (Int)
  - `businessType` (String) — "Retail" | "Wholesale" | "Services" | "Manufacturing" | "Distribution"
  - `industryVertical` (String) — "Cement" | "Steel" | "Medical" | "Grocery" | "Hardware" | "General"
  - `bankAccountNumber` (String, optional)
  - `bankName` (String, optional)
  - `ifscCode` (String, optional)

### Backend Routes
- [ ] `PATCH /business/:id` — Update business profile (OWNER only)
- [ ] `GET /business/:id` — Fetch business profile and setup status

### Frontend Forms
- [ ] `BusinessProfile.tsx` — Business setup form (first-time after login)
- [ ] `BusinessSettings.tsx` — Edit business details
- [ ] Add setup wizard modal to Dashboard if profile incomplete

### UI/UX
- [ ] Setup checklist on Dashboard (owner name, address, GSTIN, bank, invoice prefix)
- [ ] Show "Setup incomplete" banner until all required fields filled

---

## Phase 2: Supplier + Purchase Bill Module (Week 2-3)

Enable purchasing from suppliers and tracking payables.

### Schema Changes
- [ ] Create `PurchaseBill` model:
  ```
  {
    id, businessId, supplierId, number, status, subTotal, discount, 
    taxTotal, grandTotal, amountPaid, paymentMode, dueDate, 
    referenceNumber (PO/challan), updatedAt, createdAt
  }
  ```
- [ ] Create `PurchaseBillItem` model (like InvoiceItem):
  ```
  { id, billId, itemId, name, quantity, unitPrice, discount, taxRate, lineTotal }
  ```
- [ ] Add fields to `Supplier` model:
  - `bankAccountNumber` (String, optional)
  - `bankName` (String, optional)
  - `ifscCode` (String, optional)
  - `paymentTerms` (String) — e.g., "30 days" | "COD" | "Advance"
  - `creditLimit` (Float, optional)
  - `isActive` (Boolean, default true)

### Backend Routes
- [ ] `POST /suppliers` — Create supplier
- [ ] `GET /suppliers` — List all suppliers (with pagination, search)
- [ ] `GET /suppliers/:id` — Fetch supplier details + ledger summary
- [ ] `PATCH /suppliers/:id` — Update supplier
- [ ] `DELETE /suppliers/:id` — Soft-delete (isActive=false)
- [ ] `POST /purchase-bills` — Create purchase bill (auto stock increase)
- [ ] `GET /purchase-bills` — List bills
- [ ] `GET /purchase-bills/:id` — Fetch bill details
- [ ] `PATCH /purchase-bills/:id` — Edit bill (if draft)
- [ ] `POST /purchase-bills/:id/pay` — Record payment against bill
- [ ] `GET /purchase-bills/:id/pdf` — Generate PDF
- [ ] `GET /suppliers/:id/ledger` — Supplier-wise ledger (opening balance, purchases, payments, closing)
- [ ] `GET /suppliers/:id/aging` — Aging report (0–30 days, 30–60 days, etc.)

### Frontend Pages
- [ ] `Suppliers.tsx` — Master list of suppliers (add, edit, delete, search)
- [ ] `SupplierDetail.tsx` — Supplier profile + ledger + recent bills
- [ ] `PurchaseBills.tsx` — List all purchase bills (filters by status, supplier)
- [ ] `PurchaseBillForm.tsx` — Create/edit bill (item-line editor, tax auto-calc)
- [ ] `PurchaseBillDetail.tsx` — View bill, record payment, download PDF

### UI/UX
- [ ] Add "Suppliers" and "Purchase Bills" to nav menu
- [ ] Quick-create supplier from purchase bill form
- [ ] Payment modal in bill detail page
- [ ] Aging report card on Dashboard (total payables, oldest bill)

---

## Phase 3: Stock Adjustment + Return Flows (Week 3-4)

Enable corrections and returns without creating full invoices.

### Schema Changes
- [ ] Extend `StockMovement` reason enum to include:
  - `DAMAGE` — damaged stock written off
  - `STOCK_CORRECTION` — manual stock count discrepancy adjustment
  - `SALES_RETURN` — customer returned goods (reduce stock if reverting to open)
  - `PURCHASE_RETURN` — returned to supplier (reduce payables)

### Backend Routes
- [ ] `POST /items/:id/stock-adjustment` — Create adjustment (reason, quantity, note)
- [ ] `POST /items/adjust-stock` — Bulk stock adjustment
- [ ] `GET /items/stock-movements` — List all movements (filters by reason, item, date range)
- [ ] `POST /sales-returns` — Record customer return (reverses payment, restores stock)
- [ ] `POST /purchase-returns` — Record return to supplier (reverses bill payment, restores stock)
- [ ] `GET /sales-returns` — List returns
- [ ] `GET /purchase-returns` — List returns

### Frontend Pages
- [ ] Add "Stock Adjustment" button/modal to Items page
- [ ] `StockMovementLog.tsx` — View all stock movement history (audit trail)
- [ ] `SalesReturn.tsx` — Return against an invoice (select invoice, refund mode, reason)
- [ ] `PurchaseReturn.tsx` — Return against a bill (select bill, reason, quantity)

### UI/UX
- [ ] Stock adjustment form (date, reason dropdown, quantity, note)
- [ ] Return reason codes (cosmetic damage, expired, defective, wrong item, etc.)
- [ ] Stock movement audit log with drill-down to original document

---

## Phase 4: Payment Aging + Dashboard KPIs (Week 4)

Surface financial health and aging metrics.

### Schema Changes
- [ ] Add to `Business` (optional analytics model):
  - No schema changes; use computed aggregates on Payment + Invoice + PurchaseBill

### Backend Routes
- [ ] `GET /reports/summary` — Already exists; enhance to include:
  - Total payables (unpaid purchase bills)
  - Aging summary (0–30, 30–60, 60–90, 90+ days overdue)
  - Cash in bank (total payments in - payments out for current period)
  - Pending approvals (if workflow added later)
- [ ] `GET /reports/receivables-aging` — Customer-wise aging (who owes what)
- [ ] `GET /reports/payables-aging` — Supplier-wise aging (what we owe)
- [ ] `GET /reports/cash-flow` — Inflows vs outflows by day/week/month
- [ ] `GET /reports/profit-loss` — P&L statement (sales revenue - expenses)
- [ ] `GET /reports/balance-sheet` — Assets, liabilities, equity (basic)

### Frontend Updates
- [ ] Extend `Dashboard.tsx` with new KPI cards:
  - Total Payables + aging breakdown
  - Cash in Bank
  - 7-day cash flow trend (bar chart)
  - P&L summary (revenue, expenses, net profit)
- [ ] Add `Reports.tsx` tab for detailed aging/P&L/cash-flow views

### UI/UX
- [ ] Color-code aging (green 0–30, yellow 30–60, red 60+)
- [ ] Aging report drill-down (click to see which customers/suppliers)
- [ ] Cash flow mini-chart on dashboard
- [ ] P&L and balance-sheet views in Reports section

---

## Phase 5: Notifications + Low-Stock Triggers (Week 5)

Proactive alerts for business operations.

### Schema Changes
- [ ] Create `Notification` model:
  ```
  {
    id, businessId, userId, type, title, message, data (JSON), 
    read, readAt, action URL, createdAt
  }
  ```
- [ ] Create `NotificationPreference` model:
  ```
  {
    id, businessId, userId, channel (EMAIL|SMS|IN_APP), type, enabled
  }
  ```
- [ ] Extend `Item` model:
  - `reorderPoint` (Float) — when to send reorder alert
  - `reorderQuantity` (Float) — suggested order quantity

### Backend Routes
- [ ] `POST /notifications/preferences` — Set user notification preferences
- [ ] `GET /notifications` — List unread notifications (with pagination)
- [ ] `PATCH /notifications/:id/read` — Mark as read
- [ ] Trigger logic (in services/notifyService.ts) for:
  - Low stock alert when currentStock < lowStockAlert
  - Overdue invoice reminder (invoice 7+ days unpaid, send customer)
  - Overdue payment reminder (bill 7+ days unpaid, send owner)
  - Daily cash flow summary (sent at 8 AM to owner)
  - Weekly P&L digest (Sunday evening)

### Frontend Updates
- [ ] `NotificationBell.tsx` — Dropdown in nav showing unread notifications
- [ ] `Notifications.tsx` — Full notification history with filters
- [ ] In-app toast for high-priority alerts (low stock, overdue invoice)

### UI/UX
- [ ] Notification icon with unread count badge
- [ ] Notification preferences panel in settings
- [ ] Alert severity levels (info, warning, critical)

---

## Phase 6: AI Forecasting Analytics (Week 6)

Predictive insights for inventory and cash flow.

### Schema Changes
- [ ] Create `SalesForecasts` model:
  ```
  {
    id, businessId, itemId, forecastDate, predictedQuantity, 
    confidence, method (TREND|SEASONAL|ML), createdAt
  }
  ```
- [ ] Create `AiInsight` model:
  ```
  {
    id, businessId, type (REORDER|CASH_FLOW|GROWTH|RISK), 
    title, message, score (0–100), actionUrl, createdAt
  }
  ```

### Backend Routes
- [ ] Enhance `/forecast` endpoint (already exists) with:
  - Sales trend analysis (last 30/60/90 days)
  - Seasonal patterns (if data > 1 year)
  - Auto-reorder suggestions (based on usage rate + lead time)
  - Cash flow forecast (projected inflows/outflows next 30 days)
- [ ] `GET /ai/insights` — Smart suggestions for the business
- [ ] Integrate with existing `aiService.ts` to enhance with domain logic

### Frontend Pages
- [ ] Extend `Ask.tsx` (AI chat) with:
  - Forecast charts (item demand by date)
  - Reorder recommendations
  - Growth/risk indicators
- [ ] Add "Forecasts" tab to Items page (show demand curve)

### UI/UX
- [ ] Line chart: Sales trend for top 5 items
- [ ] Reorder recommendation cards ("Buy X units of Y by date Z")
- [ ] Confidence score on forecasts
- [ ] Natural-language insights ("Sales trending up 15%; stock likely to run out in 7 days")

---

## Implementation Priority & Dependencies

### Quick Wins (Phase 1–2, ~2 weeks)
1. **Business Profile** — Unblocks invoicing customization (prefixes, financial year)
2. **Suppliers + Purchase Bills** — Mirrors invoice flow (easier build)
3. Dashboard aging metrics (2–3 hours)

### Medium Effort (Phase 3, ~1 week)
4. **Stock Adjustments** — Low-risk, improves data accuracy
5. **Payment Returns** — Depends on Phase 2 (suppliers)

### Feature Multiplier (Phase 4, ~1 week)
6. **Notifications + Low-Stock Triggers** — High engagement, leverages existing data
7. **Aging Reports** — Drives decision-making

### Advanced (Phase 5+, 1–2 weeks)
8. **AI Forecasting** — Nice-to-have; existing `forecast.ts` is a stub

---

## Parallel Work Opportunities

- **Schema migrations** can be prepped and tested before frontend/backend routes
- **PDF generation** for purchase bills can reuse pdfService.ts logic
- **Reports aggregations** (aging, cash-flow) can use existing Prisma queries
- **Notifications** can be built independently and integrated late

---

## Testing Checklist Per Phase

### Phase 1: Business Profile
- [ ] POST /business/:id with all new fields
- [ ] GET /business/:id returns all fields
- [ ] Frontend form validates all required fields
- [ ] Invoice prefix applies to newly created invoices

### Phase 2: Suppliers & Bills
- [ ] Supplier CRUD (create, read, update, soft-delete)
- [ ] Purchase bill creates with correct stock increase
- [ ] Bill payment records correctly
- [ ] Supplier ledger matches manual calculation
- [ ] Aging report shows correct buckets
- [ ] PDF generation works

### Phase 3: Adjustments & Returns
- [ ] Stock adjustment updates currentStock and creates StockMovement
- [ ] Sales return reverses payment and stock
- [ ] Purchase return reverses bill payment and stock
- [ ] Audit log captures all movements

### Phase 4: Aging & KPIs
- [ ] Dashboard shows correct payables total
- [ ] Aging report groups by date correctly
- [ ] Cash flow sums are accurate
- [ ] P&L calculation is correct

### Phase 5: Notifications
- [ ] Low-stock triggers when stock < threshold
- [ ] Overdue notifications send after N days
- [ ] User can toggle notification channels
- [ ] Unread count badge updates

### Phase 6: Forecasting
- [ ] Forecast endpoint returns trend + seasonal data
- [ ] Reorder recommendations are sensible
- [ ] Confidence scores are reasonable

---

## Database Migration Strategy

For each phase:
1. Update `prisma/schema.prisma` with new models/fields
2. Run `npx prisma migrate dev --name <phase_description>`
3. Test migration on local Postgres
4. Verify no data loss on existing records
5. Document migration in git commit message

---

## Notes

- **Vyapar parity**: This roadmap covers ~80% of Vyapar's features. Remaining 20% (workflow approvals, multi-user role permissions, advanced bulk import, field audit trail per field) can be phased in later.
- **Data privacy**: All new fields should follow existing audit-log pattern (services/audit.ts).
- **Internationalization**: Keep state/region fields flexible for future non-India expansion.
- **Performance**: Index new models on businessId + status for fast filtering.

---

## Quick Reference: Existing Endpoints to Leverage

- **PDF Generation** → `services/pdfService.ts` (reuse for bills)
- **Stock Tracking** → `StockMovement` model + `services/` helpers (reuse for returns)
- **Notifications** → `services/notifyService.ts` (extend for low-stock, aging alerts)
- **Reports** → `routes/reports.ts` (extend for aging, P&L, cash-flow)
- **AI** → `routes/forecast.ts` and `services/aiService.ts` (enhance with reorder logic)

---

**Last Updated:** Sept 2, 2026  
**Owner:** JoshLak Dev Team  
**Status:** In Progress (Phase 1 planning)
