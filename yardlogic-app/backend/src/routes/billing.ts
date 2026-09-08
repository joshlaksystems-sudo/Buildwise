import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";

export const billingRouter = Router();

billingRouter.post("/webhook", async (req, res) => {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  const signature = req.header("X-Billing-Signature");
  const eventId = req.header("X-Billing-Event-Id");
  if (!secret || !signature || !eventId) return res.status(401).json({ error: "Billing webhook is not configured" });
  const raw = JSON.stringify(req.body || {});
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (signatureBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(signatureBytes, expectedBytes)) return res.status(401).json({ error: "Invalid billing signature" });
  const payload = req.body as { type?: string; subscription?: { providerSubscriptionId?: string; status?: string; currentPeriodEnd?: string; businessId?: string; userId?: string; plan?: string } };
  const existing = await prisma.billingEvent.findUnique({ where: { providerEventId: eventId } });
  if (existing) return res.json({ accepted: true, replayed: true });
  await prisma.$transaction(async (tx) => {
    await tx.billingEvent.create({ data: { provider: "custom", providerEventId: eventId, eventType: payload.type || "unknown", payload: req.body } });
    const subscription = payload.subscription;
    if (subscription?.businessId && subscription.userId && subscription.plan && subscription.status) {
      await tx.subscription.upsert({
        where: { providerSubscriptionId: subscription.providerSubscriptionId || `event:${eventId}` },
        create: { businessId: subscription.businessId, userId: subscription.userId, plan: subscription.plan, status: subscription.status as never, providerSubscriptionId: subscription.providerSubscriptionId, currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : undefined },
        update: { status: subscription.status as never, plan: subscription.plan, currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : undefined },
      });
    }
    await tx.billingEvent.update({ where: { providerEventId: eventId }, data: { processedAt: new Date() } });
  });
  res.json({ accepted: true, replayed: false });
});

const checkoutSchema = z.object({ plan: z.enum(["STARTER", "PRO", "ENTERPRISE"]) });
billingRouter.post("/checkout", requireAuth, requireRole("OWNER", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: "Billing provider is not configured" });
  res.status(501).json({ error: "Checkout provider adapter is not enabled yet", plan: parsed.data.plan });
});
