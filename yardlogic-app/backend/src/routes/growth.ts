import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { sendGmailEmail } from "../services/notifyService";

export const growthRouter = Router();
growthRouter.use(requireAuth);

growthRouter.get("/loyalty/:customerId", async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.findFirst({ where: { id: req.params.customerId, businessId: req.businessId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  const transactions = await prisma.loyaltyTransaction.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } });
  res.json({ customer, balance: transactions.reduce((sum, transaction) => sum + transaction.points, 0), transactions });
});

growthRouter.post("/loyalty/:customerId", async (req: AuthedRequest, res) => {
  const parsed = z.object({ points: z.number().refine((value) => value !== 0), reason: z.string().trim().max(200).optional(), invoiceId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const customer = await prisma.customer.findFirst({ where: { id: req.params.customerId, businessId: req.businessId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  const transaction = await prisma.loyaltyTransaction.create({ data: { ...parsed.data, customerId: customer.id } });
  await prisma.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: { increment: parsed.data.points } } });
  res.status(201).json(transaction);
});

const campaignSchema = z.object({ channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]), message: z.string().trim().min(1).max(2000), segment: z.enum(["high_value", "dormant", "frequent", "all"]) });

growthRouter.get("/campaigns", async (req: AuthedRequest, res) => {
  res.json(await prisma.campaign.findMany({ where: { businessId: req.businessId }, orderBy: { createdAt: "desc" } }));
});

growthRouter.post("/campaigns", async (req: AuthedRequest, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await prisma.campaign.create({ data: { ...parsed.data, businessId: req.businessId! } }));
});

growthRouter.post("/campaigns/:id/mark-sent", async (req: AuthedRequest, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  const count = campaign.segment === "dormant"
    ? await prisma.customer.count({ where: { businessId: req.businessId, lastPurchaseAt: { lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } } })
    : await prisma.customer.count({ where: { businessId: req.businessId } });
  res.json(await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "SENT", sentCount: count } }));
});

growthRouter.post("/campaigns/:id/send-email", async (req: AuthedRequest, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign.channel !== "EMAIL") return res.status(422).json({ error: "Only EMAIL campaigns can be sent through Gmail" });
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const customers = await prisma.customer.findMany({ where: { businessId: req.businessId, email: { not: null }, ...(campaign.segment === "dormant" ? { lastPurchaseAt: { lt: cutoff } } : {}) }, select: { email: true, name: true } });
  let sentCount = 0;
  for (const customer of customers) {
    try {
      if (await sendGmailEmail(customer.email!, "A message from your business", `Hello ${customer.name},\n\n${campaign.message}\n\nRegards`)) sentCount += 1;
    } catch (error) {
      console.error("Campaign email failed:", error);
    }
  }
  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "SENT", sentCount } });
  res.json({ campaign: updated, attempted: customers.length, sentCount });
});
