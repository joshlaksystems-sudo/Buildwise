import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const operationsRouter = Router();
operationsRouter.use(requireAuth);

const warehouseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(240).optional(),
  isDefault: z.boolean().optional(),
});

operationsRouter.get("/warehouses", async (req: AuthedRequest, res) => {
  const warehouses = await prisma.warehouse.findMany({
    where: { businessId: req.businessId },
    include: { stock: { include: { item: { select: { id: true, name: true, unit: true } } } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  res.json(warehouses);
});

operationsRouter.post("/warehouses", async (req: AuthedRequest, res) => {
  const parsed = warehouseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const isDefault = parsed.data.isDefault ?? false;
  const warehouse = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.warehouse.updateMany({ where: { businessId: req.businessId }, data: { isDefault: false } });
    return tx.warehouse.create({ data: { ...parsed.data, isDefault, businessId: req.businessId! } });
  });
  res.status(201).json(warehouse);
});

operationsRouter.patch("/warehouses/:id", async (req: AuthedRequest, res) => {
  const parsed = warehouseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const warehouse = await prisma.warehouse.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
  const updated = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) await tx.warehouse.updateMany({ where: { businessId: req.businessId }, data: { isDefault: false } });
    return tx.warehouse.update({ where: { id: warehouse.id }, data: parsed.data });
  });
  res.json(updated);
});

operationsRouter.get("/warehouses/:id/stock", async (req: AuthedRequest, res) => {
  const warehouse = await prisma.warehouse.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
  res.json(await prisma.warehouseStock.findMany({ where: { warehouseId: warehouse.id }, include: { item: true }, orderBy: { item: { name: "asc" } } }));
});

const batchSchema = z.object({
  itemId: z.string(),
  batchNumber: z.string().trim().min(1).max(100),
  quantity: z.number().min(0),
  expiryDate: z.string().datetime().optional(),
  mfgDate: z.string().datetime().optional(),
});

operationsRouter.get("/batches", async (req: AuthedRequest, res) => {
  const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
  const batches = await prisma.itemBatch.findMany({ where: { item: { businessId: req.businessId }, ...(itemId ? { itemId } : {}) }, include: { item: { select: { id: true, name: true, unit: true } } }, orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }] });
  res.json(batches);
});

operationsRouter.post("/batches", async (req: AuthedRequest, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const item = await prisma.item.findFirst({ where: { id: parsed.data.itemId, businessId: req.businessId }, select: { id: true } });
  if (!item) return res.status(404).json({ error: "Item not found" });
  const batch = await prisma.itemBatch.create({ data: { ...parsed.data, expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : undefined, mfgDate: parsed.data.mfgDate ? new Date(parsed.data.mfgDate) : undefined } });
  res.status(201).json(batch);
});

const conversionSchema = z.object({ itemId: z.string(), fromUnit: z.string().trim().min(1).max(40), toUnit: z.string().trim().min(1).max(40), factor: z.number().positive() });

operationsRouter.get("/conversions", async (req: AuthedRequest, res) => {
  const conversions = await prisma.unitConversion.findMany({ where: { item: { businessId: req.businessId } }, include: { item: { select: { id: true, name: true, unit: true } } }, orderBy: { fromUnit: "asc" } });
  res.json(conversions);
});

operationsRouter.post("/conversions", async (req: AuthedRequest, res) => {
  const parsed = conversionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const item = await prisma.item.findFirst({ where: { id: parsed.data.itemId, businessId: req.businessId }, select: { id: true } });
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.status(201).json(await prisma.unitConversion.create({ data: parsed.data }));
});

operationsRouter.delete("/conversions/:id", async (req: AuthedRequest, res) => {
  const deleted = await prisma.unitConversion.deleteMany({ where: { id: req.params.id, item: { businessId: req.businessId } } });
  if (!deleted.count) return res.status(404).json({ error: "Conversion not found" });
  res.status(204).send();
});
