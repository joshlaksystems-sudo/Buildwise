import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const syncRouter = Router();
syncRouter.use(requireAuth);

// Tables the offline client is allowed to sync — must have an
// `updatedAt` column (Prisma @updatedAt) for last-write-wins to
// work, and a `businessId` column for tenant scoping.
const SYNCABLE_MODELS = ["item", "customer", "supplier", "invoice", "expense", "payment", "deliveryChallan", "estimate"] as const;
type SyncableModel = (typeof SYNCABLE_MODELS)[number];

function isSyncable(m: string): m is SyncableModel {
  return (SYNCABLE_MODELS as readonly string[]).includes(m);
}

// ---------- PUSH: client sends everything it created/edited while offline ----------
//
// Each row must include the client-generated `id` (a UUID minted
// offline, before any server round-trip — this is what lets the
// client create invoices, add items, etc. while fully disconnected)
// and an `updatedAt` timestamp from the device's local clock.
//
// Conflict rule: if a row with this id already exists on the server
// with a newer updatedAt than the incoming one, the server's version
// wins and the client is told so it can overwrite its local copy on
// the next pull — last-write-wins, scoped per row, not per table.

const pushSchema = z.object({
  model: z.string(),
  rows: z.array(z.record(z.any())).min(1),
});

syncRouter.post("/push", async (req: AuthedRequest, res) => {
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { model, rows } = parsed.data;

  if (!isSyncable(model)) {
    return res.status(400).json({ error: `model must be one of: ${SYNCABLE_MODELS.join(", ")}` });
  }

  const delegate = (prisma as any)[model];
  const results: { id: string; outcome: "applied" | "conflict" }[] = [];

  for (const row of rows) {
    if (!row.id) continue;

    const existing = await delegate.findFirst({ where: { id: row.id, businessId: req.businessId } });
    const incomingUpdatedAt = row.updatedAt ? new Date(row.updatedAt) : new Date();

    if (existing && existing.updatedAt && new Date(existing.updatedAt) > incomingUpdatedAt) {
      // Server has a newer edit — reject this one, client should
      // pull and overwrite its local copy.
      results.push({ id: row.id, outcome: "conflict" });
      continue;
    }

    await delegate.upsert({
      where: { id: row.id },
      update: { ...row, businessId: req.businessId },
      create: { ...row, businessId: req.businessId },
    });
    results.push({ id: row.id, outcome: "applied" });
  }

  res.json({ results });
});

// ---------- PULL: client asks "what changed since I last synced?" ----------

syncRouter.get("/pull", async (req: AuthedRequest, res) => {
  const model = req.query.model as string;
  const since = req.query.since ? new Date(req.query.since as string) : new Date(0);

  if (!isSyncable(model)) {
    return res.status(400).json({ error: `model must be one of: ${SYNCABLE_MODELS.join(", ")}` });
  }

  const delegate = (prisma as any)[model];
  const rows = await delegate.findMany({
    where: { businessId: req.businessId, updatedAt: { gt: since } },
    orderBy: { updatedAt: "asc" },
  });

  res.json({ rows, syncedAt: new Date().toISOString() });
});

// ---------- Convenience: pull every syncable table in one call ----------
// Used for the very first sync after login, when the client has
// nothing cached yet.

syncRouter.get("/bootstrap", async (req: AuthedRequest, res) => {
  const out: Record<string, unknown[]> = {};
  for (const model of SYNCABLE_MODELS) {
    const delegate = (prisma as any)[model];
    out[model] = await delegate.findMany({ where: { businessId: req.businessId }, orderBy: { updatedAt: "asc" } });
  }
  res.json({ ...out, syncedAt: new Date().toISOString() });
});
