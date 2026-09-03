import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const advancedWorkflowsRouter = Router();

const complianceSchema = z.object({
  isBundle: z.boolean().default(false),
  items: z.array(z.object({ name: z.string().trim().min(1), gstRate: z.number().min(0).max(100) })).min(1),
});

advancedWorkflowsRouter.post("/invoice/verify-compliance", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = complianceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const highestRate = Math.max(...parsed.data.items.map((item) => item.gstRate));
  const mixedSupply = parsed.data.isBundle && new Set(parsed.data.items.map((item) => item.gstRate)).size > 1;
  res.json({
    compliant: !mixedSupply,
    mixedSupply,
    adjustedGstRate: mixedSupply ? highestRate : null,
    reason: mixedSupply
      ? `This bundled sale contains multiple GST rates. Review whether the mixed-supply rule applies; the highest rate is ${highestRate}%.`
      : "No mixed-supply rate change was detected.",
  });
});

const ewayPayloadSchema = z.object({
  invoiceId: z.string(),
  vehicleNumber: z.string().trim().min(1).max(15),
  fromPincode: z.number().int().positive().optional(),
  toPincode: z.number().int().positive().optional(),
});

advancedWorkflowsRouter.post("/eway-bills/formulate", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ewayPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const invoice = await prisma.invoice.findFirst({
    where: { id: parsed.data.invoiceId, businessId: req.businessId },
    include: { items: true, business: true, customer: true },
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (!invoice.business.gstin) return res.status(422).json({ error: "Business GSTIN is required" });
  const payload = {
    supplyType: "O",
    subSupplyType: "1",
    docType: "INV",
    docNo: invoice.number,
    fromGstin: invoice.business.gstin,
    fromPincode: parsed.data.fromPincode,
    toGstin: invoice.customer?.gstin ?? undefined,
    toPincode: parsed.data.toPincode,
    totInvValue: invoice.grandTotal,
    transMode: "1",
    vehicleNo: parsed.data.vehicleNumber,
    itemList: invoice.items.map((item) => ({
      productName: item.name,
      hsnCode: undefined,
      quantity: item.quantity,
      taxableAmount: item.lineTotal,
      gstRate: item.taxRate,
    })),
  };
  res.json({ status: "READY_FOR_REVIEW", warning: "Review this payload and submit it through a licensed GSP/NIC integration.", payload });
});

const transferSchema = z.object({
  sourceWarehouseId: z.string(),
  destinationWarehouseId: z.string(),
  items: z.array(z.object({ itemId: z.string(), quantity: z.number().positive() })).min(1),
});

advancedWorkflowsRouter.use("/stock-transfers", requireAuth);
advancedWorkflowsRouter.get("/stock-transfers", async (req: AuthedRequest, res) => {
  const transfers = await prisma.stockTransfer.findMany({
    where: { businessId: req.businessId },
    include: { items: { include: { item: { select: { name: true, unit: true } } } }, sourceWarehouse: true, destinationWarehouse: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(transfers);
});

advancedWorkflowsRouter.post("/stock-transfers", async (req: AuthedRequest, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { sourceWarehouseId, destinationWarehouseId, items } = parsed.data;
  if (sourceWarehouseId === destinationWarehouseId) return res.status(422).json({ error: "Source and destination warehouses must differ" });
  const warehouses = await prisma.warehouse.findMany({ where: { id: { in: [sourceWarehouseId, destinationWarehouseId] }, businessId: req.businessId }, select: { id: true } });
  if (warehouses.length !== 2) return res.status(404).json({ error: "Warehouse not found" });
  const itemIds = items.map((item) => item.itemId);
  const ownedItems = await prisma.item.findMany({ where: { id: { in: itemIds }, businessId: req.businessId }, select: { id: true } });
  if (ownedItems.length !== new Set(itemIds).size) return res.status(422).json({ error: "One or more items do not belong to this business" });
  const number = `ST-${Date.now()}`;
  const transfer = await prisma.stockTransfer.create({ data: { businessId: req.businessId!, sourceWarehouseId, destinationWarehouseId, number, items: { create: items } }, include: { items: true } });
  res.status(201).json(transfer);
});

advancedWorkflowsRouter.post("/stock-transfers/:id/complete", async (req: AuthedRequest, res) => {
  const transfer = await prisma.stockTransfer.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { items: true } });
  if (!transfer) return res.status(404).json({ error: "Transfer not found" });
  if (transfer.status !== "DRAFT") return res.status(409).json({ error: "Transfer is already completed" });
  const completed = await prisma.$transaction(async (tx) => {
    for (const line of transfer.items) {
      const source = await tx.warehouseStock.updateMany({ where: { warehouseId: transfer.sourceWarehouseId, itemId: line.itemId, quantity: { gte: line.quantity } }, data: { quantity: { decrement: line.quantity } } });
      if (source.count !== 1) throw new Error("Insufficient warehouse stock");
      await tx.warehouseStock.upsert({ where: { warehouseId_itemId: { warehouseId: transfer.destinationWarehouseId, itemId: line.itemId } }, update: { quantity: { increment: line.quantity } }, create: { warehouseId: transfer.destinationWarehouseId, itemId: line.itemId, quantity: line.quantity } });
    }
    return tx.stockTransfer.update({ where: { id: transfer.id }, data: { status: "COMPLETED", completedAt: new Date() }, include: { items: true } });
  });
  res.json(completed);
});
