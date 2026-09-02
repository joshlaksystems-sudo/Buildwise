import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const bankStatementsRouter = Router();
bankStatementsRouter.use(requireAuth);

interface BankStatementLine {
  date: string;
  description: string;
  amount: number;
  direction: "IN" | "OUT";
  reference?: string;
}

// Parse CSV content from uploaded file
function parseCSV(content: string): BankStatementLine[] {
  const lines = content.split("\n").filter((line) => line.trim());
  const parsed: BankStatementLine[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((col) => col.trim());
    if (cols.length < 4) continue;

    const date = cols[0];
    const description = cols[1];
    const amountStr = cols[2];
    const direction = cols[3].toUpperCase() === "IN" ? "IN" : "OUT";

    const amount = parseFloat(amountStr);
    if (isNaN(amount)) continue;

    parsed.push({
      date,
      description,
      amount,
      direction,
      reference: cols[4] || undefined,
    });
  }

  return parsed;
}

// POST /bank/statements/upload - Upload and parse CSV
bankStatementsRouter.post("/statements/upload", async (req: AuthedRequest, res) => {
  try {
    const { csvContent, accountNumber, bankName } = z
      .object({
        csvContent: z.string(),
        accountNumber: z.string(),
        bankName: z.string(),
      })
      .parse(req.body);

    const lines = parseCSV(csvContent);
    if (lines.length === 0) {
      return res.status(400).json({ error: "No valid rows found in CSV" });
    }

    // Match each line against payments in date range
    const matches: any[] = [];
    const unmatched: any[] = [];

    for (const line of lines) {
      const lineDate = new Date(line.date);
      const dateStart = new Date(lineDate);
      dateStart.setDate(dateStart.getDate() - 2); // 2 days tolerance
      const dateEnd = new Date(lineDate);
      dateEnd.setDate(dateEnd.getDate() + 2);

      // Find matching payment
      const payment = await prisma.payment.findFirst({
        where: {
          businessId: req.businessId,
          amount: line.amount,
          direction: line.direction,
          createdAt: {
            gte: dateStart,
            lte: dateEnd,
          },
        },
        include: {
          invoice: { select: { number: true } },
          bill: { select: { number: true } },
          customer: { select: { name: true } },
          supplier: { select: { name: true } },
        },
      });

      if (payment) {
        matches.push({
          statementLine: line,
          payment,
          matchType: "EXACT",
          confidence: 0.95,
        });
      } else {
        // Check for partial matches
        const closePayment = await prisma.payment.findFirst({
          where: {
            businessId: req.businessId,
            direction: line.direction,
            amount: {
              gte: line.amount * 0.95,
              lte: line.amount * 1.05,
            },
            createdAt: {
              gte: dateStart,
              lte: dateEnd,
            },
          },
          include: {
            invoice: { select: { number: true } },
            bill: { select: { number: true } },
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        });

        if (closePayment) {
          matches.push({
            statementLine: line,
            payment: closePayment,
            matchType: "PARTIAL",
            confidence: 0.7,
          });
        } else {
          unmatched.push({
            ...line,
            status: "UNMATCHED",
          });
        }
      }
    }

    // Log the import
    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "bank.statement_upload",
      entityType: "BankStatement",
      entityId: `${accountNumber}-${Date.now()}`,
      detail: {
        accountNumber,
        bankName,
        totalLines: lines.length,
        matched: matches.length,
        unmatched: unmatched.length,
      },
    });

    res.json({
      summary: {
        totalLines: lines.length,
        matched: matches.length,
        unmatched: unmatched.length,
        accountNumber,
        bankName,
        uploadedAt: new Date().toISOString(),
      },
      matches,
      unmatched,
    });
  } catch (error) {
    console.error("Error uploading statement:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /bank/statements/reconciliation - Reconciliation report
bankStatementsRouter.get("/statements/reconciliation", async (req: AuthedRequest, res) => {
  try {
    const { startDate, endDate, direction = "IN" } = req.query;

    const where: any = {
      businessId: req.businessId,
      direction,
    };

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        invoice: { select: { number: true } },
        bill: { select: { number: true } },
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const reconciled = payments.filter((p) => p.reconciled || false).length;

    res.json({
      period: { startDate, endDate },
      direction,
      totalPayments: payments.length,
      reconciledCount: reconciled,
      totalAmount,
      payments: payments.map((p) => ({
        id: p.id,
        date: p.createdAt,
        amount: p.amount,
        mode: p.mode,
        reference: p.note,
        invoiceNumber: p.invoice?.number,
        billNumber: p.bill?.number,
        customerName: p.customer?.name,
        supplierName: p.supplier?.name,
        reconciled: p.reconciled || false,
      })),
    });
  } catch (error) {
    console.error("Error fetching reconciliation report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /bank/statements/reconcile/:paymentId - Mark payment as reconciled
bankStatementsRouter.patch("/statements/reconcile/:paymentId", async (req: AuthedRequest, res) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.paymentId } });

    if (!payment || payment.businessId !== req.businessId) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const updated = await prisma.payment.update({
      where: { id: req.params.paymentId },
      data: { reconciled: true },
    });

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "payment.reconcile",
      entityType: "Payment",
      entityId: payment.id,
      detail: { amount: payment.amount },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error reconciling payment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /bank/statements/discrepancies - Find unreconciled/suspicious transactions
bankStatementsRouter.get("/statements/discrepancies", async (req: AuthedRequest, res) => {
  try {
    const { days = 30 } = req.query;

    const since = new Date();
    since.setDate(since.getDate() - parseInt(days as string));

    const payments = await prisma.payment.findMany({
      where: {
        businessId: req.businessId,
        createdAt: { gte: since },
        reconciled: false,
      },
      include: {
        invoice: { select: { number: true } },
        bill: { select: { number: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Find duplicate payments (same amount, date, within 5 minutes)
    const duplicates: any[] = [];
    const seen = new Set<string>();

    for (const p1 of payments) {
      for (const p2 of payments) {
        if (p1.id !== p2.id && p1.amount === p2.amount) {
          const timeDiff = Math.abs(
            p1.createdAt.getTime() - p2.createdAt.getTime()
          );
          if (timeDiff < 5 * 60 * 1000) {
            const key = [p1.id, p2.id].sort().join("-");
            if (!seen.has(key)) {
              duplicates.push({ payment1: p1, payment2: p2, timeDiffMs: timeDiff });
              seen.add(key);
            }
          }
        }
      }
    }

    // Find orphaned payments (no invoice/bill reference)
    const orphaned = payments.filter((p) => !p.invoiceId && !p.billId);

    res.json({
      period: { since, days: parseInt(days as string) },
      summary: {
        unreconciled: payments.length,
        duplicates: duplicates.length,
        orphaned: orphaned.length,
      },
      unreconciled: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        direction: p.direction,
        date: p.createdAt,
        invoiceNumber: p.invoice?.number,
        billNumber: p.bill?.number,
      })),
      duplicates,
      orphaned,
    });
  } catch (error) {
    console.error("Error fetching discrepancies:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
