import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const bankRouter = Router();
bankRouter.use(requireAuth);

const lineSchema = z.object({ date: z.string(), description: z.string(), amount: z.number() });

// Import rows exported from a bank statement (CSV parsed client-
// side or in Apps Script, sent here as JSON) and attempt to
// auto-match each against a Payment by amount + nearby date —
// no real bank API needed for this to be useful.
bankRouter.post("/import", async (req: AuthedRequest, res) => {
  const rows = z.array(lineSchema).min(1).parse(req.body.rows);

  const results = [];
  for (const row of rows) {
    const date = new Date(row.date);
    const windowStart = new Date(date.getTime() - 3 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(date.getTime() + 3 * 24 * 60 * 60 * 1000);

    const match = await prisma.payment.findFirst({
      where: {
        businessId: req.businessId,
        amount: row.amount,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
    });

    const line = await prisma.bankStatementLine.create({
      data: {
        businessId: req.businessId!,
        date,
        description: row.description,
        amount: row.amount,
        matchedPaymentId: match?.id,
        status: match ? "MATCHED" : "UNMATCHED",
      },
    });
    results.push(line);
  }

  res.status(201).json({
    imported: results.length,
    matched: results.filter((r) => r.status === "MATCHED").length,
    results,
  });
});

bankRouter.get("/", async (req: AuthedRequest, res) => {
  const status = req.query.status as string | undefined;
  res.json(await prisma.bankStatementLine.findMany({
    where: { businessId: req.businessId, ...(status ? { status } : {}) },
    orderBy: { date: "desc" },
  }));
});

// Manual override for lines the auto-matcher missed.
bankRouter.patch("/:id/match", async (req: AuthedRequest, res) => {
  const parsed = z.object({ paymentId: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { paymentId } = parsed.data;
  const [existingLine, payment] = await Promise.all([
    prisma.bankStatementLine.findFirst({ where: { id: req.params.id, businessId: req.businessId } }),
    prisma.payment.findFirst({ where: { id: paymentId, businessId: req.businessId }, select: { id: true } }),
  ]);
  if (!existingLine || !payment) return res.status(404).json({ error: "Statement line or payment not found" });
  const updated = await prisma.bankStatementLine.update({
    where: { id: req.params.id },
    data: { matchedPaymentId: paymentId, status: "MATCHED" },
  });
  res.json(updated);
});

bankRouter.patch("/:id/ignore", async (req: AuthedRequest, res) => {
  const line = await prisma.bankStatementLine.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!line) return res.status(404).json({ error: "Statement line not found" });
  const updated = await prisma.bankStatementLine.update({ where: { id: line.id }, data: { status: "IGNORED" } });
  res.json(updated);
});
