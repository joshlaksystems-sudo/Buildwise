import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth, signInvoiceAccessToken } from "../middleware/auth";
import { streamInvoicePdf } from "../services/pdfService";
import { writeAudit } from "../services/audit";

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

const lineSchema = z.object({
  itemId: z.string().optional(),
  name: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().default(0),
  taxRate: z.number().default(0),
});

const invoiceSchema = z.object({
  customerId: z.string().optional(),
  type: z.enum(["GST", "NON_GST", "POS"]).default("GST"),
  lines: z.array(lineSchema).min(1),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"]).optional(),
  amountPaid: z.number().default(0),
});

// Automated, gap-free bill numbering per business: INV-0001, INV-0002...
async function nextInvoiceNumber(businessId: string) {
  const count = await prisma.invoice.count({ where: { businessId } });
  return `INV-${String(count + 1).padStart(4, "0")}`;
}

function computeLine(line: z.infer<typeof lineSchema>) {
  const base = line.quantity * line.unitPrice - line.discount;
  const tax = base * (line.taxRate / 100);
  return { lineTotal: base + tax, tax, base };
}

invoicesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { customerId, type, lines, paymentMode, amountPaid } = parsed.data;

  let subTotal = 0;
  let taxTotal = 0;
  const computed = lines.map((l) => {
    const { lineTotal, tax, base } = computeLine(l);
    subTotal += base;
    taxTotal += tax;
    return { ...l, lineTotal };
  });
  const grandTotal = subTotal + taxTotal;

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

  const number = await nextInvoiceNumber(req.businessId!);
  const status = amountPaid >= grandTotal ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID";

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        businessId: req.businessId!,
        customerId,
        number,
        type,
        subTotal,
        taxTotal,
        grandTotal,
        amountPaid,
        paymentMode,
        status,
        items: { create: computed },
      },
      include: { items: true },
    });

    // Deduct stock for every line tied to a real inventory item.
    for (const line of computed) {
      if (line.itemId) {
        await tx.item.update({
          where: { id: line.itemId },
          data: { currentStock: { decrement: line.quantity } },
        });
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
  streamInvoicePdf(invoice, res);
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
