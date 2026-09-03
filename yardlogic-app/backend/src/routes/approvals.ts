import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth";

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

approvalsRouter.get("/", async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json(await prisma.approvalRequest.findMany({ where: { businessId: req.businessId, ...(status ? { status } : {}) }, include: { requester: { select: { name: true, email: true, phone: true } }, reviewer: { select: { name: true } } }, orderBy: { createdAt: "desc" } }));
});

approvalsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = z.object({ entityType: z.enum(["INVOICE", "PURCHASE_BILL", "STOCK_ADJUSTMENT", "GST_FILING"]), entityId: z.string().min(1), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await prisma.approvalRequest.create({ data: { ...parsed.data, businessId: req.businessId!, requestedByUserId: req.userId! } }));
});

approvalsRouter.patch("/:id", requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ status: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.approvalRequest.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: "Approval request not found" });
  if (existing.status !== "PENDING") return res.status(409).json({ error: "Approval request already reviewed" });
  res.json(await prisma.approvalRequest.update({ where: { id: existing.id }, data: { status: parsed.data.status, note: parsed.data.note ?? existing.note, reviewedByUserId: req.userId, reviewedAt: new Date() } }));
});