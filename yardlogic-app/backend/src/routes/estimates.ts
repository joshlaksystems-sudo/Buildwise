import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { nextInvoiceNumber } from "./invoices";

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
  validUntil: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(2000).optional(),
});

async function nextNumber(businessId: string) {
  const count = await prisma.estimate.count({ where: { businessId } });
  return `EST-${String(count + 1).padStart(4, "0")}`;
}

estimatesRouter.post("/", async (req: AuthedRequest, res) => {
  const clientRequestId = req.header("X-Idempotency-Key")?.trim();
  if (clientRequestId && clientRequestId.length > 120) return res.status(400).json({ error: "X-Idempotency-Key is too long" });
  const parsed = estimateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { customerId, lines, validUntil, notes, terms } = parsed.data;
  if (clientRequestId) {
    const previous = await prisma.estimate.findFirst({ where: { businessId: req.businessId, clientRequestId }, include: { items: true } });
    if (previous) return res.status(200).json(previous);
  }

  if (customerId && !(await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId }, select: { id: true } }))) {
    return res.status(404).json({ error: "Customer not found" });
  }
  const itemIds = lines.flatMap((line) => line.itemId ? [line.itemId] : []);
  const ownedItems = await prisma.item.findMany({ where: { id: { in: itemIds }, businessId: req.businessId }, select: { id: true } });
  if (ownedItems.length !== new Set(itemIds).size) return res.status(422).json({ error: "One or more items do not belong to this business" });

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
      validUntil: validUntil ? new Date(validUntil) : undefined,
      notes,
      terms,
      clientRequestId,
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
  const clientRequestId = req.header("X-Idempotency-Key")?.trim();
  if (clientRequestId && clientRequestId.length > 120) return res.status(400).json({ error: "X-Idempotency-Key is too long" });
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { items: true },
  });
  if (!estimate) return res.status(404).json({ error: "Not found" });
  if (estimate.status === "CONVERTED") return res.status(409).json({ error: "Already converted" });

  const itemIds = estimate.items.flatMap((item) => item.itemId ? [item.itemId] : []);
  const ownedItems = await prisma.item.findMany({ where: { id: { in: itemIds }, businessId: req.businessId }, select: { id: true } });
  if (ownedItems.length !== new Set(itemIds).size) return res.status(422).json({ error: "One or more estimate items do not belong to this business" });

  if (clientRequestId) {
    const previous = await prisma.invoice.findFirst({ where: { businessId: req.businessId, clientRequestId }, include: { items: true } });
    if (previous) return res.status(200).json(previous);
  }

  const number = await nextInvoiceNumber(req.businessId!);

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        businessId: req.businessId!,
        customerId: estimate.customerId,
        number,
        subTotal: estimate.subTotal,
        taxTotal: estimate.taxTotal,
        grandTotal: estimate.grandTotal,
        clientRequestId,
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
    for (const item of estimate.items) {
      if (!item.itemId) continue;
      const updatedItem = await tx.item.updateMany({ where: { id: item.itemId, businessId: req.businessId, currentStock: { gte: item.quantity } }, data: { currentStock: { decrement: item.quantity } } });
      if (updatedItem.count !== 1) throw new Error("Insufficient stock for one or more estimate items");
      await tx.stockMovement.create({ data: { businessId: req.businessId!, itemId: item.itemId, change: -item.quantity, reason: "SALE", refId: created.id, note: `Converted estimate #${estimate.number}` } });
    }
    await tx.estimate.update({
      where: { id: estimate.id },
      data: { status: "CONVERTED", convertedInvoiceId: created.id },
    });
    return created;
  });

  res.status(201).json(invoice);
});
