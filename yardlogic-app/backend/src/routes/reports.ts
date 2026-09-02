import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get("/summary", async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  if (from && Number.isNaN(from.getTime())) return res.status(400).json({ error: "Invalid from date" });
  if (to && Number.isNaN(to.getTime())) return res.status(400).json({ error: "Invalid to date" });
  if (from && to && from > to) return res.status(400).json({ error: "from date must be before to date" });
  const createdAt = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;
  const [invoices, expenses, purchaseBills, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { businessId, createdAt }, include: { items: true } }),
    prisma.expense.findMany({ where: { businessId, createdAt } }),
    prisma.purchaseBill.findMany({ where: { businessId, createdAt } }),
    prisma.payment.findMany({ where: { businessId, createdAt } }),
  ]);

  const totalSales = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalTaxCollected = invoices.reduce((s, i) => s + i.taxTotal, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const receivableOutstanding = invoices.reduce((s, i) => s + (i.grandTotal - i.amountPaid), 0);

  // Payables: total unpaid purchase bills
  const totalPurchases = purchaseBills.reduce((s, b) => s + b.grandTotal, 0);
  const payableOutstanding = purchaseBills.reduce((s, b) => s + (b.grandTotal - b.amountPaid), 0);

  // Cash flow: total in vs total out
  const totalCashIn = payments.filter((p) => p.direction === "IN").reduce((s, p) => s + p.amount, 0);
  const totalCashOut = payments.filter((p) => p.direction === "OUT").reduce((s, p) => s + p.amount, 0);
  const netCashFlow = totalCashIn - totalCashOut;

  // Bill-wise profit: sale line total minus item purchase price * qty.
  let grossProfit = 0;
  for (const inv of invoices) {
    for (const line of inv.items) {
      grossProfit += line.lineTotal;
    }
  }

  // 7-day cash flow trend for the dashboard chart (oldest to newest).
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cashFlowTrend: { period: string; amount: number }[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - offset);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayNet = payments
      .filter((p) => p.createdAt >= dayStart && p.createdAt < dayEnd)
      .reduce((s, p) => s + (p.direction === "IN" ? p.amount : -p.amount), 0);

    cashFlowTrend.push({ period: dayLabels[dayStart.getDay()], amount: dayNet });
  }

  res.json({
    totalSales,
    totalTaxCollected,
    totalExpenses,
    totalPurchases,
    // Aliases kept for both Reports.tsx (`outstanding`) and Dashboard.tsx
    // (`totalReceivables`/`totalPayables`/`cashBalance`), same underlying values.
    outstanding: receivableOutstanding,
    receivableOutstanding,
    payableOutstanding,
    totalReceivables: receivableOutstanding,
    totalPayables: payableOutstanding,
    cashBalance: netCashFlow,
    netCashFlow,
    cashFlowTrend,
    invoiceCount: invoices.length,
    purchaseBillCount: purchaseBills.length,
    netProfitEstimate: totalSales - totalPurchases - totalExpenses,
    period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
  });
});

// GET /reports/receivables-aging - Customer-wise aging
reportsRouter.get("/receivables-aging", async (req: AuthedRequest, res) => {
  try {
    const businessId = req.businessId!;
    const invoices = await prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ["UNPAID", "PARTIAL"] },
      },
      include: {
        customer: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date();
    const aging: any = {
      current: 0,
      _0_30: 0,
      _30_60: 0,
      _60_90: 0,
      _90_plus: 0,
      total: 0,
      details: [],
    };

    for (const invoice of invoices) {
      const outstanding = invoice.grandTotal - invoice.amountPaid;
      const daysOld = Math.floor((now.getTime() - invoice.createdAt.getTime()) / (1000 * 60 * 60 * 24));

      let bucket = "current";
      if (daysOld > 90) {
        bucket = "_90_plus";
        aging._90_plus += outstanding;
      } else if (daysOld > 60) {
        bucket = "_60_90";
        aging._60_90 += outstanding;
      } else if (daysOld > 30) {
        bucket = "_30_60";
        aging._30_60 += outstanding;
      } else if (daysOld > 0) {
        bucket = "_0_30";
        aging._0_30 += outstanding;
      } else {
        aging.current += outstanding;
      }

      aging.total += outstanding;
      aging.details.push({
        invoiceNumber: invoice.number,
        customerId: invoice.customerId,
        customerName: invoice.customer?.name || "Walk-in",
        daysOld,
        amount: outstanding,
        bucket,
      });
    }

    res.json(aging);
  } catch (error) {
    console.error("Error fetching receivables aging:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/payables-aging - Supplier-wise aging
reportsRouter.get("/payables-aging", async (req: AuthedRequest, res) => {
  try {
    const businessId = req.businessId!;
    const bills = await prisma.purchaseBill.findMany({
      where: {
        businessId,
        status: { in: ["DRAFT", "RECEIVED", "PARTIAL"] },
      },
      include: {
        supplier: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date();
    const aging: any = {
      current: 0,
      _0_30: 0,
      _30_60: 0,
      _60_90: 0,
      _90_plus: 0,
      total: 0,
      details: [],
    };

    for (const bill of bills) {
      const outstanding = bill.grandTotal - bill.amountPaid;
      const daysOld = Math.floor((now.getTime() - bill.createdAt.getTime()) / (1000 * 60 * 60 * 24));

      let bucket = "current";
      if (daysOld > 90) {
        bucket = "_90_plus";
        aging._90_plus += outstanding;
      } else if (daysOld > 60) {
        bucket = "_60_90";
        aging._60_90 += outstanding;
      } else if (daysOld > 30) {
        bucket = "_30_60";
        aging._30_60 += outstanding;
      } else if (daysOld > 0) {
        bucket = "_0_30";
        aging._0_30 += outstanding;
      } else {
        aging.current += outstanding;
      }

      aging.total += outstanding;
      aging.details.push({
        billNumber: bill.number,
        supplierId: bill.supplierId,
        supplierName: bill.supplier?.name || "Unknown",
        daysOld,
        amount: outstanding,
        bucket,
      });
    }

    res.json(aging);
  } catch (error) {
    console.error("Error fetching payables aging:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/cash-flow - Cash flow by day/week/month
reportsRouter.get("/cash-flow", async (req: AuthedRequest, res) => {
  try {
    const businessId = req.businessId!;
    const period = (req.query.period as string) || "daily"; // daily, weekly, monthly

    const payments = await prisma.payment.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    });

    const cashFlow: any = {};

    for (const payment of payments) {
      let key: string;
      if (period === "daily") {
        key = payment.createdAt.toISOString().split("T")[0];
      } else if (period === "weekly") {
        const date = new Date(payment.createdAt);
        const week = Math.floor((date.getDate() - date.getDay()) / 7);
        key = `${date.getFullYear()}-W${week}`;
      } else {
        key = payment.createdAt.toISOString().slice(0, 7);
      }

      if (!cashFlow[key]) {
        cashFlow[key] = { date: key, inflow: 0, outflow: 0 };
      }

      if (payment.direction === "IN") {
        cashFlow[key].inflow += payment.amount;
      } else {
        cashFlow[key].outflow += payment.amount;
      }
    }

    const sorted = Object.values(cashFlow)
      .map((item: any) => ({
        ...item,
        net: item.inflow - item.outflow,
      }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    res.json(sorted);
  } catch (error) {
    console.error("Error fetching cash flow:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/profit-loss - Profit & loss statement
reportsRouter.get("/profit-loss", async (req: AuthedRequest, res) => {
  try {
    const businessId = req.businessId!;
    const period = (req.query.period as string) || "all"; // all, thisMonth, lastMonth, thisYear

    let dateFilter: any = {};
    const now = new Date();

    if (period === "thisMonth") {
      dateFilter = {
        gte: new Date(now.getFullYear(), now.getMonth(), 1),
        lte: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      };
    } else if (period === "lastMonth") {
      dateFilter = {
        gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        lte: new Date(now.getFullYear(), now.getMonth(), 0),
      };
    } else if (period === "thisYear") {
      dateFilter = {
        gte: new Date(now.getFullYear(), 0, 1),
        lte: new Date(now.getFullYear(), 11, 31),
      };
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        businessId,
        ...(period !== "all" && { createdAt: dateFilter }),
      },
    });

    const expenses = await prisma.expense.findMany({
      where: {
        businessId,
        ...(period !== "all" && { createdAt: dateFilter }),
      },
    });

    const revenue = invoices.reduce((s, i) => s + i.grandTotal, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const tax = invoices.reduce((s, i) => s + i.taxTotal, 0);

    const netProfit = revenue - totalExpenses - tax;

    res.json({
      period,
      revenue,
      expenses: totalExpenses,
      tax,
      netProfit,
      margin: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) + "%" : "0%",
    });
  } catch (error) {
    console.error("Error fetching profit & loss:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

reportsRouter.get("/gst", async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const invoices = await prisma.invoice.findMany({ where: { businessId, type: "GST" } });
  const collected = invoices.reduce((s, i) => s + i.taxTotal, 0);
  res.json({ gstCollected: collected, invoiceCount: invoices.length });
});
