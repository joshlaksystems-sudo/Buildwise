import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const returnsRouter = Router();
returnsRouter.use(requireAuth);

// ========== STOCK ADJUSTMENTS ==========

const stockAdjustmentSchema = z.object({
  itemId: z.string(),
  quantity: z.number(), // can be positive or negative
  reason: z.enum(["ADJUSTMENT", "DAMAGE", "LOSS", "STOCK_CORRECTION"]),
  note: z.string().optional(),
});

// POST /stock-adjustments - Create manual stock adjustment
returnsRouter.post("/stock-adjustments", async (req: AuthedRequest, res) => {
  try {
    const parsed = stockAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { itemId, quantity, reason, note } = parsed.data;

    // Verify item belongs to business
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item || item.businessId !== req.businessId) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Prevent negative stock (in most cases)
    const newStock = item.currentStock + quantity;
    if (newStock < 0 && reason !== "DAMAGE" && reason !== "LOSS") {
      return res.status(400).json({ error: "Adjustment would result in negative stock" });
    }

    // Update item stock
    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        currentStock: newStock,
      },
    });

    // Log stock movement
    const movement = await prisma.stockMovement.create({
      data: {
        businessId: req.businessId!,
        itemId,
        change: quantity,
        reason: reason as any,
        note,
      },
    });

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "item.stock_adjustment",
      entityType: "StockMovement",
      entityId: movement.id,
      detail: { itemId, quantity, reason, note },
    });

    res.status(201).json({ movement, item: updated });
  } catch (error) {
    console.error("Error creating stock adjustment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /stock-adjustments - List all adjustments
returnsRouter.get("/stock-adjustments", async (req: AuthedRequest, res) => {
  try {
    const { itemId, reason, skip = 0, take = 50 } = req.query;

    const where: any = {
      businessId: req.businessId,
      reason: { in: ["ADJUSTMENT", "DAMAGE", "LOSS", "STOCK_CORRECTION"] },
    };

    if (itemId) where.itemId = itemId;
    if (reason) where.reason = reason;

    const movements = await prisma.stockMovement.findMany({
      where,
      include: { item: { select: { name: true, sku: true } } },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    const total = await prisma.stockMovement.count({ where });

    res.json({ movements, total });
  } catch (error) {
    console.error("Error fetching adjustments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========== SALES RETURNS ==========

const salesReturnSchema = z.object({
  invoiceId: z.string(),
  items: z.array(
    z.object({
      invoiceItemId: z.string(),
      itemId: z.string().optional(),
      quantity: z.number().min(0.01),
      reason: z.string(), // "defective", "wrong item", "cosmetic damage", "expired", etc.
    })
  ),
  refundMode: z.enum(["CREDIT_NOTE", "REFUND"]),
  refundAmount: z.number().min(0).optional(),
  note: z.string().optional(),
});

// POST /sales-returns - Create customer return
returnsRouter.post("/sales-returns", async (req: AuthedRequest, res) => {
  try {
    const parsed = salesReturnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { invoiceId, items, refundMode, refundAmount, note } = parsed.data;

    // Get invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, customer: true },
    });

    if (!invoice || invoice.businessId !== req.businessId) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (invoice.status === "CANCELLED") {
      return res.status(400).json({ error: "Cannot return from cancelled invoice" });
    }

    // Calculate total return amount
    let totalReturnAmount = 0;
    for (const returnItem of items) {
      const invoiceItem = invoice.items.find((ii) => ii.id === returnItem.invoiceItemId);
      if (!invoiceItem) {
        return res.status(400).json({ error: `Invoice item ${returnItem.invoiceItemId} not found` });
      }

      const lineTotal = invoiceItem.lineTotal * (returnItem.quantity / invoiceItem.quantity);
      totalReturnAmount += lineTotal;
    }

    if (refundAmount && refundAmount > totalReturnAmount) {
      return res.status(400).json({ error: "Refund amount exceeds return total" });
    }

    const actualRefund = refundAmount || totalReturnAmount;

    // Create credit note
    const creditNote = await prisma.creditNote.create({
      data: {
        businessId: req.businessId!,
        customerId: invoice.customerId || undefined,
        invoiceId,
        number: `CN-${Date.now()}`,
        reason: note || "Sales Return",
        amount: actualRefund,
        items: {
          create: items.map((item) => {
            const invoiceItem = invoice.items.find((ii) => ii.id === item.invoiceItemId)!;
            const lineTotal = invoiceItem.lineTotal * (item.quantity / invoiceItem.quantity);
            return {
              name: invoiceItem.name,
              quantity: item.quantity,
              unitPrice: invoiceItem.unitPrice,
              lineTotal,
            };
          }),
        },
      },
      include: { items: true },
    });

    // Restore stock if applicable
    for (const returnItem of items) {
      if (returnItem.itemId) {
        const invoiceItem = invoice.items.find((ii) => ii.id === returnItem.invoiceItemId)!;

        await prisma.item.update({
          where: { id: returnItem.itemId },
          data: {
            currentStock: {
              increment: returnItem.quantity,
            },
          },
        });

        // Log reverse stock movement
        await prisma.stockMovement.create({
          data: {
            businessId: req.businessId!,
            itemId: returnItem.itemId,
            change: returnItem.quantity,
            reason: "RETURN",
            refId: invoiceId,
            note: `Credit Note ${creditNote.number} - ${returnItem.reason}`,
          },
        });
      }
    }

    // If refund mode is REFUND, create payment (OUT)
    if (refundMode === "REFUND") {
      await prisma.payment.create({
        data: {
          businessId: req.businessId!,
          customerId: invoice.customerId || undefined,
          invoiceId,
          amount: actualRefund,
          mode: "BANK_TRANSFER",
          direction: "OUT",
          note: `Refund for ${creditNote.number}`,
        },
      });
    }

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "invoice.sales_return",
      entityType: "CreditNote",
      entityId: creditNote.id,
      detail: { invoiceNumber: invoice.number, totalReturn: actualRefund, refundMode },
    });

    res.status(201).json({ creditNote, returnedItems: items.length });
  } catch (error) {
    console.error("Error creating sales return:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /sales-returns - List all sales returns
returnsRouter.get("/sales-returns", async (req: AuthedRequest, res) => {
  try {
    const { invoiceId, customerId, skip = 0, take = 50 } = req.query;

    const where: any = { businessId: req.businessId };
    if (invoiceId) where.invoiceId = invoiceId;
    if (customerId) where.customerId = customerId;

    const returns = await prisma.creditNote.findMany({
      where,
      include: {
        items: true,
        invoice: { select: { number: true } },
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    const total = await prisma.creditNote.count({ where });

    res.json({ returns, total });
  } catch (error) {
    console.error("Error fetching sales returns:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========== PURCHASE RETURNS ==========

const purchaseReturnSchema = z.object({
  billId: z.string(),
  items: z.array(
    z.object({
      billItemId: z.string(),
      itemId: z.string().optional(),
      quantity: z.number().min(0.01),
      reason: z.string(),
    })
  ),
  refundMode: z.enum(["CREDIT", "REFUND"]),
  refundAmount: z.number().min(0).optional(),
  note: z.string().optional(),
});

// POST /purchase-returns - Create supplier return
returnsRouter.post("/purchase-returns", async (req: AuthedRequest, res) => {
  try {
    const parsed = purchaseReturnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { billId, items, refundMode, refundAmount, note } = parsed.data;

    // Get bill
    const bill = await prisma.purchaseBill.findUnique({
      where: { id: billId },
      include: { items: true, supplier: true },
    });

    if (!bill || bill.businessId !== req.businessId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    if (bill.status === "CANCELLED") {
      return res.status(400).json({ error: "Cannot return from cancelled bill" });
    }

    // Calculate total return amount
    let totalReturnAmount = 0;
    for (const returnItem of items) {
      const billItem = bill.items.find((bi) => bi.id === returnItem.billItemId);
      if (!billItem) {
        return res.status(400).json({ error: `Bill item ${returnItem.billItemId} not found` });
      }

      const lineTotal = billItem.lineTotal * (returnItem.quantity / billItem.quantity);
      totalReturnAmount += lineTotal;
    }

    if (refundAmount && refundAmount > totalReturnAmount) {
      return res.status(400).json({ error: "Refund amount exceeds return total" });
    }

    const actualRefund = refundAmount || totalReturnAmount;

    // Create debit note
    const debitNote = await prisma.debitNote.create({
      data: {
        businessId: req.businessId!,
        supplierId: bill.supplierId || undefined,
        number: `DN-${Date.now()}`,
        reason: note || "Purchase Return",
        amount: actualRefund,
        items: {
          create: items.map((item) => {
            const billItem = bill.items.find((bi) => bi.id === item.billItemId)!;
            const lineTotal = billItem.lineTotal * (item.quantity / billItem.quantity);
            return {
              name: billItem.name,
              quantity: item.quantity,
              unitPrice: billItem.unitPrice,
              lineTotal,
            };
          }),
        },
      },
      include: { items: true },
    });

    // Reduce stock
    for (const returnItem of items) {
      if (returnItem.itemId) {
        const billItem = bill.items.find((bi) => bi.id === returnItem.billItemId)!;

        await prisma.item.update({
          where: { id: returnItem.itemId },
          data: {
            currentStock: {
              decrement: returnItem.quantity,
            },
          },
        });

        // Log stock movement
        await prisma.stockMovement.create({
          data: {
            businessId: req.businessId!,
            itemId: returnItem.itemId,
            change: -returnItem.quantity,
            reason: "RETURN",
            refId: billId,
            note: `Debit Note ${debitNote.number} - ${returnItem.reason}`,
          },
        });
      }
    }

    // If refund mode is REFUND, create payment (IN)
    if (refundMode === "REFUND") {
      await prisma.payment.create({
        data: {
          businessId: req.businessId!,
          supplierId: bill.supplierId || undefined,
          billId,
          amount: actualRefund,
          mode: "BANK_TRANSFER",
          direction: "IN",
          note: `Refund for ${debitNote.number}`,
        },
      });
    }

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "bill.purchase_return",
      entityType: "DebitNote",
      entityId: debitNote.id,
      detail: { billNumber: bill.number, totalReturn: actualRefund, refundMode },
    });

    res.status(201).json({ debitNote, returnedItems: items.length });
  } catch (error) {
    console.error("Error creating purchase return:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /purchase-returns - List all purchase returns
returnsRouter.get("/purchase-returns", async (req: AuthedRequest, res) => {
  try {
    const { billId, supplierId, skip = 0, take = 50 } = req.query;

    const where: any = { businessId: req.businessId };
    if (billId) where.billId = billId;
    if (supplierId) where.supplierId = supplierId;

    const returns = await prisma.debitNote.findMany({
      where,
      include: {
        items: true,
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    const total = await prisma.debitNote.count({ where });

    res.json({ returns, total });
  } catch (error) {
    console.error("Error fetching purchase returns:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
