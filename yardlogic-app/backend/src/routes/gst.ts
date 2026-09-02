import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { fileGstReturn, generateEInvoiceIrn, generateEwayBill, GspNotConfiguredError } from "../services/gspService";
import { uploadComplianceDocumentToGCS } from "../services/googleCloud";

export const gstRouter = Router();
gstRouter.use(requireAuth);
const complianceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function periodBounds(period: string) {
  // "2026-08" -> that calendar month
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must use YYYY-MM format");

gstRouter.get("/preparation-pack/:period", async (req: AuthedRequest, res) => {
  const periodResult = periodSchema.safeParse(req.params.period);
  if (!periodResult.success) return res.status(400).json({ error: periodResult.error.flatten() });
  const period = periodResult.data;
  const { start, end } = periodBounds(period);
  const [business, invoices, expenses, purchaseBills, documents, reconciliation] = await Promise.all([
    prisma.business.findUnique({ where: { id: req.businessId }, select: { id: true, name: true, gstin: true, address: true, stateCode: true } }),
    prisma.invoice.findMany({ where: { businessId: req.businessId, createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } }, include: { customer: true, items: true }, orderBy: { createdAt: "asc" } }),
    prisma.expense.findMany({ where: { businessId: req.businessId, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: "asc" } }),
    prisma.purchaseBill.findMany({ where: { businessId: req.businessId, createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } }, include: { supplier: true, items: true }, orderBy: { createdAt: "asc" } }),
    prisma.complianceDocument.findMany({ where: { businessId: req.businessId, period }, orderBy: { createdAt: "asc" } }),
    prisma.itcReconciliation.findMany({ where: { businessId: req.businessId }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  if (!business) return res.status(404).json({ error: "Business not found" });
  const sales = invoices.filter((invoice) => invoice.type === "GST");
  const taxableValue = sales.reduce((sum, invoice) => sum + invoice.subTotal, 0);
  const outputGst = sales.reduce((sum, invoice) => sum + invoice.taxTotal, 0);
  const inputGst = expenses.reduce((sum, expense) => sum + expense.taxAmount, 0);
  res.json({ generatedAt: new Date().toISOString(), period, business, summary: { salesInvoiceCount: sales.length, taxableValue, outputGst, inputGst, netTaxPayable: outputGst - inputGst }, invoices, expenses, purchaseBills, documents, reconciliation });
});

gstRouter.post("/documents", complianceUpload.single("file"), async (req: AuthedRequest, res) => {
  const metadata = z.object({ documentType: z.enum(["GSTR1_SOURCE", "GSTR2B_SOURCE", "PURCHASE_BILL", "EXPENSE_RECEIPT", "BANK_STATEMENT", "OTHER"]), period: periodSchema.optional() }).safeParse(req.body);
  if (!metadata.success) return res.status(400).json({ error: metadata.error.flatten() });
  if (!req.file) return res.status(400).json({ error: "A document file is required" });
  const uploaded = await uploadComplianceDocumentToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, req.businessId!, metadata.data.documentType, metadata.data.period);
  const document = await prisma.complianceDocument.create({ data: { businessId: req.businessId!, uploadedByUserId: req.userId!, documentType: metadata.data.documentType, period: metadata.data.period, fileName: req.file.originalname, mimeType: req.file.mimetype, storageUrl: uploaded?.url, storagePath: uploaded?.path } });
  res.status(201).json(document);
});

// Computes real GSTR-1 figures (outward supplies) from your actual
// invoices — genuinely useful even before you connect a GSP, since
// it's the number you'd need for manual filing on the GST portal too.
gstRouter.get("/gstr1/:period", async (req: AuthedRequest, res) => {
  const periodResult = periodSchema.safeParse(req.params.period);
  if (!periodResult.success) return res.status(400).json({ error: periodResult.error.flatten() });
  const { start, end } = periodBounds(req.params.period);
  const invoices = await prisma.invoice.findMany({
    where: { businessId: req.businessId, type: "GST", createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
  });

  const taxableValue = invoices.reduce((s, i) => s + i.subTotal, 0);
  const taxCollected = invoices.reduce((s, i) => s + i.taxTotal, 0);

  const filing = await prisma.gstFiling.upsert({
    where: { businessId_returnType_period: { businessId: req.businessId!, returnType: "GSTR1", period: req.params.period } },
    update: { taxableValue, taxCollected, status: "READY", preparedByUserId: req.userId },
    create: { businessId: req.businessId!, returnType: "GSTR1", period: req.params.period, taxableValue, taxCollected, status: "READY", preparedByUserId: req.userId },
  });

  res.json({ filing, invoiceCount: invoices.length });
});

// GSTR-3B: outward tax minus input tax credit claimed via expenses.
gstRouter.get("/gstr3b/:period", async (req: AuthedRequest, res) => {
  const periodResult = periodSchema.safeParse(req.params.period);
  if (!periodResult.success) return res.status(400).json({ error: periodResult.error.flatten() });
  const { start, end } = periodBounds(req.params.period);
  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({ where: { businessId: req.businessId, type: "GST", createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } } }),
    prisma.expense.findMany({ where: { businessId: req.businessId, createdAt: { gte: start, lt: end } } }),
  ]);

  const taxableValue = invoices.reduce((s, i) => s + i.subTotal, 0);
  const taxCollected = invoices.reduce((s, i) => s + i.taxTotal, 0);
  const itcClaimed = expenses.reduce((s, e) => s + e.taxAmount, 0);

  const filing = await prisma.gstFiling.upsert({
    where: { businessId_returnType_period: { businessId: req.businessId!, returnType: "GSTR3B", period: req.params.period } },
    update: { taxableValue, taxCollected, itcClaimed, status: "READY", preparedByUserId: req.userId },
    create: { businessId: req.businessId!, returnType: "GSTR3B", period: req.params.period, taxableValue, taxCollected, itcClaimed, status: "READY", preparedByUserId: req.userId },
  });

  res.json({ filing, netTaxPayable: taxCollected - itcClaimed });
});

// Actually filing — this is the step that needs a real GSP.
gstRouter.post("/:returnType/:period/file", async (req: AuthedRequest, res) => {
  const filing = await prisma.gstFiling.findUnique({
    where: { businessId_returnType_period: { businessId: req.businessId!, returnType: req.params.returnType, period: req.params.period } },
  });
  if (!filing) return res.status(404).json({ error: "Prepare the return first (GET /gstr1 or /gstr3b for this period)" });

  try {
    const result = await fileGstReturn({ returnType: filing.returnType, period: filing.period, data: filing });
    const updated = await prisma.gstFiling.update({
      where: { id: filing.id },
      data: { status: "FILED", gspReference: result.gspReference, filedAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof GspNotConfiguredError) {
      return res.status(501).json({ error: err.message, filing });
    }
    await prisma.gstFiling.update({ where: { id: filing.id }, data: { status: "ERROR", errorDetail: String(err) } });
    res.status(500).json({ error: "Filing failed", details: String(err) });
  }
});

// ITC reconciliation — upload rows exported from the GST portal's
// 2A/2B report; we match them against your own expense records.
const reconRowSchema = z.object({
  supplierGstin: z.string(),
  invoiceNumber: z.string(),
  gstnAmount: z.number(),
});

gstRouter.post("/reconcile-2a", async (req: AuthedRequest, res) => {
  const rows = z.array(reconRowSchema).parse(req.body.rows);

  const results = await Promise.all(
    rows.map(async (row) => {
      // naive match on invoice number substring in expense notes —
      // real matching would key off a stored supplier-invoice-number
      // field once purchase-side invoice capture is built out
      const match = await prisma.expense.findFirst({
        where: { businessId: req.businessId, note: { contains: row.invoiceNumber } },
      });
      const matchStatus = !match
        ? "MISSING_IN_BOOKS"
        : Math.abs(match.taxAmount - row.gstnAmount) < 1
        ? "MATCHED"
        : "MISMATCH";

      return prisma.itcReconciliation.create({
        data: {
          businessId: req.businessId!,
          supplierGstin: row.supplierGstin,
          invoiceNumber: row.invoiceNumber,
          ourAmount: match?.taxAmount,
          gstnAmount: row.gstnAmount,
          matchStatus,
        },
      });
    })
  );

  res.status(201).json({ reconciled: results.length, mismatches: results.filter((r) => r.matchStatus !== "MATCHED").length, results });
});

gstRouter.get("/reconcile-2a", async (req: AuthedRequest, res) => {
  res.json(await prisma.itcReconciliation.findMany({ where: { businessId: req.businessId }, orderBy: { createdAt: "desc" } }));
});

// E-invoice IRN and e-way bill generation — both need the GSP too.
gstRouter.post("/invoices/:id/e-invoice", async (req: AuthedRequest, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId }, select: { id: true } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  try {
    const result = await generateEInvoiceIrn(req.params.id);
    await prisma.invoice.update({ where: { id: req.params.id }, data: { isEInvoice: true, eInvoiceIrn: result.irn } });
    res.json(result);
  } catch (err) {
    if (err instanceof GspNotConfiguredError) return res.status(501).json({ error: err.message });
    res.status(500).json({ error: String(err) });
  }
});

const ewayBillSchema = z.object({ vehicleNumber: z.string(), transporterId: z.string().optional() });

gstRouter.post("/invoices/:id/eway-bill", async (req: AuthedRequest, res) => {
  const parsed = ewayBillSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId }, select: { id: true } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  try {
    const result = await generateEwayBill(req.params.id, parsed.data.vehicleNumber);
    const ewb = await prisma.ewayBill.upsert({
      where: { invoiceId: req.params.id },
      update: { ewbNumber: result.ewbNumber, status: "GENERATED", validUntil: result.validUntil, ...parsed.data },
      create: { invoiceId: req.params.id, ewbNumber: result.ewbNumber, status: "GENERATED", validUntil: result.validUntil, ...parsed.data },
    });
    res.json(ewb);
  } catch (err) {
    if (err instanceof GspNotConfiguredError) {
      // Still record the dispatch details even without a GSP — the
      // vehicle/transporter data is real and useful (matches what
      // the cement-vertical feature list asked for) even though the
      // government-facing e-way bill number can't be generated yet.
      const ewb = await prisma.ewayBill.upsert({
        where: { invoiceId: req.params.id },
        update: { status: "PENDING", ...parsed.data },
        create: { invoiceId: req.params.id, status: "PENDING", ...parsed.data },
      });
      return res.status(501).json({ error: err.message, ewayBill: ewb });
    }
    res.status(500).json({ error: String(err) });
  }
});

// Bulk generation for same-day multi-truck dispatch — "multiple
// trucks, same day" from the build doc's Step 4. Each entry is
// attempted independently so one bad invoice ID doesn't block the
// rest of the batch.
const bulkEwaySchema = z.object({
  dispatches: z.array(z.object({ invoiceId: z.string(), vehicleNumber: z.string(), transporterId: z.string().optional() })).min(1),
});

gstRouter.post("/eway-bills/bulk", async (req: AuthedRequest, res) => {
  const parsed = bulkEwaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const results = [];
  for (const d of parsed.data.dispatches) {
    const invoice = await prisma.invoice.findFirst({ where: { id: d.invoiceId, businessId: req.businessId }, select: { id: true } });
    if (!invoice) {
      results.push({ invoiceId: d.invoiceId, ok: false, error: "Invoice not found" });
      continue;
    }
    try {
      const result = await generateEwayBill(d.invoiceId, d.vehicleNumber);
      const ewb = await prisma.ewayBill.upsert({
        where: { invoiceId: d.invoiceId },
        update: { ewbNumber: result.ewbNumber, status: "GENERATED", validUntil: result.validUntil, vehicleNumber: d.vehicleNumber, transporterId: d.transporterId },
        create: { invoiceId: d.invoiceId, ewbNumber: result.ewbNumber, status: "GENERATED", validUntil: result.validUntil, vehicleNumber: d.vehicleNumber, transporterId: d.transporterId },
      });
      results.push({ invoiceId: d.invoiceId, ok: true, ewayBill: ewb });
    } catch (err) {
      const pending = await prisma.ewayBill.upsert({
        where: { invoiceId: d.invoiceId },
        update: { status: "PENDING", vehicleNumber: d.vehicleNumber, transporterId: d.transporterId },
        create: { invoiceId: d.invoiceId, status: "PENDING", vehicleNumber: d.vehicleNumber, transporterId: d.transporterId },
      });
      results.push({ invoiceId: d.invoiceId, ok: false, error: err instanceof GspNotConfiguredError ? err.message : String(err), ewayBill: pending });
    }
  }

  res.status(207).json({ results });
});

// Validity/expiry alerts — e-way bills are only valid for a limited
// window (distance-based under GST rules); flag anything expiring
// within 24 hours so dispatch can act before it lapses.
gstRouter.get("/eway-bills/expiring", async (req: AuthedRequest, res) => {
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiring = await prisma.ewayBill.findMany({
    where: {
      status: "GENERATED",
      validUntil: { lt: soon, gt: new Date() },
      invoice: { businessId: req.businessId },
    },
    include: { invoice: true },
  });
  res.json(expiring);
});
