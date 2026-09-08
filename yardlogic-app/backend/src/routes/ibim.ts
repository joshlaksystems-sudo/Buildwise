import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";

export const ibimRouter = Router();
ibimRouter.use(requireAuth);

const projectSchema = z.object({
  title: z.string().trim().min(2).max(160),
  projectType: z.string().trim().min(2).max(80),
  estimatedHours: z.number().positive().max(1_000_000),
  clientId: z.string().uuid().optional(),
});

ibimRouter.get("/projects", async (req: AuthedRequest, res) => {
  const projects = await prisma.project.findMany({ where: { businessId: req.businessId }, include: { tasks: true }, orderBy: { updatedAt: "desc" } });
  res.json({ projects });
});

ibimRouter.post("/projects", requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.clientId) {
    const membership = await prisma.userBusiness.findUnique({ where: { userId_businessId: { userId: parsed.data.clientId, businessId: req.businessId! } } });
    if (!membership) return res.status(400).json({ error: "Client does not belong to this business" });
  }
  const project = await prisma.project.create({ data: { ...parsed.data, businessId: req.businessId! } });
  res.status(201).json(project);
});

const timeEntrySchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(16).max(120),
  startedAt: z.coerce.date(),
  minutes: z.number().int().min(1).max(1_440),
  note: z.string().trim().max(2_000).optional(),
});

ibimRouter.post("/time-entries", requireRole("OWNER", "ADMIN", "STAFF"), async (req: AuthedRequest, res) => {
  const parsed = timeEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const businessId = req.businessId!;
  const existing = await prisma.timeEntry.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: data.idempotencyKey } } });
  if (existing) return res.json({ entry: existing, replayed: true });

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: data.taskId, projectId: data.projectId, project: { businessId } } });
      if (!task) throw new Error("TASK_NOT_FOUND");
      const hours = data.minutes / 60;
      const created = await tx.timeEntry.create({ data: { ...data, businessId, userId: req.userId! } });
      await tx.task.update({ where: { id: task.id }, data: { hoursLogged: { increment: hours }, version: { increment: 1 } } });
      await tx.project.update({ where: { id: data.projectId }, data: { actualHours: { increment: hours }, version: { increment: 1 } } });
      return created;
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ entry, replayed: false });
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return res.status(404).json({ error: "Task not found in this business" });
    throw error;
  }
});

ibimRouter.get("/subscription", async (req: AuthedRequest, res) => {
  const subscription = await prisma.subscription.findFirst({ where: { businessId: req.businessId }, orderBy: { createdAt: "desc" } });
  res.json({ subscription, checkoutEnabled: Boolean(process.env.STRIPE_SECRET_KEY) });
});
