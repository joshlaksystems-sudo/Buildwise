import { Router } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest, signIbimProposalAccessToken, verifyIbimProposalAccessToken } from "../middleware/auth";
import { memberSchema, normalizeImportedMember, parseCsvRows, proposalDataSchema } from "../services/ibimValidation";
import { sendGmailEmail } from "../services/notifyService";

export const ibimRouter = Router();
ibimRouter.use(requireAuth);

export const ibimPublicRouter = Router();

ibimPublicRouter.get("/proposals/:id", async (req, res) => {
  const access = verifyIbimProposalAccessToken(String(req.query.token || ""));
  if (!access || access.proposalId !== req.params.id) return res.status(401).json({ error: "Invalid or expired proposal link" });
  const proposal = await prisma.ibimProposal.findUnique({ where: { id: access.proposalId }, include: { member: true } });
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });
  res.json({ proposal: { id: proposal.id, type: proposal.type, status: proposal.status, formVersion: proposal.formVersion, data: proposal.data, member: proposal.member } });
});

const proposalSchema = z.object({
  memberId: z.string().uuid().optional(),
  type: z.enum(["NEW_BUSINESS", "RENEWAL"]),
  formVersion: z.string().trim().min(1).max(40),
  data: proposalDataSchema,
  effectiveDate: z.coerce.date().optional(),
});

ibimPublicRouter.post("/proposals/:id", async (req, res) => {
  const access = verifyIbimProposalAccessToken(String(req.query.token || ""));
  if (!access || access.proposalId !== req.params.id) return res.status(401).json({ error: "Invalid or expired proposal link" });
  const parsed = proposalDataSchema.safeParse(req.body?.data);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const proposal = await prisma.ibimProposal.update({ where: { id: access.proposalId }, data: { data: jsonInput(parsed.data), status: "SUBMITTED", submittedAt: new Date() } });
  res.json({ submitted: true, proposalId: proposal.id });
});

const policySchema = z.object({
  memberId: z.string().uuid().optional(),
  proposalId: z.string().uuid().optional(),
  policyNumber: z.string().trim().min(2).max(100),
  insurerName: z.string().trim().max(180).optional(),
  externalPolicyRef: z.string().trim().max(180).optional(),
  inceptionDate: z.coerce.date().optional(),
  renewalDate: z.coerce.date().optional(),
  premium: z.number().nonnegative().finite().optional(),
  commission: z.number().nonnegative().finite().optional(),
});

const transactionSchema = z.object({
  policyId: z.string().uuid(),
  type: z.enum(["PREMIUM", "PAYMENT", "REBATE", "COMMISSION"]),
  amount: z.number().finite(),
  transactionDate: z.coerce.date(),
  reference: z.string().trim().max(180).optional(),
});

const csvUpload = multer({ limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

function jsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

async function memberInBusiness(memberId: string | undefined, businessId: string) {
  if (!memberId) return true;
  return Boolean(await prisma.ibimMember.findFirst({ where: { id: memberId, businessId }, select: { id: true } }));
}

ibimRouter.get("/overview", async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const [members, openProposals, renewalsDue, premium, tasks] = await Promise.all([
    prisma.ibimMember.count({ where: { businessId, status: "ACTIVE" } }),
    prisma.ibimProposal.count({ where: { businessId, status: { in: ["SUBMITTED", "IN_REVIEW", "QUOTED"] } } }),
    prisma.ibimPolicy.count({ where: { businessId, status: "ACTIVE", renewalDate: { gte: new Date(), lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) } } }),
    prisma.ibimTransaction.aggregate({ where: { businessId, type: "PREMIUM" }, _sum: { amount: true } }),
    prisma.ibimWorkflowTask.count({ where: { businessId, status: { not: "DONE" } } }),
  ]);
  res.json({ members, openProposals, renewalsDue, openTasks: tasks, premium: premium._sum.amount?.toString() || "0" });
});

ibimRouter.get("/members", async (req: AuthedRequest, res) => {
  const members = await prisma.ibimMember.findMany({ where: { businessId: req.businessId }, orderBy: { updatedAt: "desc" }, take: 100 });
  res.json({ members });
});

ibimRouter.post("/members", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const member = await prisma.ibimMember.create({ data: { ...parsed.data, status: "ACTIVE", source: "MANUAL", businessId: req.businessId! } });
  res.status(201).json({ member });
});

ibimRouter.post("/members/import", requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const rows = z.array(z.unknown()).max(10_000).safeParse(req.body?.rows);
  if (!rows.success) return res.status(400).json({ error: "rows must be an array with no more than 10,000 records" });
  const accepted: string[] = [];
  const rejected: Array<{ row: number; issues: unknown }> = [];
  const flagged: Array<{ row: number; reason: string }> = [];
  for (const [index, row] of rows.data.entries()) {
    const parsed = memberSchema.safeParse(row);
    if (!parsed.success) { rejected.push({ row: index + 1, issues: parsed.error.flatten().fieldErrors }); continue; }
    if (!parsed.data.email && !parsed.data.phone) flagged.push({ row: index + 1, reason: "No email or phone supplied" });
    const member = await prisma.ibimMember.create({ data: { ...parsed.data, status: "ACTIVE", source: "IMPORT", businessId: req.businessId! } });
    accepted.push(member.id);
  }
  res.status(201).json({ accepted: accepted.length, rejected, flagged, total: rows.data.length });
});

ibimRouter.post("/members/import.csv", requireRole("OWNER", "ADMIN"), csvUpload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "Upload a CSV file in the file field" });
  const rows = parseCsvRows(req.file.buffer.toString("utf8"));
  const accepted: string[] = [];
  const rejected: Array<{ row: number; issues: unknown }> = [];
  const flagged: Array<{ row: number; reason: string }> = [];
  for (const [index, row] of rows.entries()) {
    const parsed = normalizeImportedMember(row);
    if (!parsed.success) { rejected.push({ row: index + 2, issues: parsed.error.flatten().fieldErrors }); continue; }
    if (!parsed.data.email && !parsed.data.phone) flagged.push({ row: index + 2, reason: "No email or phone supplied" });
    const member = await prisma.ibimMember.create({ data: { ...parsed.data, status: "ACTIVE", source: "IMPORT", businessId: req.businessId! } });
    accepted.push(member.id);
  }
  res.status(201).json({ accepted: accepted.length, rejected, flagged, total: rows.length });
});

ibimRouter.get("/proposals", async (req: AuthedRequest, res) => {
  const proposals = await prisma.ibimProposal.findMany({ where: { businessId: req.businessId }, include: { member: true }, orderBy: { updatedAt: "desc" }, take: 100 });
  res.json({ proposals });
});

ibimRouter.post("/proposals/:id/access-link", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const proposal = await prisma.ibimProposal.findFirst({ where: { id: req.params.id, businessId: req.businessId }, select: { id: true } });
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });
  res.json({ token: signIbimProposalAccessToken(proposal.id) });
});

ibimRouter.post("/proposals", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const parsed = proposalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const businessId = req.businessId!;
  if (!(await memberInBusiness(parsed.data.memberId, businessId))) return res.status(400).json({ error: "Member does not belong to this business" });
  const proposal = await prisma.$transaction(async (tx) => {
    const created = await tx.ibimProposal.create({ data: { ...parsed.data, data: jsonInput(parsed.data.data), businessId, status: "SUBMITTED", submittedAt: new Date() } });
    await tx.ibimWorkflowTask.create({ data: { businessId, memberId: parsed.data.memberId, proposalId: created.id, type: parsed.data.type === "RENEWAL" ? "RENEWAL" : "NEW_BUSINESS", status: "OPEN", note: "Review submitted proposal" } });
    return created;
  });
  res.status(201).json({ proposal });
});

ibimRouter.post("/proposals/:id/renew", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const previous = await prisma.ibimProposal.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!previous) return res.status(404).json({ error: "Proposal not found" });
  const renewal = await prisma.$transaction(async (tx) => {
    const created = await tx.ibimProposal.create({ data: { businessId: req.businessId!, memberId: previous.memberId, previousProposalId: previous.id, type: "RENEWAL", status: "DRAFT", formVersion: previous.formVersion, data: jsonInput(previous.data === null ? {} : previous.data) } });
    await tx.ibimWorkflowTask.create({ data: { businessId: req.businessId!, memberId: previous.memberId, proposalId: created.id, type: "RENEWAL", status: "OPEN", note: "Confirm pre-populated renewal details" } });
    return created;
  });
  res.status(201).json({ proposal: renewal });
});

ibimRouter.patch("/proposals/:id/status", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const status = z.enum(["DRAFT", "SUBMITTED", "IN_REVIEW", "QUOTED", "BOUND", "DECLINED"]).safeParse(req.body?.status);
  if (!status.success) return res.status(400).json({ error: "Invalid proposal status" });
  const proposal = await prisma.ibimProposal.updateMany({ where: { id: req.params.id, businessId: req.businessId }, data: { status: status.data } });
  if (proposal.count !== 1) return res.status(404).json({ error: "Proposal not found" });
  res.json({ updated: true });
});

ibimRouter.post("/policies", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const businessId = req.businessId!;
  if (!(await memberInBusiness(parsed.data.memberId, businessId))) return res.status(400).json({ error: "Member does not belong to this business" });
  const policy = await prisma.ibimPolicy.create({ data: { ...parsed.data, businessId, premium: parsed.data.premium, commission: parsed.data.commission } });
  res.status(201).json({ policy });
});

ibimRouter.get("/policies", async (req: AuthedRequest, res) => {
  const policies = await prisma.ibimPolicy.findMany({ where: { businessId: req.businessId }, include: { member: true }, orderBy: { renewalDate: "asc" }, take: 100 });
  res.json({ policies });
});

ibimRouter.post("/transactions", requireRole("OWNER", "ADMIN", "ACCOUNTANT"), async (req: AuthedRequest, res) => {
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const policy = await prisma.ibimPolicy.findFirst({ where: { id: parsed.data.policyId, businessId: req.businessId }, select: { id: true } });
  if (!policy) return res.status(400).json({ error: "Policy does not belong to this business" });
  const transaction = await prisma.ibimTransaction.create({ data: { ...parsed.data, businessId: req.businessId! } });
  res.status(201).json({ transaction });
});

ibimRouter.get("/reports/management", async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const [policies, transactions, proposals] = await Promise.all([
    prisma.ibimPolicy.groupBy({ by: ["status"], where: { businessId }, _count: { _all: true } }),
    prisma.ibimTransaction.groupBy({ by: ["type"], where: { businessId }, _sum: { amount: true } }),
    prisma.ibimProposal.groupBy({ by: ["status"], where: { businessId }, _count: { _all: true } }),
  ]);
  res.json({ policies, transactions, proposals });
});

ibimRouter.get("/tasks", async (req: AuthedRequest, res) => {
  const tasks = await prisma.ibimWorkflowTask.findMany({ where: { businessId: req.businessId, status: { not: "DONE" } }, include: { member: true, proposal: true, policy: true }, orderBy: { dueAt: "asc" }, take: 100 });
  res.json({ tasks });
});

ibimRouter.get("/reports/bordereaux.csv", async (req: AuthedRequest, res) => {
  const policies = await prisma.ibimPolicy.findMany({ where: { businessId: req.businessId }, include: { member: true }, orderBy: { policyNumber: "asc" } });
  const rows = ["policy_number,member_name,insurer,status,inception_date,renewal_date,premium,commission"];
  for (const policy of policies) {
    rows.push([policy.policyNumber, policy.member?.legalName || "", policy.insurerName || "", policy.status, policy.inceptionDate?.toISOString() || "", policy.renewalDate?.toISOString() || "", policy.premium?.toString() || "", policy.commission?.toString() || ""].map(csvEscape).join(","));
  }
  res.type("text/csv").setHeader("Content-Disposition", "attachment; filename=bordereaux.csv").send(rows.join("\n"));
});

ibimRouter.patch("/tasks/:id/complete", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const updated = await prisma.ibimWorkflowTask.updateMany({ where: { id: req.params.id, businessId: req.businessId }, data: { status: "DONE", completedAt: new Date() } });
  if (updated.count !== 1) return res.status(404).json({ error: "Task not found" });
  res.json({ updated: true });
});

ibimRouter.post("/tasks/:id/chase", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const task = await prisma.ibimWorkflowTask.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { member: true } });
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (!task.member?.email) return res.status(400).json({ error: "Member has no email address" });
  const subject = typeof req.body?.subject === "string" && req.body.subject.trim() ? req.body.subject.trim() : "Action required for your insurance proposal";
  const message = typeof req.body?.message === "string" && req.body.message.trim() ? req.body.message.trim() : "Please review and complete the outstanding insurance information requested by your broker.";
  const delivered = await sendGmailEmail(task.member.email, subject, message);
  if (!delivered) return res.status(503).json({ error: "Email provider is not configured" });
  res.json({ sent: true });
});

ibimRouter.get("/subscription", async (req: AuthedRequest, res) => {
  const subscription = await prisma.subscription.findFirst({ where: { businessId: req.businessId }, orderBy: { createdAt: "desc" } });
  res.json({ subscription, checkoutEnabled: Boolean(process.env.STRIPE_SECRET_KEY) });
});

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
