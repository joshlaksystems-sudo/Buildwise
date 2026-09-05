import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

expensesRouter.get("/", async (req: AuthedRequest, res) => {
  res.json(await prisma.expense.findMany({
    where: { businessId: req.businessId },
    include: { supplier: true },
    orderBy: { createdAt: "desc" },
  }));
});

const expenseSchema = z.object({
  supplierId: z.string().optional(),
  category: z.string().optional(),
  amount: z.number().positive(),
  taxAmount: z.number().default(0),
  note: z.string().optional(),
  clientRequestId: z.string().trim().max(120).optional(),
});

// Manual entry — for the OCR/AI path see POST /ai/categorize-expense.
expensesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.clientRequestId) {
    const previous = await prisma.expense.findFirst({ where: { businessId: req.businessId, clientRequestId: parsed.data.clientRequestId } });
    if (previous) return res.json(previous);
  }
  if (parsed.data.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: parsed.data.supplierId, businessId: req.businessId },
      select: { id: true },
    });
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
  }
  const expense = await prisma.expense.create({ data: { ...parsed.data, businessId: req.businessId! } });
  res.status(201).json(expense);
});
