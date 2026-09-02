import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const purchaseBillsRouter = Router();
purchaseBillsRouter.use(requireAuth);

const billItemSchema = z.object({
  itemId: z.string().optional(),
  name: z.string(),
  quantity: z.number().min(0.01),
  unitPrice: z.number().min(0),
  discount: z.number().default(0),
  taxRate: z.number().default(0),
});

const billSchema = z.object({
  supplierId: z.string(),
  number: z.string(),
  subTotal: z.number().min(0),
  discount: z.number().default(0),
  taxTotal: z.number().default(0),
  grandTotal: z.number().min(0),
  items: z.array(billItemSchema),
  paymentMode: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  referenceNumber: z.string().optional(),
});

// Helper: generate next bill number
async function getNextBillNumber(businessId: string): Promise<string> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const prefix = business?.invoicePrefix || "BILL";
  const startNum = business?.invoiceStartNumber || 1;

  const lastBill = await prisma.purchaseBill.findFirst({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastBill) {
    return `${prefix}-${startNum}`;
  }

  // Extract number from last bill
  const lastNum = parseInt(lastBill.number.split("-").pop() || "0");
  return `${prefix}-${lastNum + 1}`;
}

// Create purchase bill (auto-increment stock)
purchaseBillsRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const parsed = billSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { supplierId, items, subTotal, discount, taxTotal, grandTotal, paymentMode, dueDate, referenceNumber } =
      parsed.data;

    // Verify supplier belongs to this business
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || supplier.businessId !== req.businessId) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // Get next bill number
    const number = await getNextBillNumber(req.businessId!);

    // Create bill with items
    const bill = await prisma.purchaseBill.create({
      data: {
        businessId: req.businessId!,
        supplierId,
        number,
        status: "DRAFT",
        subTotal,
        discount,
        taxTotal,
        grandTotal,
        paymentMode: paymentMode as any,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        referenceNumber,
        items: {
          create: items.map((item) => ({
            name: item.name,
            itemId: item.itemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            taxRate: item.taxRate,
            lineTotal: (item.quantity * item.unitPrice - item.discount) * (1 + item.taxRate / 100),
          })),
        },
      },
      include: { items: true },
    });

    // Auto-increment stock for each item
    for (const item of items) {
      if (item.itemId) {
        // Update current stock
        await prisma.item.update({
          where: { id: item.itemId },
          data: {
            currentStock: {
              increment: item.quantity,
            },
          },
        });

        // Log stock movement
        await prisma.stockMovement.create({
          data: {
            businessId: req.businessId!,
            itemId: item.itemId,
            change: item.quantity,
            reason: "PURCHASE",
            refId: bill.id,
            note: `Bill #${number}`,
          },
        });
      }
    }

    // Log audit
    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "purchasebill.create",
      entityType: "PurchaseBill",
      entityId: bill.id,
      detail: { number: bill.number, supplierId, grandTotal },
    });

    res.status(201).json(bill);
  } catch (error) {
    console.error("Error creating purchase bill:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all bills
purchaseBillsRouter.get("/", async (req: AuthedRequest, res) => {
  try {
    const { status, supplierId, skip = 0, take = 50 } = req.query;

    const where: any = { businessId: req.businessId };
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const bills = await prisma.purchaseBill.findMany({
      where,
      include: {
        supplier: { select: { name: true } },
        items: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    const total = await prisma.purchaseBill.count({ where });

    res.json({ bills, total });
  } catch (error) {
    console.error("Error fetching bills:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single bill
purchaseBillsRouter.get("/:id", async (req: AuthedRequest, res) => {
  try {
    const bill = await prisma.purchaseBill.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        items: true,
        payments: true,
      },
    });

    if (!bill || bill.businessId !== req.businessId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    res.json(bill);
  } catch (error) {
    console.error("Error fetching bill:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update bill (only if draft)
purchaseBillsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  try {
    const bill = await prisma.purchaseBill.findUnique({ where: { id: req.params.id } });
    if (!bill || bill.businessId !== req.businessId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    if (bill.status !== "DRAFT") {
      return res.status(400).json({ error: "Only draft bills can be edited" });
    }

    const parsed = billSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { items, ...updateData } = parsed.data;

    // Remove old items
    await prisma.purchaseBillItem.deleteMany({ where: { billId: req.params.id } });

    // Reverse old stock movements
    await prisma.stockMovement.deleteMany({ where: { refId: req.params.id } });
    const oldItems = await prisma.purchaseBillItem.findMany({ where: { billId: req.params.id } });
    for (const item of oldItems) {
      if (item.itemId) {
        await prisma.item.update({
          where: { id: item.itemId },
          data: { currentStock: { decrement: item.quantity } },
        });
      }
    }

    // Update bill
    const updated = await prisma.purchaseBill.update({
      where: { id: req.params.id },
      data: {
        number: updateData.number,
        subTotal: updateData.subTotal,
        discount: updateData.discount,
        taxTotal: updateData.taxTotal,
        grandTotal: updateData.grandTotal,
        paymentMode: updateData.paymentMode ? (updateData.paymentMode as any) : undefined,
        dueDate: updateData.dueDate ? new Date(updateData.dueDate) : undefined,
        referenceNumber: updateData.referenceNumber,
        items: {
          create: items.map((item) => ({
            name: item.name,
            itemId: item.itemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            taxRate: item.taxRate,
            lineTotal: (item.quantity * item.unitPrice - item.discount) * (1 + item.taxRate / 100),
          })),
        },
      },
      include: { items: true },
    });

    // Re-add new stock movements
    for (const item of items) {
      if (item.itemId) {
        await prisma.item.update({
          where: { id: item.itemId },
          data: { currentStock: { increment: item.quantity } },
        });

        await prisma.stockMovement.create({
          data: {
            businessId: req.businessId!,
            itemId: item.itemId,
            change: item.quantity,
            reason: "PURCHASE",
            refId: req.params.id,
            note: `Bill #${updated.number}`,
          },
        });
      }
    }

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "purchasebill.update",
      entityType: "PurchaseBill",
      entityId: bill.id,
      detail: { number: bill.number },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating bill:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Record payment against bill
purchaseBillsRouter.post("/:id/pay", async (req: AuthedRequest, res) => {
  try {
    const { amount, mode } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const bill = await prisma.purchaseBill.findUnique({ where: { id: req.params.id } });
    if (!bill || bill.businessId !== req.businessId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    const newAmountPaid = bill.amountPaid + amount;
    if (newAmountPaid > bill.grandTotal) {
      return res.status(400).json({ error: "Payment exceeds bill amount" });
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        businessId: req.businessId!,
        billId: req.params.id,
        supplierId: bill.supplierId || undefined,
        amount,
        mode: mode || "CASH",
        direction: "OUT",
      },
    });

    // Update bill
    const newStatus =
      newAmountPaid === bill.grandTotal ? "PAID" : newAmountPaid > 0 ? "PARTIAL" : "RECEIVED";
    const updatedBill = await prisma.purchaseBill.update({
      where: { id: req.params.id },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus as any,
      },
    });

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "purchasebill.payment",
      entityType: "Payment",
      entityId: payment.id,
      detail: { billNumber: bill.number, amount },
    });

    res.json({ payment, bill: updatedBill });
  } catch (error) {
    console.error("Error recording payment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cancel bill
purchaseBillsRouter.post("/:id/cancel", async (req: AuthedRequest, res) => {
  try {
    const bill = await prisma.purchaseBill.findUnique({ where: { id: req.params.id } });
    if (!bill || bill.businessId !== req.businessId) {
      return res.status(404).json({ error: "Bill not found" });
    }

    if (bill.status === "CANCELLED") {
      return res.status(400).json({ error: "Bill already cancelled" });
    }

    // Reverse stock movements
    const billItems = await prisma.purchaseBillItem.findMany({ where: { billId: req.params.id } });
    for (const item of billItems) {
      if (item.itemId) {
        await prisma.item.update({
          where: { id: item.itemId },
          data: { currentStock: { decrement: item.quantity } },
        });

        await prisma.stockMovement.create({
          data: {
            businessId: req.businessId!,
            itemId: item.itemId,
            change: -item.quantity,
            reason: "RETURN",
            refId: req.params.id,
            note: `Bill #${bill.number} cancelled`,
          },
        });
      }
    }

    const updated = await prisma.purchaseBill.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED" },
    });

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "purchasebill.cancel",
      entityType: "PurchaseBill",
      entityId: bill.id,
      detail: { number: bill.number },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error cancelling bill:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
