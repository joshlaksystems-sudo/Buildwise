import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const estimatesRouter = Router();
estimatesRouter.use(requireAuth);

const lineSchema = z.object({
  itemId: z.string().optional(),
  name: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().default(0),
});

const estimateSchema = z.object({
  customerId: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

async function nextNumber(businessId: string) {
  const count = await prisma.estimate.count({ where: { businessId } });
  return `EST-${String(count + 1).padStart(4, "0")}`;
}

estimatesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = estimateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { customerId, lines } = parsed.data;

  let subTotal = 0, taxTotal = 0;
  const items = lines.map((l) => {
    const base = l.quantity * l.unitPrice;
    const tax = base * (l.taxRate / 100);
    subTotal += base;
    taxTotal += tax;
    return { ...l, lineTotal: base + tax };
  });

  const number = await nextNumber(req.businessId!);
  const estimate = await prisma.estimate.create({
    data: {
      businessId: req.businessId!,
      customerId,
      number,
      subTotal,
      taxTotal,
      grandTotal: subTotal + taxTotal,
      items: { create: items },
    },
    include: { items: true },
  });
  res.status(201).json(estimate);
});

estimatesRouter.get("/", async (req: AuthedRequest, res) => {
  res.json(await prisma.estimate.findMany({
    where: { businessId: req.businessId },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
  }));
});

// The whole point of estimates: one click to become a real invoice
// without re-typing every line.
estimatesRouter.post("/:id/convert", async (req: AuthedRequest, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { items: true },
  });
  if (!estimate) return res.status(404).json({ error: "Not found" });
  if (estimate.status === "CONVERTED") return res.status(409).json({ error: "Already converted" });

  const invoiceNumberCount = await prisma.invoice.count({ where: { businessId: req.businessId } });
  const number = `INV-${String(invoiceNumberCount + 1).padStart(4, "0")}`;

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        businessId: req.businessId!,
        customerId: estimate.customerId,
        number,
        subTotal: estimate.subTotal,
        taxTotal: estimate.taxTotal,
        grandTotal: estimate.grandTotal,
        items: {
          create: estimate.items.map((i) => ({
            itemId: i.itemId,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            taxRate: i.taxRate,
            lineTotal: i.lineTotal,
          })),
        },
      },
    });
    await tx.estimate.update({
      where: { id: estimate.id },
      data: { status: "CONVERTED", convertedInvoiceId: created.id },
    });
    return created;
  });

  res.status(201).json(invoice);
});
