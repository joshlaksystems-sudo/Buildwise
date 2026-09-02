import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const challansRouter = Router();
challansRouter.use(requireAuth);

const lineSchema = z.object({
  itemId: z.string().optional(),
  name: z.string(),
  quantity: z.number().positive(),
});

const challanSchema = z.object({
  customerId: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

challansRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = challanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { customerId, lines } = parsed.data;

  const count = await prisma.deliveryChallan.count({ where: { businessId: req.businessId } });
  const number = `DC-${String(count + 1).padStart(4, "0")}`;

  const challan = await prisma.deliveryChallan.create({
    data: {
      businessId: req.businessId!,
      customerId,
      number,
      items: { create: lines },
    },
    include: { items: true },
  });
  res.status(201).json(challan);
});

challansRouter.get("/", async (req: AuthedRequest, res) => {
  res.json(await prisma.deliveryChallan.findMany({
    where: { businessId: req.businessId },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
  }));
});

// Marking delivered is what actually moves stock out — a challan
// on its own is just a promise to ship, not a stock event.
challansRouter.patch("/:id/deliver", async (req: AuthedRequest, res) => {
  const challan = await prisma.deliveryChallan.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { items: true },
  });
  if (!challan) return res.status(404).json({ error: "Not found" });
  if (challan.status === "DELIVERED") return res.status(409).json({ error: "Already delivered" });

  await prisma.$transaction(async (tx) => {
    for (const line of challan.items) {
      if (line.itemId) {
        await tx.item.update({ where: { id: line.itemId }, data: { currentStock: { decrement: line.quantity } } });
        await tx.stockMovement.create({
          data: { businessId: req.businessId!, itemId: line.itemId, change: -line.quantity, reason: "CHALLAN", refId: challan.id },
        });
      }
    }
    await tx.deliveryChallan.update({ where: { id: challan.id }, data: { status: "DELIVERED" } });
  });

  res.json({ ok: true });
});
