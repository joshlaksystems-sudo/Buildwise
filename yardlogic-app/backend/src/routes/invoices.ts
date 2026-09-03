import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth, signInvoiceAccessToken } from "../middleware/auth";
import { generateInvoicePdf } from "../services/pdfService";
import { logInvoiceToBigQuery, logPaymentToBigQuery, uploadInvoiceToGCS } from "../services/googleCloud";
import { writeAudit } from "../services/audit";

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

const lineSchema = z.object({
  itemId: z.string().optional(),
  name: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(100).default(0),
});

const invoiceSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().trim().max(160).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  customerEmail: z.string().trim().email().optional(),
  type: z.enum(["GST", "NON_GST", "POS"]).default("GST"),
  lines: z.array(lineSchema).min(1),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"]).optional(),
  amountPaid: z.number().min(0).default(0),
  dueDate: z.string().datetime().optional(),
  followUpDate: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(2000).optional(),
});

// Automated, gap-free bill numbering per business: INV-0001, INV-0002...
export async function nextInvoiceNumber(businessId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const business = await client.business.findUnique({
    where: { id: businessId },
    select: { invoicePrefix: true, invoiceStartNumber: true },
  });
  const prefix = business?.invoicePrefix || "INV";
  const startNumber = business?.invoiceStartNumber || 1;
  const invoices = await client.invoice.findMany({
    where: { businessId },
    select: { number: true },
  });
  const prefixPattern = `${prefix}-`;
  const highestNumber = invoices.reduce((highest, invoice) => {
    if (!invoice.number.startsWith(prefixPattern)) return highest;
    const value = Number(invoice.number.slice(prefixPattern.length));
    return Number.isInteger(value) ? Math.max(highest, value) : highest;
  }, startNumber - 1);
  return `${prefix}-${String(highestNumber + 1).padStart(4, "0")}`;
}

function computeLine(line: z.infer<typeof lineSchema>) {
  const base = line.quantity * line.unitPrice - line.discount;
  const tax = base * (line.taxRate / 100);
  return { lineTotal: base + tax, tax, base };
}

invoicesRouter.post("/", async (req: AuthedRequest, res) => {
  const clientRequestId = req.header("X-Idempotency-Key")?.trim();
  if (clientRequestId && clientRequestId.length > 120) return res.status(400).json({ error: "X-Idempotency-Key is too long" });
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { customerId, customerName, customerPhone, customerEmail, type, lines, paymentMode, amountPaid, dueDate, followUpDate, notes, terms } = parsed.data;

  let subTotal = 0;
  let taxTotal = 0;
  const invalidDiscount = lines.find((line) => line.discount > line.quantity * line.unitPrice);
  if (invalidDiscount) {
    return res.status(422).json({ error: "Line discount cannot be greater than the line amount" });
  }
  const computed = lines.map((l) => {
    const { lineTotal, tax, base } = computeLine(l);
    subTotal += base;
    taxTotal += tax;
    return { ...l, lineTotal };
  });
  const grandTotal = subTotal + taxTotal;
  if (amountPaid > grandTotal) {
    return res.status(422).json({ error: "Amount paid cannot be greater than the invoice total" });
  }
  if (amountPaid < grandTotal && !followUpDate) {
    return res.status(422).json({ error: "Add a follow-up date when the invoice has an outstanding balance" });
  }
  if (amountPaid >= grandTotal && followUpDate) {
    return res.status(422).json({ error: "A fully paid invoice cannot have a follow-up date" });
  }

  const itemIds = lines.flatMap((line) => line.itemId ? [line.itemId] : []);
  const ownedItems = await prisma.item.findMany({
    where: { id: { in: itemIds }, businessId: req.businessId },
    select: { id: true },
  });
  if (ownedItems.length !== new Set(itemIds).size) {
    return res.status(422).json({ error: "One or more items do not belong to this business" });
  }

  let selectedCustomer: { id: string; name: string; phone: string | null; email: string | null } | null = null;
  if (customerId) {
    selectedCustomer = await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId }, select: { id: true, name: true, phone: true, email: true } });
    if (!selectedCustomer) return res.status(404).json({ error: "Customer not found" });
  }

  if (clientRequestId) {
    const previous = await prisma.invoice.findFirst({ where: { businessId: req.businessId, clientRequestId }, include: { items: true } });
    if (previous) return res.status(200).json(previous);
  }

  // Dealer/distributor credit limit enforcement (Step 6). Only
  // blocks when the customer actually has a limit set — most
  // walk-in customers won't, so this never gets in the way unless
  // the business opted in for that customer.
  if (customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId } });
    if (customer?.creditLimit != null) {
      const outstanding = await prisma.invoice.aggregate({
        where: { businessId: req.businessId, customerId, status: { in: ["UNPAID", "PARTIAL"] } },
        _sum: { grandTotal: true, amountPaid: true },
      });
      const currentOutstanding = (outstanding._sum.grandTotal ?? 0) - (outstanding._sum.amountPaid ?? 0);
      const balanceOnThisInvoice = grandTotal - amountPaid;
      if (currentOutstanding + balanceOnThisInvoice > customer.creditLimit) {
        return res.status(422).json({
          error: `This invoice would put ${customer.name} at ₹${(currentOutstanding + balanceOnThisInvoice).toFixed(2)} outstanding, over their ₹${customer.creditLimit.toFixed(2)} credit limit.`,
          currentOutstanding,
          creditLimit: customer.creditLimit,
        });
      }
    }
  }

  const status = amountPaid >= grandTotal ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID";

  const invoice = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-number:${req.businessId}`}))`;
    const number = await nextInvoiceNumber(req.businessId!, tx);
    const created = await tx.invoice.create({
      data: {
        businessId: req.businessId!,
        customerId,
        customerName: selectedCustomer?.name ?? customerName,
        customerPhone: selectedCustomer?.phone ?? customerPhone,
        customerEmail: selectedCustomer?.email ?? customerEmail,
        number,
        type,
        subTotal,
        taxTotal,
        grandTotal,
        amountPaid,
        followUpDate: followUpDate ? new Date(followUpDate) : undefined,
        paymentMode,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        notes,
        terms,
        clientRequestId,
        status,
        items: { create: computed },
      },
      include: { items: true },
    });

    // Deduct stock for every line tied to a real inventory item.
    for (const line of computed) {
      if (line.itemId) {
        const updatedItem = await tx.item.updateMany({ where: { id: line.itemId, businessId: req.businessId, currentStock: { gte: line.quantity } }, data: { currentStock: { decrement: line.quantity } } });
        if (updatedItem.count !== 1) throw new Error("Insufficient stock for one or more invoice items");
        await tx.stockMovement.create({
          data: {
            businessId: req.businessId!,
            itemId: line.itemId,
            change: -line.quantity,
            reason: "SALE",
            refId: created.id,
          },
        });
      }
    }

    if (amountPaid > 0) {
      await tx.payment.create({
        data: {
          businessId: req.businessId!,
          customerId,
          invoiceId: created.id,
          amount: amountPaid,
          mode: paymentMode || "CASH",
          direction: "IN",
        },
      });
    }

    if (customerId) {
      await tx.customer.update({ where: { id: customerId }, data: { lastPurchaseAt: new Date() } });
    }

    return created;
  });

  await writeAudit({
    businessId: req.businessId!,
    userId: req.userId,
    action: "invoice.create",
    entityType: "Invoice",
    entityId: invoice.id,
    detail: { number: invoice.number, grandTotal: invoice.grandTotal },
  });

  void logInvoiceToBigQuery({
    invoiceId: invoice.id,
    businessId: invoice.businessId,
    invoiceNumber: invoice.number,
    customerId: invoice.customerId || "",
    customerName: invoice.customerName || "",
    amount: invoice.grandTotal,
    taxAmount: invoice.taxTotal,
    discountAmount: invoice.discount,
    status: invoice.status,
    invoiceDate: invoice.createdAt.toISOString(),
    dueDate: invoice.dueDate?.toISOString() || null,
    amountPaid: invoice.amountPaid,
    isPaid: invoice.status === "PAID",
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  });
  if (amountPaid > 0) {
    void logPaymentToBigQuery({
      paymentId: `invoice:${invoice.id}`,
      businessId: invoice.businessId,
      invoiceId: invoice.id,
      billId: null,
      amount: amountPaid,
      mode: paymentMode || "CASH",
      direction: "IN",
      reconciled: false,
      date: invoice.createdAt.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
    });
  }

  res.status(201).json(invoice);
});

invoicesRouter.get("/", async (req: AuthedRequest, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { businessId: req.businessId },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(invoices);
});

invoicesRouter.get("/:id", async (req: AuthedRequest, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { customer: true, items: true, payments: true },
  });
  if (!invoice) return res.status(404).json({ error: "Not found" });
  res.json(invoice);
});

// Renders and streams a PDF of the invoice — no intermediate file,
// piped straight to the response.
invoicesRouter.get("/:id/pdf", async (req: AuthedRequest, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { customer: true, items: true, business: true },
  });
  if (!invoice) return res.status(404).json({ error: "Not found" });
  const pdf = await generateInvoicePdf(invoice);
  const url = await uploadInvoiceToGCS(pdf, invoice.number, invoice.businessId, {
    metadata: { invoiceId: invoice.id, businessId: invoice.businessId },
  });
  if (url) res.setHeader("X-Invoice-GCS-Url", url);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.number}.pdf"`);
  res.send(pdf);
});

// Builds a wa.me link with the bill summary pre-filled. Actually
// *sending* via the WhatsApp Business API needs a Meta business
// account and template approval — this is the zero-setup version
// that opens WhatsApp with the message ready to send, which is
// what most small shops actually want day one.
invoicesRouter.get("/:id/whatsapp-link", async (req: AuthedRequest, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { customer: true, business: true },
  });
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const token = signInvoiceAccessToken(invoice.id);
  const pdfUrl = `${req.protocol}://${req.get("host")}/public/invoices/${invoice.id}/pdf?token=${token}`;
  const message =
    `Hi${invoice.customer ? " " + invoice.customer.name : ""}, here's your bill ${invoice.number} ` +
    `from ${invoice.business.name} for ₹${invoice.grandTotal.toFixed(2)}. ` +
    `View it here: ${pdfUrl}`;

  const phone = invoice.customer?.phone?.replace(/\D/g, "");
  const base = phone ? `https://wa.me/${phone}` : "https://wa.me/";
  const link = `${base}?text=${encodeURIComponent(message)}`;

  res.json({ link });
});
