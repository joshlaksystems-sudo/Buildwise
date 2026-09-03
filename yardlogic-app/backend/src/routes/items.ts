import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const itemsRouter = Router();
itemsRouter.use(requireAuth);

itemsRouter.get("/", async (req: AuthedRequest, res) => {
  const items = await prisma.item.findMany({
    where: { businessId: req.businessId },
    orderBy: { name: "asc" },
  });
  res.json(items);
});

// Fast lookup for barcode-scanner billing flow.
itemsRouter.get("/barcode/:code", async (req: AuthedRequest, res) => {
  const item = await prisma.item.findFirst({
    where: { businessId: req.businessId, barcode: req.params.code },
  });
  if (!item) return res.status(404).json({ error: "No item with that barcode" });
  res.json(item);
});

// Items at or below their reorder threshold — feeds the
// predictive reorder-alert dashboard widget.
itemsRouter.get("/low-stock", async (req: AuthedRequest, res) => {
  const items = await prisma.item.findMany({
    where: { businessId: req.businessId },
  });
  const low = items.filter((i) => i.lowStockAlert > 0 && i.currentStock <= i.lowStockAlert);
  res.json(low);
});

const itemSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().default("PCS"),
  salePrice: z.number().default(0),
  purchasePrice: z.number().default(0),
  taxRate: z.number().default(0),
  hsnCode: z.string().optional(),
  mrp: z.number().optional(),
  isMrpInclusive: z.boolean().default(false),
  openingStock: z.number().default(0),
  lowStockAlert: z.number().default(0),
  // Metadata-driven vertical engine — pick a template (Cement,
  // Steel, Bricks, Sand, or a business's own clone) and its
  // template-specific fields (grade, TMT size, etc.)
  materialTemplateId: z.string().optional(),
  attributes: z.record(z.any()).optional(),
});

itemsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { openingStock, ...data } = parsed.data;

  const existing = await prisma.item.findFirst({
    where: { businessId: req.businessId, name: { equals: data.name, mode: "insensitive" } },
  });
  if (existing) {
    const item = await prisma.item.update({
      where: { id: existing.id },
      data: {
        ...data,
        currentStock: { increment: openingStock },
        stockMoves: openingStock ? { create: { businessId: req.businessId!, change: openingStock, reason: "OPENING", note: "Added to existing product" } } : undefined,
      } as any,
    });
    return res.status(200).json({ ...item, merged: true });
  }

  const item = await prisma.item.create({
    data: {
      ...data,
      businessId: req.businessId!,
      currentStock: openingStock,
      stockMoves: openingStock
        ? { create: { businessId: req.businessId!, change: openingStock, reason: "OPENING" } }
        : undefined,
    } as any,
  });

  await writeAudit({
    businessId: req.businessId!,
    userId: req.userId,
    action: "item.create",
    entityType: "Item",
    entityId: item.id,
    detail: { name: item.name },
  });

  res.status(201).json(item);
});

itemsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const item = await prisma.item.updateMany({ where: { id: req.params.id, businessId: req.businessId }, data: parsed.data as any });
  if (!item.count) return res.status(404).json({ error: "Item not found" });
  res.json(await prisma.item.findUnique({ where: { id: req.params.id } }));
});

itemsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const deleted = await prisma.item.deleteMany({ where: { id: req.params.id, businessId: req.businessId } });
  if (!deleted.count) return res.status(404).json({ error: "Item not found" });
  res.status(204).send();
});

itemsRouter.patch("/:id/adjust-stock", async (req: AuthedRequest, res) => {
  const { change, note } = z.object({ change: z.number(), note: z.string().optional() }).parse(req.body);
  const item = await prisma.item.update({
    where: { id: req.params.id },
    data: {
      currentStock: { increment: change },
      stockMoves: { create: { businessId: req.businessId!, change, reason: "ADJUSTMENT", note } },
    },
  });

  await writeAudit({
    businessId: req.businessId!,
    userId: req.userId,
    action: "item.adjust_stock",
    entityType: "Item",
    entityId: item.id,
    detail: { change, note },
  });

  res.json(item);
});
