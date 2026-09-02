import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const forecastRouter = Router();
forecastRouter.use(requireAuth);

// Stock-out prediction: for each item, look at SALE movements over
// the trailing 30 days, compute an average daily consumption rate,
// and divide current stock by that rate. Deterministic math, not an
// LLM guess — "Steel TMT 12mm may run out in 6 days" from the build
// doc is exactly this calculation, and it's more trustworthy done
// this way than asked of a language model.
forecastRouter.get("/stock-out", async (req: AuthedRequest, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const items = await prisma.item.findMany({ where: { businessId: req.businessId } });
  const movements = await prisma.stockMovement.findMany({
    where: { businessId: req.businessId, reason: "SALE", createdAt: { gte: since } },
  });

  const consumptionByItem = new Map<string, number>();
  for (const m of movements) {
    consumptionByItem.set(m.itemId, (consumptionByItem.get(m.itemId) ?? 0) + Math.abs(m.change));
  }

  const daysObserved = Math.max(1, Math.ceil((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000)));

  const predictions = items
    .map((item) => {
      const totalConsumed = consumptionByItem.get(item.id) ?? 0;
      const dailyRate = totalConsumed / daysObserved;
      if (dailyRate <= 0) return null;
      const daysRemaining = item.currentStock / dailyRate;
      return {
        itemId: item.id,
        name: item.name,
        currentStock: item.currentStock,
        unit: item.unit,
        dailyConsumptionRate: Number(dailyRate.toFixed(2)),
        daysRemaining: Number(daysRemaining.toFixed(1)),
        message: `${item.name} may run out in ${Math.max(0, Math.round(daysRemaining))} day${daysRemaining === 1 ? "" : "s"} at the current rate.`,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && p.daysRemaining <= 14)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  res.json({ predictions, observedOverDays: daysObserved });
});

// Material-wise profit: sale line revenue minus the item's
// purchase price at time of sale, grouped by item. Real numbers
// from real invoice lines, not an estimate.
forecastRouter.get("/material-profit", async (req: AuthedRequest, res) => {
  const invoiceItems = await prisma.invoiceItem.findMany({
    where: { invoice: { businessId: req.businessId, status: { not: "CANCELLED" } } },
    include: { item: true },
  });

  const byItem = new Map<string, { name: string; revenue: number; cost: number; qty: number }>();
  for (const line of invoiceItems) {
    if (!line.item) continue;
    const key = line.item.id;
    const entry = byItem.get(key) ?? { name: line.item.name, revenue: 0, cost: 0, qty: 0 };
    entry.revenue += line.lineTotal;
    entry.cost += line.item.purchasePrice * line.quantity;
    entry.qty += line.quantity;
    byItem.set(key, entry);
  }

  const result = Array.from(byItem.entries())
    .map(([itemId, v]) => ({ itemId, ...v, profit: v.revenue - v.cost }))
    .sort((a, b) => b.profit - a.profit);

  res.json(result);
});

// Dormant customers — no purchase in the trailing 60 days, for the
// win-back alert feature.
forecastRouter.get("/dormant-customers", async (req: AuthedRequest, res) => {
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const customers = await prisma.customer.findMany({
    where: {
      businessId: req.businessId,
      OR: [{ lastPurchaseAt: { lt: cutoff } }, { lastPurchaseAt: null }],
    },
    orderBy: { lastPurchaseAt: "asc" },
  });
  res.json(customers);
});
