import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import PDFDocument from "pdfkit";

export const ibimOperationsRouter = Router();
ibimOperationsRouter.use(requireAuth);

const money = z.number().finite().nonnegative();

ibimOperationsRouter.get("/rebates", async (req: AuthedRequest, res) => {
  const funds = await prisma.ibimRebateFund.findMany({ where: { businessId: req.businessId }, include: { allocations: { include: { member: true, payments: true } } }, orderBy: { rebateYear: "desc" } });
  res.json({ funds });
});

ibimOperationsRouter.post("/rebates/funds", requireRole("OWNER", "ADMIN", "ACCOUNTANT"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ rebateYear: z.number().int().min(2000).max(2200), totalPot: money }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const fund = await prisma.ibimRebateFund.upsert({ where: { businessId_rebateYear: { businessId: req.businessId!, rebateYear: parsed.data.rebateYear } }, update: { totalPot: parsed.data.totalPot }, create: { businessId: req.businessId!, ...parsed.data } });
  await writeAudit({ businessId: req.businessId!, userId: req.userId, action: "ibim.rebate.fund_upsert", entityType: "IbimRebateFund", entityId: fund.id, detail: parsed.data });
  res.status(201).json({ fund });
});

ibimOperationsRouter.post("/rebates/:fundId/allocations", requireRole("OWNER", "ADMIN", "ACCOUNTANT"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ memberId: z.string().uuid(), entitlement: money }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const fund = await prisma.ibimRebateFund.findFirst({ where: { id: req.params.fundId, businessId: req.businessId } });
  const member = await prisma.ibimMember.findFirst({ where: { id: parsed.data.memberId, businessId: req.businessId }, select: { id: true } });
  if (!fund || !member) return res.status(404).json({ error: "Rebate fund or member not found" });
  const allocation = await prisma.ibimRebateAllocation.upsert({ where: { fundId_memberId: { fundId: fund.id, memberId: member.id } }, update: { entitlement: parsed.data.entitlement }, create: { businessId: req.businessId!, fundId: fund.id, ...parsed.data } });
  res.status(201).json({ allocation });
});

ibimOperationsRouter.post("/rebates/allocations/:id/payments", requireRole("OWNER", "ADMIN", "ACCOUNTANT"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ amount: money, reference: z.string().trim().max(180).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const allocation = await prisma.ibimRebateAllocation.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!allocation) return res.status(404).json({ error: "Rebate allocation not found" });
  const remaining = Number(allocation.entitlement) - Number(allocation.paidAmount);
  if (parsed.data.amount > remaining) return res.status(422).json({ error: "Payment exceeds outstanding rebate entitlement" });
  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.ibimRebatePayment.create({ data: { businessId: req.businessId!, allocationId: allocation.id, ...parsed.data } });
    const paidAmount = Number(allocation.paidAmount) + parsed.data.amount;
    await tx.ibimRebateAllocation.update({ where: { id: allocation.id }, data: { paidAmount, status: paidAmount >= Number(allocation.entitlement) ? "PAID" : "PART_PAID" } });
    return created;
  });
  res.status(201).json({ payment });
});

ibimOperationsRouter.get("/budgets/:year", async (req: AuthedRequest, res) => {
  const year = Number(req.params.year);
  const budget = await prisma.ibimBudget.findFirst({ where: { businessId: req.businessId, budgetYear: year }, include: { lines: true } });
  const actual = await prisma.ibimTransaction.groupBy({ by: ["type"], where: { businessId: req.businessId, transactionDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } }, _sum: { amount: true } });
  res.json({ budget, actual });
});

ibimOperationsRouter.put("/budgets/:year", requireRole("OWNER", "ADMIN", "ACCOUNTANT"), async (req: AuthedRequest, res) => {
  const year = Number(req.params.year);
  const parsed = z.object({ status: z.enum(["DRAFT", "APPROVED", "CLOSED"]).optional(), lines: z.array(z.object({ category: z.string().trim().min(1).max(80), month: z.number().int().min(1).max(12), target: money })).max(500) }).safeParse(req.body);
  if (!Number.isInteger(year) || !parsed.success) return res.status(400).json({ error: parsed.success ? "Invalid budget year" : parsed.error.flatten() });
  const budget = await prisma.$transaction(async (tx) => {
    const saved = await tx.ibimBudget.upsert({ where: { businessId_budgetYear: { businessId: req.businessId!, budgetYear: year } }, update: { status: parsed.data.status }, create: { businessId: req.businessId!, budgetYear: year, status: parsed.data.status || "DRAFT" } });
    await tx.ibimBudgetLine.deleteMany({ where: { budgetId: saved.id } });
    await tx.ibimBudgetLine.createMany({ data: parsed.data.lines.map((line) => ({ ...line, businessId: req.businessId!, budgetId: saved.id })) });
    return tx.ibimBudget.findUnique({ where: { id: saved.id }, include: { lines: true } });
  });
  res.json({ budget });
});

ibimOperationsRouter.post("/bordereaux/:year/:month/close", requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const year = Number(req.params.year); const month = Number(req.params.month);
  if (!Number.isInteger(year) || month < 1 || month > 12) return res.status(400).json({ error: "Invalid bordereaux period" });
  const period = await prisma.$transaction(async (tx) => {
    const saved = await tx.ibimBordereauxPeriod.upsert({ where: { businessId_year_month: { businessId: req.businessId!, year, month } }, update: {}, create: { businessId: req.businessId!, year, month } });
    if (saved.status === "CLOSED") return tx.ibimBordereauxPeriod.findUniqueOrThrow({ where: { id: saved.id }, include: { rows: true } });
    const from = new Date(Date.UTC(year, month - 1, 1)); const to = new Date(Date.UTC(year, month, 1));
    const policies = await tx.ibimPolicy.findMany({ where: { businessId: req.businessId, status: { in: ["ACTIVE", "BOUND"] }, inceptionDate: { gte: from, lt: to } }, include: { member: true, proposal: true } });
    for (const policy of policies) {
      await tx.ibimBordereauxRow.upsert({ where: { periodId_policyId: { periodId: saved.id, policyId: policy.id } }, update: {}, create: { businessId: req.businessId!, periodId: saved.id, policyId: policy.id, proposalId: policy.proposalId, businessType: policy.proposal?.type === "RENEWAL" ? "RENEWAL" : "NEW_BUSINESS", snapshot: { policyNumber: policy.policyNumber, memberName: policy.member?.legalName, premium: policy.premium?.toString(), commission: policy.commission?.toString(), inceptionDate: policy.inceptionDate, renewalDate: policy.renewalDate } } });
    }
    return tx.ibimBordereauxPeriod.update({ where: { id: saved.id }, data: { status: "CLOSED", closedAt: new Date() }, include: { rows: true } });
  });
  await writeAudit({ businessId: req.businessId!, userId: req.userId, action: "ibim.bordereaux.close", entityType: "IbimBordereauxPeriod", entityId: period.id, detail: { year, month, rows: period.rows.length } });
  res.json({ period });
});

ibimOperationsRouter.get("/reports/kpis", async (req: AuthedRequest, res) => {
  const businessId = req.businessId!; const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), 0, 1); const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const [proposals, policies, members, transactions, tasks] = await Promise.all([
    prisma.ibimProposal.findMany({ where: { businessId, createdAt: { gte: from, lte: to } }, select: { status: true, type: true, createdAt: true, submittedAt: true } }),
    prisma.ibimPolicy.findMany({ where: { businessId, createdAt: { gte: from, lte: to } }, select: { status: true, premium: true, commission: true, memberId: true } }),
    prisma.ibimMember.count({ where: { businessId, createdAt: { gte: from, lte: to } } }),
    prisma.ibimTransaction.findMany({ where: { businessId, transactionDate: { gte: from, lte: to } }, select: { type: true, amount: true } }),
    prisma.ibimWorkflowTask.findMany({ where: { businessId, assignedToId: { not: null }, createdAt: { gte: from, lte: to } }, select: { assignedToId: true, status: true } }),
  ]);
  const accepted = proposals.filter((item) => item.status === "BOUND").length; const quoted = proposals.filter((item) => ["QUOTED", "BOUND"].includes(item.status)).length;
  res.json({ period: { from, to }, members, proposals: proposals.length, quoted, accepted, conversionRate: proposals.length ? accepted / proposals.length : 0, quoteRate: proposals.length ? quoted / proposals.length : 0, policies: policies.length, premium: policies.reduce((sum, row) => sum + Number(row.premium || 0), 0), commission: policies.reduce((sum, row) => sum + Number(row.commission || 0), 0), income: transactions.filter((row) => ["PREMIUM", "PAYMENT", "COMMISSION"].includes(row.type)).reduce((sum, row) => sum + Number(row.amount), 0), rebates: transactions.filter((row) => row.type === "REBATE").reduce((sum, row) => sum + Number(row.amount), 0), handlerPerformance: tasks.reduce<Record<string, { total: number; completed: number }>>((result, task) => { const key = task.assignedToId!; result[key] ||= { total: 0, completed: 0 }; result[key].total += 1; if (task.status === "DONE") result[key].completed += 1; return result; }, {}) });
});

ibimOperationsRouter.get("/reports/kpis.pdf", async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), 0, 1);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const [proposals, policies, transactions] = await Promise.all([
    prisma.ibimProposal.findMany({ where: { businessId, createdAt: { gte: from, lte: to } }, select: { status: true } }),
    prisma.ibimPolicy.findMany({ where: { businessId, createdAt: { gte: from, lte: to } }, select: { premium: true, commission: true } }),
    prisma.ibimTransaction.findMany({ where: { businessId, transactionDate: { gte: from, lte: to } }, select: { type: true, amount: true } }),
  ]);
  const bound = proposals.filter((row) => row.status === "BOUND" || row.status === "ACCEPTED").length;
  const premium = policies.reduce((sum, row) => sum + Number(row.premium || 0), 0);
  const commission = policies.reduce((sum, row) => sum + Number(row.commission || 0), 0);
  const income = transactions.filter((row) => ["PREMIUM", "PAYMENT", "COMMISSION"].includes(row.type)).reduce((sum, row) => sum + Number(row.amount), 0);
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => { res.type("application/pdf").setHeader("Content-Disposition", "attachment; filename=ibim-kpis.pdf").send(Buffer.concat(chunks)); });
  doc.fontSize(22).text("iBIM Management KPI Report").moveDown();
  doc.fontSize(10).text(`Period: ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`).moveDown(2);
  doc.fontSize(13).text(`Proposals: ${proposals.length}`);
  doc.text(`Bound / accepted: ${bound}`);
  doc.text(`Conversion rate: ${proposals.length ? ((bound / proposals.length) * 100).toFixed(1) : "0.0"}%`);
  doc.text(`Premium: GBP ${premium.toFixed(2)}`);
  doc.text(`Commission: GBP ${commission.toFixed(2)}`);
  doc.text(`Income: GBP ${income.toFixed(2)}`);
  doc.end();
});

ibimOperationsRouter.get("/reports/bordereaux/:year/:month.csv", async (req: AuthedRequest, res) => {
  const period = await prisma.ibimBordereauxPeriod.findFirst({ where: { businessId: req.businessId, year: Number(req.params.year), month: Number(req.params.month) }, include: { rows: true } });
  if (!period) return res.status(404).json({ error: "Bordereaux period not found" });
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = ["business_type,policy_number,member_name,premium,commission,inception_date,renewal_date"];
  for (const row of period.rows) { const data = row.snapshot as Record<string, unknown>; rows.push([row.businessType, data.policyNumber, data.memberName, data.premium, data.commission, data.inceptionDate, data.renewalDate].map(escape).join(",")); }
  res.type("text/csv").setHeader("Content-Disposition", `attachment; filename=bordereaux-${period.year}-${String(period.month).padStart(2, "0")}.csv`).send(rows.join("\n"));
});
