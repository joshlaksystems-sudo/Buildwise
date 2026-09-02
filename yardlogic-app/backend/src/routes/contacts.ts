import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

const contactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  gstin: z.string().optional(),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
});

const supplierExtendedSchema = contactSchema.extend({
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  ifscCode: z.string().optional(),
  paymentTerms: z.string().optional(),
  creditLimit: z.number().optional(),
});

// ========== CUSTOMERS ==========

contactsRouter.get("/customers", async (req: AuthedRequest, res) => {
  res.json(await prisma.customer.findMany({ where: { businessId: req.businessId }, orderBy: { name: "asc" } }));
});

contactsRouter.post("/customers", async (req: AuthedRequest, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await prisma.customer.create({ data: { ...parsed.data, businessId: req.businessId! } });
  res.status(201).json(customer);
});

contactsRouter.get("/customers/:id", async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
  });
  if (!customer || customer.businessId !== req.businessId) {
    return res.status(404).json({ error: "Customer not found" });
  }
  res.json(customer);
});

contactsRouter.patch("/customers/:id", async (req: AuthedRequest, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.businessId !== req.businessId) {
    return res.status(404).json({ error: "Customer not found" });
  }
  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json(updated);
});

contactsRouter.delete("/customers/:id", async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.businessId !== req.businessId) {
    return res.status(404).json({ error: "Customer not found" });
  }
  await prisma.customer.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ========== SUPPLIERS ==========

contactsRouter.get("/suppliers", async (req: AuthedRequest, res) => {
  res.json(
    await prisma.supplier.findMany({
      where: { businessId: req.businessId, isActive: true },
      orderBy: { name: "asc" },
    })
  );
});

contactsRouter.post("/suppliers", async (req: AuthedRequest, res) => {
  const parsed = supplierExtendedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const supplier = await prisma.supplier.create({
    data: {
      ...parsed.data,
      businessId: req.businessId!,
      isActive: true,
    },
  });
  res.status(201).json(supplier);
});

contactsRouter.get("/suppliers/:id", async (req: AuthedRequest, res) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: req.params.id },
  });
  if (!supplier || supplier.businessId !== req.businessId) {
    return res.status(404).json({ error: "Supplier not found" });
  }
  res.json(supplier);
});

contactsRouter.patch("/suppliers/:id", async (req: AuthedRequest, res) => {
  const parsed = supplierExtendedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id } });
  if (!supplier || supplier.businessId !== req.businessId) {
    return res.status(404).json({ error: "Supplier not found" });
  }
  const updated = await prisma.supplier.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json(updated);
});

// Soft delete supplier
contactsRouter.delete("/suppliers/:id", async (req: AuthedRequest, res) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id } });
  if (!supplier || supplier.businessId !== req.businessId) {
    return res.status(404).json({ error: "Supplier not found" });
  }
  await prisma.supplier.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ ok: true });
});

// Get supplier ledger (opening balance + all transactions)
contactsRouter.get("/suppliers/:id/ledger", async (req: AuthedRequest, res) => {
  try {
    const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id } });
    if (!supplier || supplier.businessId !== req.businessId) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // Get all purchase bills
    const bills = await prisma.purchaseBill.findMany({
      where: { supplierId: req.params.id, businessId: req.businessId },
      orderBy: { createdAt: "desc" },
    });

    // Get all payments
    const payments = await prisma.payment.findMany({
      where: { supplierId: req.params.id, businessId: req.businessId },
      orderBy: { createdAt: "desc" },
    });

    // Calculate ledger items
    const ledgerItems: any[] = [];

    // Opening balance
    if (supplier.openingBalance !== 0) {
      ledgerItems.push({
        type: "opening",
        date: supplier.createdAt,
        description: "Opening Balance",
        amount: supplier.openingBalance,
        balance: supplier.openingBalance,
        refId: null,
      });
    }

    let balance = supplier.openingBalance;

    // Add bills (amounts we owe)
    for (const bill of bills) {
      balance += bill.grandTotal - bill.amountPaid;
      ledgerItems.push({
        type: "bill",
        date: bill.createdAt,
        description: `Bill #${bill.number}`,
        amount: bill.grandTotal - bill.amountPaid,
        balance,
        refId: bill.id,
      });
    }

    // Add payments (amounts we paid)
    for (const payment of payments) {
      balance -= payment.amount;
      ledgerItems.push({
        type: "payment",
        date: payment.createdAt,
        description: `Payment - ${payment.mode}`,
        amount: -payment.amount,
        balance,
        refId: payment.id,
      });
    }

    // Sort by date
    ledgerItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({
      supplier: {
        id: supplier.id,
        name: supplier.name,
        gstin: supplier.gstin,
      },
      openingBalance: supplier.openingBalance,
      closingBalance: balance,
      ledgerItems,
    });
  } catch (error) {
    console.error("Error fetching supplier ledger:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get supplier payables aging report
contactsRouter.get("/suppliers/:id/aging", async (req: AuthedRequest, res) => {
  try {
    const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id } });
    if (!supplier || supplier.businessId !== req.businessId) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // Get unpaid and partially paid bills
    const bills = await prisma.purchaseBill.findMany({
      where: {
        supplierId: req.params.id,
        businessId: req.businessId,
        status: { in: ["DRAFT", "RECEIVED", "PARTIAL"] },
      },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date();
    const aging: any = {
      current: 0,
      _0_30: 0,
      _30_60: 0,
      _60_90: 0,
      _90_plus: 0,
      total: 0,
      details: [],
    };

    for (const bill of bills) {
      const outstanding = bill.grandTotal - bill.amountPaid;
      const daysOld = Math.floor(
        (now.getTime() - bill.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      let bucket = "current";
      if (daysOld > 90) {
        bucket = "_90_plus";
        aging._90_plus += outstanding;
      } else if (daysOld > 60) {
        bucket = "_60_90";
        aging._60_90 += outstanding;
      } else if (daysOld > 30) {
        bucket = "_30_60";
        aging._30_60 += outstanding;
      } else if (daysOld > 0) {
        bucket = "_0_30";
        aging._0_30 += outstanding;
      } else {
        aging.current += outstanding;
      }

      aging.total += outstanding;
      aging.details.push({
        billNumber: bill.number,
        daysOld,
        amount: outstanding,
        dueDate: bill.dueDate,
        bucket,
      });
    }

    res.json(aging);
  } catch (error) {
    console.error("Error fetching supplier aging:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
