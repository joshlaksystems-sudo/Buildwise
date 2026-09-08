import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { serializableTransaction } from "../lib/transactions.js";

export const timeEntriesRouter = Router();

const timeEntrySchema = z.object({
  taskId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(16).max(120),
  startedAt: z.coerce.date(),
  minutes: z.number().int().min(1).max(1_440),
  note: z.string().trim().max(2_000).optional(),
});

timeEntriesRouter.post("/", requireAuth, requireRole("ADMIN", "STAFF_DETAILER"), async (req: AuthenticatedRequest, res) => {
  const parsed = timeEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { taskId, idempotencyKey, startedAt, minutes, note } = parsed.data;
  const organizationId = req.organizationId!;
  const userId = req.userId!;

  try {
    const result = await serializableTransaction(async (tx) => {
      const existing = await tx.timeEntry.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } } });
      if (existing) return { entry: existing, replayed: true };

      const task = await tx.task.findFirst({ where: { id: taskId, project: { organizationId } }, select: { id: true, projectId: true } });
      if (!task) throw new Error("TASK_NOT_FOUND");

      const hours = new Prisma.Decimal(minutes).div(60);
      const entry = await tx.timeEntry.create({ data: { organizationId, taskId: task.id, userId, idempotencyKey, startedAt, minutes, note } });
      await tx.task.update({ where: { id: task.id }, data: { hoursLogged: { increment: hours }, version: { increment: 1 } } });
      await tx.project.update({ where: { id: task.projectId }, data: { actualHours: { increment: hours }, version: { increment: 1 } } });
      await tx.outboxEvent.create({ data: { organizationId, eventType: "TIME_ENTRY_CREATED", aggregateType: "TimeEntry", aggregateId: entry.id, dedupeKey: `time-entry:${entry.id}`, payload: { entryId: entry.id, taskId, projectId: task.projectId, minutes } } });
      return { entry, replayed: false };
    });
    return res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return res.status(404).json({ error: "Task not found in this organization" });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await prisma.timeEntry.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } } });
      if (replay) return res.status(200).json({ entry: replay, replayed: true });
    }
    throw error;
  }
});