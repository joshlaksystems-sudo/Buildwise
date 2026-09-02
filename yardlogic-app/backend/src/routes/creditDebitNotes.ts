import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const creditDebitNotesRouter = Router();
creditDebitNotesRouter.use(requireAuth);

// ========== CREDIT NOTES (Customer returns) ==========

const creditNoteSchema = z.object({
  customerId: z.string().optional(),
  invoiceId: z.string().optional(),
  number: z.string(),
  reason: z.string(),
  amount: z.number().min(0),
  taxAmount: z.number().default(0),
});

// GET /credit-notes - List all credit notes
creditDebitNotesRouter.get("/credit-notes", async (req: AuthedRequest, res) => {
  try {
    const { customerId, invoiceId, skip = 0, take = 50 } = req.query;

    const where: any = { businessId: req.businessId };
    if (customerId) where.customerId = customerId;
    if (invoiceId) where.invoiceId = invoiceId;

    const creditNotes = await prisma.creditNote.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        invoice: { select: { number: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    const total = await prisma.creditNote.count({ where });

    res.json({ creditNotes, total });
  } catch (error) {
    console.error("Error fetching credit notes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /credit-notes/:id - Get single credit note
creditDebitNotesRouter.get("/credit-notes/:id", async (req: AuthedRequest, res) => {
  try {
    const creditNote = await prisma.creditNote.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        invoice: true,
        items: true,
      },
    });

    if (!creditNote || creditNote.businessId !== req.businessId) {
      return res.status(404).json({ error: "Credit note not found" });
    }

    res.json(creditNote);
  } catch (error) {
    console.error("Error fetching credit note:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /credit-notes - Create credit note (manual)
creditDebitNotesRouter.post("/credit-notes", async (req: AuthedRequest, res) => {
  try {
    const parsed = creditNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { customerId, invoiceId, number, reason, amount, taxAmount } = parsed.data;

    // Verify customer if provided
    if (customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer || customer.businessId !== req.businessId) {
        return res.status(404).json({ error: "Customer not found" });
      }
    }

    // Verify invoice if provided
    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || invoice.businessId !== req.businessId) {
        return res.status(404).json({ error: "Invoice not found" });
      }
    }

    const creditNote = await prisma.creditNote.create({
      data: {
        businessId: req.businessId!,
        customerId: customerId || null,
        invoiceId: invoiceId || null,
        number,
        reason,
        amount,
        taxAmount,
      },
    });

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "creditnote.create",
      entityType: "CreditNote",
      entityId: creditNote.id,
      detail: { number, amount, customerId },
    });

    res.status(201).json(creditNote);
  } catch (error) {
    console.error("Error creating credit note:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /credit-notes/:id - Delete credit note
creditDebitNotesRouter.delete("/credit-notes/:id", async (req: AuthedRequest, res) => {
  try {
    const creditNote = await prisma.creditNote.findUnique({ where: { id: req.params.id } });

    if (!creditNote || creditNote.businessId !== req.businessId) {
      return res.status(404).json({ error: "Credit note not found" });
    }

    // Also delete items
    await prisma.creditNoteItem.deleteMany({ where: { creditNoteId: req.params.id } });

    const deleted = await prisma.creditNote.delete({ where: { id: req.params.id } });

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "creditnote.delete",
      entityType: "CreditNote",
      entityId: creditNote.id,
      detail: { number: creditNote.number },
    });

    res.json(deleted);
  } catch (error) {
    console.error("Error deleting credit note:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========== DEBIT NOTES (Supplier returns) ==========

const debitNoteSchema = z.object({
  supplierId: z.string().optional(),
  number: z.string(),
  reason: z.string(),
  amount: z.number().min(0),
  taxAmount: z.number().default(0),
});

// GET /debit-notes - List all debit notes
creditDebitNotesRouter.get("/debit-notes", async (req: AuthedRequest, res) => {
  try {
    const { supplierId, skip = 0, take = 50 } = req.query;

    const where: any = { businessId: req.businessId };
    if (supplierId) where.supplierId = supplierId;

    const debitNotes = await prisma.debitNote.findMany({
      where,
      include: {
        supplier: { select: { name: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    const total = await prisma.debitNote.count({ where });

    res.json({ debitNotes, total });
  } catch (error) {
    console.error("Error fetching debit notes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /debit-notes/:id - Get single debit note
creditDebitNotesRouter.get("/debit-notes/:id", async (req: AuthedRequest, res) => {
  try {
    const debitNote = await prisma.debitNote.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        items: true,
      },
    });

    if (!debitNote || debitNote.businessId !== req.businessId) {
      return res.status(404).json({ error: "Debit note not found" });
    }

    res.json(debitNote);
  } catch (error) {
    console.error("Error fetching debit note:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /debit-notes - Create debit note (manual)
creditDebitNotesRouter.post("/debit-notes", async (req: AuthedRequest, res) => {
  try {
    const parsed = debitNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { supplierId, number, reason, amount, taxAmount } = parsed.data;

    // Verify supplier if provided
    if (supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier || supplier.businessId !== req.businessId) {
        return res.status(404).json({ error: "Supplier not found" });
      }
    }

    const debitNote = await prisma.debitNote.create({
      data: {
        businessId: req.businessId!,
        supplierId: supplierId || null,
        number,
        reason,
        amount,
        taxAmount,
      },
    });

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "debitnote.create",
      entityType: "DebitNote",
      entityId: debitNote.id,
      detail: { number, amount, supplierId },
    });

    res.status(201).json(debitNote);
  } catch (error) {
    console.error("Error creating debit note:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /debit-notes/:id - Delete debit note
creditDebitNotesRouter.delete("/debit-notes/:id", async (req: AuthedRequest, res) => {
  try {
    const debitNote = await prisma.debitNote.findUnique({ where: { id: req.params.id } });

    if (!debitNote || debitNote.businessId !== req.businessId) {
      return res.status(404).json({ error: "Debit note not found" });
    }

    // Also delete items
    await prisma.debitNoteItem.deleteMany({ where: { debitNoteId: req.params.id } });

    const deleted = await prisma.debitNote.delete({ where: { id: req.params.id } });

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "debitnote.delete",
      entityType: "DebitNote",
      entityId: debitNote.id,
      detail: { number: debitNote.number },
    });

    res.json(deleted);
  } catch (error) {
    console.error("Error deleting debit note:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
