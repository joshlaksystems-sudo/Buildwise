import { Router } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest, signIbimProposalAccessToken, verifyIbimProposalAccessToken } from "../middleware/auth";
import { memberSchema, normalizeImportedMember, parseCsvRows, proposalDataSchema } from "../services/ibimValidation";
import { sendGmailEmail } from "../services/notifyService";
import { writeAudit } from "../services/audit";

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

type ImportCandidate = {
  row: number;
  data: z.infer<typeof memberSchema>;
};

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
}

function duplicateWhere(data: z.infer<typeof memberSchema>, businessId: string): Prisma.IbimMemberWhereInput | null {
  const checks: Prisma.IbimMemberWhereInput[] = [];
  if (data.email) checks.push({ email: { equals: data.email, mode: "insensitive" } });
  if (data.phone) checks.push({ phone: { equals: data.phone } });
  if (data.externalRef) checks.push({ externalRef: { equals: data.externalRef, mode: "insensitive" } });
  if (data.legalName) checks.push({ legalName: { equals: data.legalName, mode: "insensitive" } });
  return checks.length ? { businessId, OR: checks } : null;
}

async function previewImportRows(rows: unknown[], businessId: string, rowOffset = 1) {
  const preview: Array<{ row: number; status: "READY" | "DUPLICATE" | "INVALID"; data?: z.infer<typeof memberSchema>; matches?: Array<{ id: string; legalName: string; email: string | null; phone: string | null; externalRef: string | null; matchedOn: string[] }>; issues?: unknown }> = [];
  const acceptedKeys = new Set<string>();
  const candidates: ImportCandidate[] = [];

  for (const [index, row] of rows.entries()) {
    const parsed = memberSchema.safeParse(row);
    const rowNumber = index + rowOffset;
    if (!parsed.success) {
      preview.push({ row: rowNumber, status: "INVALID", issues: parsed.error.flatten().fieldErrors });
      continue;
    }
    candidates.push({ row: rowNumber, data: parsed.data });
  }

  for (const candidate of candidates) {
    const data = candidate.data;
    const keys = [normalized(data.email), normalized(data.phone).replace(/\D/g, ""), normalized(data.externalRef), normalized(data.legalName)].filter(Boolean);
    const sameFileDuplicate = keys.some((key) => acceptedKeys.has(key));
    const where = duplicateWhere(data, businessId);
    const existing = where ? await prisma.ibimMember.findMany({ where, take: 10, select: { id: true, legalName: true, email: true, phone: true, externalRef: true } }) : [];
    const matches = existing.map((member) => ({
      ...member,
      matchedOn: [
        member.email && data.email && normalized(member.email) === normalized(data.email) ? "email" : "",
        member.phone && data.phone && member.phone.replace(/\D/g, "") === data.phone.replace(/\D/g, "") ? "phone" : "",
        member.externalRef && data.externalRef && normalized(member.externalRef) === normalized(data.externalRef) ? "externalRef" : "",
        normalized(member.legalName) === normalized(data.legalName) ? "legalName" : "",
      ].filter(Boolean),
    }));
    const duplicate = sameFileDuplicate || matches.length > 0;
    preview.push({ row: candidate.row, status: duplicate ? "DUPLICATE" : "READY", data, ...(matches.length ? { matches } : {}), ...(sameFileDuplicate ? { issues: { duplicateInUpload: true } } : {}) });
    keys.forEach((key) => acceptedKeys.add(key));
  }
  return preview.sort((a, b) => a.row - b.row);
}

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

ibimRouter.get("/renewals", async (req: AuthedRequest, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return res.status(400).json({ error: "Invalid renewal date range" });
  const renewals = await prisma.ibimPolicy.findMany({ where: { businessId: req.businessId, status: "ACTIVE", renewalDate: { gte: from, lte: to } }, include: { member: true }, orderBy: { renewalDate: "asc" } });
  res.json({ renewals });
});

ibimRouter.get("/renewals/calendar", async (req: AuthedRequest, res) => {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const policies = await prisma.ibimPolicy.findMany({
    where: { businessId: req.businessId, status: "ACTIVE", renewalDate: { lte: in90 } },
    include: { member: true },
    orderBy: { renewalDate: "asc" },
  });
  const overdue = policies.filter((policy) => policy.renewalDate && policy.renewalDate < now);
  const next30 = policies.filter((policy) => policy.renewalDate && policy.renewalDate >= now && policy.renewalDate <= in30);
  const next60 = policies.filter((policy) => policy.renewalDate && policy.renewalDate > in30 && policy.renewalDate <= in60);
  const next90 = policies.filter((policy) => policy.renewalDate && policy.renewalDate > in60 && policy.renewalDate <= in90);
  res.json({ overdue, next30, next60, next90, total: policies.length });
});

ibimRouter.post("/renewals/reminders", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const policies = await prisma.ibimPolicy.findMany({ where: { businessId: req.businessId, status: "ACTIVE", renewalDate: { gte: now, lte: in90 } }, select: { id: true, memberId: true, renewalDate: true, policyNumber: true } });
  let created = 0;
  for (const policy of policies) {
    const existing = await prisma.ibimWorkflowTask.findFirst({ where: { businessId: req.businessId, policyId: policy.id, type: "RENEWAL", status: { notIn: ["DONE", "CANCELLED"] } }, select: { id: true } });
    if (existing) continue;
    await prisma.ibimWorkflowTask.create({ data: { businessId: req.businessId!, memberId: policy.memberId, policyId: policy.id, type: "RENEWAL", status: "OPEN", dueAt: policy.renewalDate, note: `Renewal reminder for policy ${policy.policyNumber}` } });
    created += 1;
  }
  res.json({ created, checked: policies.length });
});

ibimRouter.get("/audit", async (req: AuthedRequest, res) => {
  const logs = await prisma.auditLog.findMany({ where: { businessId: req.businessId, entityType: { in: ["IbimMember", "IbimProposal", "IbimPolicy", "IbimTransaction", "IbimWorkflowTask"] } }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ logs });
});

ibimRouter.get("/activity", async (req: AuthedRequest, res) => {
  const memberId = typeof req.query.memberId === "string" ? req.query.memberId : undefined;
  const [logs, events, transactions] = await Promise.all([
    prisma.auditLog.findMany({ where: { businessId: req.businessId, ...(memberId ? { entityId: memberId } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.ibimWorkflowEvent.findMany({ where: { businessId: req.businessId, ...(memberId ? { memberId } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.ibimTransaction.findMany({ where: { businessId: req.businessId, ...(memberId ? { policy: { memberId } } : {}) }, include: { policy: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const activity = [
    ...logs.map((item) => ({ id: item.id, type: "AUDIT", at: item.createdAt, action: item.action, entityType: item.entityType, detail: item.detail })),
    ...events.map((item) => ({ id: item.id, type: "WORKFLOW", at: item.createdAt, action: item.eventType, entityType: "Workflow", detail: item.detail })),
    ...transactions.map((item) => ({ id: item.id, type: "TRANSACTION", at: item.createdAt, action: item.type, entityType: "IbimTransaction", detail: { amount: item.amount.toString(), policyNumber: item.policy.policyNumber } })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 200);
  res.json({ activity });
});

ibimRouter.get("/email-deliveries", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const deliveries = await prisma.ibimEmailDelivery.findMany({
    where: { businessId: req.businessId },
    include: { events: { orderBy: { processedAt: "desc" }, take: 10, select: { provider: true, eventType: true, processedAt: true } } },
    orderBy: { sentAt: "desc" },
    take: 200,
  });
  res.json({ deliveries });
});

ibimRouter.patch("/email-deliveries/:id", requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ status: z.enum(["SENT", "DELIVERED", "FAILED", "BOUNCED"]), providerRef: z.string().trim().max(180).optional(), error: z.string().trim().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const delivery = await prisma.ibimEmailDelivery.updateMany({ where: { id: req.params.id, businessId: req.businessId }, data: { ...parsed.data, deliveredAt: parsed.data.status === "DELIVERED" ? new Date() : undefined } });
  if (delivery.count !== 1) return res.status(404).json({ error: "Email delivery not found" });
  res.json({ updated: true });
});

ibimRouter.get("/members", async (req: AuthedRequest, res) => {
  const members = await prisma.ibimMember.findMany({ where: { businessId: req.businessId }, orderBy: { updatedAt: "desc" }, take: 100 });
  res.json({ members });
});

ibimRouter.post("/members", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const member = await prisma.ibimMember.create({ data: { ...parsed.data, status: "ACTIVE", source: "MANUAL", businessId: req.businessId! } });
  await writeAudit({ businessId: req.businessId!, userId: req.userId, action: "ibim.member.create", entityType: "IbimMember", entityId: member.id, detail: { source: "MANUAL" } });
  res.status(201).json({ member });
});

ibimRouter.post("/members/import/preview", requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const rows = z.array(z.unknown()).max(10_000).safeParse(req.body?.rows);
  if (!rows.success) return res.status(400).json({ error: "rows must be an array with no more than 10,000 records" });
  const preview = await previewImportRows(rows.data, req.businessId!, 1);
  res.json({ preview, summary: { ready: preview.filter((row) => row.status === "READY").length, duplicates: preview.filter((row) => row.status === "DUPLICATE").length, invalid: preview.filter((row) => row.status === "INVALID").length } });
});

ibimRouter.post("/members/import", requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const rows = z.array(z.unknown()).max(10_000).safeParse(req.body?.rows);
  if (!rows.success) return res.status(400).json({ error: "rows must be an array with no more than 10,000 records" });
  const preview = await previewImportRows(rows.data, req.businessId!, 1);
  const accepted: string[] = [];
  const rejected: Array<{ row: number; issues: unknown }> = [];
  const flagged: Array<{ row: number; reason: string }> = [];
  for (const item of preview) {
    if (item.status === "INVALID") { rejected.push({ row: item.row, issues: item.issues }); continue; }
    if (item.status === "DUPLICATE") { flagged.push({ row: item.row, reason: `Possible duplicate of ${item.matches?.[0]?.legalName || "another upload row"}` }); continue; }
    if (!item.data?.email && !item.data?.phone) flagged.push({ row: item.row, reason: "No email or phone supplied" });
    const member = await prisma.ibimMember.create({ data: { ...item.data!, status: "ACTIVE", source: "IMPORT", businessId: req.businessId! } });
    accepted.push(member.id);
  }
  res.status(201).json({ accepted: accepted.length, rejected, flagged, total: rows.data.length });
});

ibimRouter.post("/members/import.csv", requireRole("OWNER", "ADMIN"), csvUpload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "Upload a CSV file in the file field" });
  const rows = parseCsvRows(req.file.buffer.toString("utf8"));
  const normalizedRows = rows.map((row) => {
    const parsed = normalizeImportedMember(row);
    return parsed.success ? parsed.data : { ...row, legalName: row.legalName || row.legal_name || row.name || "" };
  });
  const preview = await previewImportRows(normalizedRows, req.businessId!, 2);
  const accepted: string[] = [];
  const rejected: Array<{ row: number; issues: unknown }> = [];
  const flagged: Array<{ row: number; reason: string }> = [];
  for (const item of preview) {
    if (item.status === "INVALID") { rejected.push({ row: item.row, issues: item.issues }); continue; }
    if (item.status === "DUPLICATE") { flagged.push({ row: item.row, reason: `Possible duplicate of ${item.matches?.[0]?.legalName || "another upload row"}` }); continue; }
    if (!item.data?.email && !item.data?.phone) flagged.push({ row: item.row, reason: "No email or phone supplied" });
    const member = await prisma.ibimMember.create({ data: { ...item.data!, status: "ACTIVE", source: "IMPORT", businessId: req.businessId! } });
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
  await writeAudit({ businessId, userId: req.userId, action: "ibim.proposal.create", entityType: "IbimProposal", entityId: proposal.id, detail: { type: parsed.data.type } });
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
  const parsed = z.object({
    status: z.enum(["DRAFT", "SUBMITTED", "IN_REVIEW", "QUOTED", "BOUND", "DECLINED"]),
    policyNumber: z.string().trim().min(2).max(100).optional(),
    insurerName: z.string().trim().max(180).optional(),
    externalPolicyRef: z.string().trim().max(180).optional(),
    premium: z.number().nonnegative().finite().optional(),
    commission: z.number().nonnegative().finite().optional(),
    inceptionDate: z.coerce.date().optional(),
    renewalDate: z.coerce.date().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.status === "BOUND" && !parsed.data.policyNumber) return res.status(422).json({ error: "policyNumber is required when binding a proposal" });
  const existing = await prisma.ibimProposal.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { member: true } });
  if (!existing) return res.status(404).json({ error: "Proposal not found" });
  const result = await prisma.$transaction(async (tx) => {
    const proposal = await tx.ibimProposal.update({ where: { id: existing.id }, data: { status: parsed.data.status } });
    if (parsed.data.status !== "BOUND") return { proposal, policy: null, transaction: null };
    const policy = await tx.ibimPolicy.upsert({
      where: { businessId_policyNumber: { businessId: req.businessId!, policyNumber: parsed.data.policyNumber! } },
      update: { memberId: existing.memberId, proposalId: existing.id, insurerName: parsed.data.insurerName, externalPolicyRef: parsed.data.externalPolicyRef, status: "BOUND", premium: parsed.data.premium, commission: parsed.data.commission, inceptionDate: parsed.data.inceptionDate || new Date(), renewalDate: parsed.data.renewalDate },
      create: { businessId: req.businessId!, memberId: existing.memberId, proposalId: existing.id, policyNumber: parsed.data.policyNumber!, insurerName: parsed.data.insurerName, externalPolicyRef: parsed.data.externalPolicyRef, status: "BOUND", premium: parsed.data.premium, commission: parsed.data.commission, inceptionDate: parsed.data.inceptionDate || new Date(), renewalDate: parsed.data.renewalDate },
    });
    const transaction = parsed.data.premium === undefined ? null : await tx.ibimTransaction.create({ data: { businessId: req.businessId!, policyId: policy.id, type: "PREMIUM", amount: parsed.data.premium, transactionDate: new Date(), reference: `BOUND:${existing.id}` } });
    await tx.ibimWorkflowTask.updateMany({ where: { businessId: req.businessId, proposalId: existing.id, status: { notIn: ["DONE", "CANCELLED"] } }, data: { status: "DONE", completedAt: new Date() } });
    return { proposal, policy, transaction };
  });
  await writeAudit({ businessId: req.businessId!, userId: req.userId, action: `ibim.proposal.${parsed.data.status.toLowerCase()}`, entityType: "IbimProposal", entityId: existing.id, detail: { policyNumber: parsed.data.policyNumber } });
  res.json({ updated: true, ...result });
});

ibimRouter.post("/policies", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const businessId = req.businessId!;
  if (!(await memberInBusiness(parsed.data.memberId, businessId))) return res.status(400).json({ error: "Member does not belong to this business" });
  const policy = await prisma.ibimPolicy.create({ data: { ...parsed.data, businessId, premium: parsed.data.premium, commission: parsed.data.commission } });
  await writeAudit({ businessId, userId: req.userId, action: "ibim.policy.create", entityType: "IbimPolicy", entityId: policy.id, detail: { policyNumber: policy.policyNumber } });
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
  await writeAudit({ businessId: req.businessId!, userId: req.userId, action: "ibim.transaction.create", entityType: "IbimTransaction", entityId: transaction.id, detail: { type: transaction.type, amount: transaction.amount.toString() } });
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

ibimRouter.get("/reports/filtered", async (req: AuthedRequest, res) => {
  const where: Prisma.IbimPolicyWhereInput = { businessId: req.businessId };
  if (typeof req.query.insurer === "string" && req.query.insurer.trim()) where.insurerName = { equals: req.query.insurer.trim(), mode: "insensitive" };
  if (typeof req.query.status === "string" && req.query.status.trim()) where.status = req.query.status.trim();
  if (typeof req.query.from === "string" || typeof req.query.to === "string") {
    const renewalDate: Prisma.DateTimeNullableFilter = {};
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    if (from && Number.isNaN(from.getTime()) || to && Number.isNaN(to.getTime())) return res.status(400).json({ error: "Invalid report date filter" });
    if (from) renewalDate.gte = from;
    if (to) renewalDate.lte = to;
    where.renewalDate = renewalDate;
  }
  const policies = await prisma.ibimPolicy.findMany({ where, include: { member: true, transactions: true }, orderBy: { renewalDate: "asc" }, take: 1_000 });
  const transactions = policies.flatMap((policy) => policy.transactions);
  res.json({ policies, transactions, payments: transactions.filter((row) => row.type === "PAYMENT"), rebates: transactions.filter((row) => row.type === "REBATE"), summary: { policies: policies.length, payments: transactions.filter((row) => row.type === "PAYMENT").length, rebates: transactions.filter((row) => row.type === "REBATE").length } });
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
  try {
    const messageId = await sendGmailEmail(task.member.email, subject, message);
    if (!messageId) return res.status(503).json({ error: "Email provider is not configured" });
    const delivery = await prisma.ibimEmailDelivery.create({ data: { businessId: req.businessId!, memberId: task.memberId, taskId: task.id, recipient: task.member.email, subject, kind: "CHASER", status: "SENT", providerRef: messageId } });
    res.json({ sent: true, deliveryId: delivery.id });
  } catch (error) {
    await prisma.ibimEmailDelivery.create({ data: { businessId: req.businessId!, memberId: task.memberId, taskId: task.id, recipient: task.member.email, subject, kind: "CHASER", status: "FAILED", error: error instanceof Error ? error.message : "Email send failed" } });
    throw error;
  }
});

ibimRouter.post("/reconciliation", requireRole("OWNER", "ADMIN", "ACCOUNTANT"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ sourceSystem: z.string().trim().min(1).max(80), rows: z.array(z.object({ policyNumber: z.string().trim().optional(), externalRef: z.string().trim().optional(), status: z.string().trim().optional(), premium: z.number().optional(), renewalDate: z.coerce.date().optional() })).max(10_000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const results = [];
  for (const row of parsed.data.rows) {
    const policy = await prisma.ibimPolicy.findFirst({ where: { businessId: req.businessId, OR: [{ policyNumber: row.policyNumber || undefined }, { externalPolicyRef: row.externalRef || undefined }] } });
    const differences: Record<string, unknown> = {};
    if (!policy) {
      results.push(await prisma.ibimReconciliation.create({ data: { businessId: req.businessId!, sourceSystem: parsed.data.sourceSystem, externalRef: row.externalRef, policyNumber: row.policyNumber, status: "MISSING", differences: { reason: "No matching platform policy" }, sourceData: jsonInput(row) } }));
      continue;
    }
    if (row.status && row.status !== policy.status) differences.status = { platform: policy.status, source: row.status };
    if (row.premium !== undefined && Number(policy.premium) !== row.premium) differences.premium = { platform: Number(policy.premium), source: row.premium };
    if (row.renewalDate && policy.renewalDate?.toISOString().slice(0, 10) !== row.renewalDate.toISOString().slice(0, 10)) differences.renewalDate = { platform: policy.renewalDate, source: row.renewalDate };
    results.push(await prisma.ibimReconciliation.create({ data: { businessId: req.businessId!, sourceSystem: parsed.data.sourceSystem, externalRef: row.externalRef, policyNumber: row.policyNumber, policyId: policy.id, status: Object.keys(differences).length ? "CHANGED" : "MATCHED", differences: jsonInput(differences), sourceData: jsonInput(row) } }));
  }
  res.status(201).json({ results, summary: { matched: results.filter((row) => row.status === "MATCHED").length, changed: results.filter((row) => row.status === "CHANGED").length, missing: results.filter((row) => row.status === "MISSING").length } });
});

ibimRouter.get("/reconciliation", requireRole("OWNER", "ADMIN", "ACCOUNTANT"), async (req: AuthedRequest, res) => {
  const records = await prisma.ibimReconciliation.findMany({ where: { businessId: req.businessId, ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }, orderBy: { checkedAt: "desc" }, take: 500 });
  res.json({ records });
});

ibimRouter.get("/privacy/export/:memberId", requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const member = await prisma.ibimMember.findFirst({ where: { id: req.params.memberId, businessId: req.businessId }, include: { proposals: true, policies: { include: { transactions: true } }, workflowTasks: true, workflowEvents: true } });
  if (!member) return res.status(404).json({ error: "Member not found" });
  await writeAudit({ businessId: req.businessId!, userId: req.userId, action: "ibim.privacy.export", entityType: "IbimMember", entityId: member.id });
  res.json({ exportedAt: new Date().toISOString(), member });
});

ibimRouter.post("/privacy/anonymize/:memberId", requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const member = await prisma.ibimMember.findFirst({ where: { id: req.params.memberId, businessId: req.businessId }, select: { id: true } });
  if (!member) return res.status(404).json({ error: "Member not found" });
  await prisma.ibimMember.update({ where: { id: member.id }, data: { legalName: "Anonymised member", tradingName: null, contactName: null, email: null, phone: null, address: null, externalRef: null, status: "INACTIVE" } });
  await writeAudit({ businessId: req.businessId!, userId: req.userId, action: "ibim.privacy.anonymize", entityType: "IbimMember", entityId: member.id });
  res.json({ anonymized: true });
});

ibimRouter.get("/subscription", async (req: AuthedRequest, res) => {
  const subscription = await prisma.subscription.findFirst({ where: { businessId: req.businessId }, orderBy: { createdAt: "desc" } });
  res.json({ subscription, checkoutEnabled: Boolean(process.env.STRIPE_SECRET_KEY) });
});

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
