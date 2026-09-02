import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { categorizeReceiptText, answerBusinessQuestion } from "../services/aiService";
import {
  categorizeExpenseWithVertexAI,
  isSubscriptionActive,
  generateReportWithVertexAI,
  getInvoiceInsightsWithVertexAI,
} from "../services/googleCloud";
import { AICreditExhaustedError, getAIWallet, withAICredit } from "../services/aiWallet";

export const aiRouter = Router();
aiRouter.use(requireAuth);

// Middleware: Check subscription for AI features
async function requireAISubscription(req: AuthedRequest, res: any, next: any) {
  if (process.env.VERTEX_AI_SUBSCRIPTION_REQUIRED === "false") {
    return next();
  }

  const hasSubscription = await isSubscriptionActive(req.businessId!);
  if (!hasSubscription) {
    return res.status(402).json({ error: "AI features require an active subscription" });
  }

  next();
}

aiRouter.get("/wallet", async (req: AuthedRequest, res) => {
  const wallet = await getAIWallet(req.businessId!);
  res.json({
    balance: Number(wallet.balance),
    currency: "INR",
    dailyFreeTokens: Number(process.env.AI_DAILY_FREE_TOKENS || "10"),
    dailyFreeChats: Number(process.env.AI_DAILY_FREE_CHATS || "5"),
  });
});

aiRouter.use(requireAISubscription);

// OCR → Categorize expense using Vertex AI (if enabled) or Claude (fallback)
const ocrSchema = z.object({
  rawText: z.string().min(1).max(8000),
  imageUrl: z.string().optional(),
});

aiRouter.post("/categorize-expense", async (req: AuthedRequest, res) => {
  try {
    const parsed = ocrSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await withAICredit(req.businessId!, req.userId!, "categorizeExpense", async () => {
      // Use Vertex AI if enabled, otherwise fallback to Claude.
      if (process.env.VERTEX_AI_ENABLE === "true") {
        try {
          return await categorizeExpenseWithVertexAI(parsed.data.rawText);
        } catch (error) {
          console.warn("Vertex AI failed, falling back to Claude:", error);
          return categorizeReceiptText(parsed.data.rawText);
        }
      }
      return categorizeReceiptText(parsed.data.rawText);
    });

    const expense = await prisma.expense.create({
      data: {
        businessId: req.businessId!,
        category: result.category,
        amount: result.amount,
        taxAmount: result.taxAmount,
        note: result.vendor ? `From ${result.vendor}` : undefined,
        sourceImageUrl: parsed.data.imageUrl,
        aiCategoryConfidence: result.confidence,
      },
    });

    res.status(201).json({ expense, aiReasoning: result.reasoning });
  } catch (error) {
    if (error instanceof AICreditExhaustedError) return res.status(402).json({ error: error.message, balance: error.balance, required: error.required });
    console.error("Error categorizing expense:", error);
    res.status(500).json({ error: "Failed to categorize expense" });
  }
});

// Natural language query over business data
const askSchema = z.object({ question: z.string().min(1).max(4000) });

aiRouter.post("/ask", async (req: AuthedRequest, res) => {
  try {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const [invoices, expenses, payments, gstFilings] = await Promise.all([
      prisma.invoice.findMany({
        where: { businessId: req.businessId },
        take: 200,
        orderBy: { createdAt: "desc" },
      }),
      prisma.expense.findMany({
        where: { businessId: req.businessId },
        take: 200,
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({
        where: { businessId: req.businessId },
        take: 200,
        orderBy: { createdAt: "desc" },
      }),
      // GST return figures only — never the filing action itself, which
      // stays behind gspService and requires a configured GSP.
      prisma.gstFiling.findMany({
        where: { businessId: req.businessId },
        take: 24,
        orderBy: { period: "desc" },
      }),
    ]);

    const answer = await withAICredit(req.businessId!, req.userId!, "ask", () => answerBusinessQuestion(parsed.data.question, { invoices, expenses, payments, gstFilings }));

    res.json({ answer });
  } catch (error) {
    if (error instanceof AICreditExhaustedError) return res.status(402).json({ error: error.message, balance: error.balance, required: error.required });
    console.error("Error answering question:", error);
    res.status(500).json({ error: "Failed to answer question" });
  }
});

// Generate business report with insights
const reportSchema = z.object({
  reportType: z.enum(["monthly", "quarterly", "annual"]),
  startDate: z.string(),
  endDate: z.string(),
});

aiRouter.post("/generate-report", async (req: AuthedRequest, res) => {
  try {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const start = new Date(parsed.data.startDate);
    const end = new Date(parsed.data.endDate);

    // Gather data for report
    const [invoices, expenses, payments] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          businessId: req.businessId,
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.expense.findMany({
        where: {
          businessId: req.businessId,
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.payment.findMany({
        where: {
          businessId: req.businessId,
          createdAt: { gte: start, lte: end },
        },
      }),
    ]);

    const reportData = {
      period: {
        start: parsed.data.startDate,
        end: parsed.data.endDate,
        type: parsed.data.reportType,
      },
      invoices: {
        count: invoices.length,
        total: invoices.reduce((sum, inv) => sum + inv.grandTotal, 0),
        paid: invoices.filter((inv) => inv.status === "PAID").length,
      },
      expenses: {
        count: expenses.length,
        total: expenses.reduce((sum, exp) => sum + exp.amount, 0),
        byCategory: Object.entries(
          expenses.reduce(
            (acc, exp) => {
              const category = exp.category || "Uncategorized";
              acc[category] = (acc[category] || 0) + exp.amount;
              return acc;
            },
            {} as Record<string, number>
          )
        ),
      },
      payments: {
        count: payments.length,
        total: payments.reduce((sum, pay) => sum + pay.amount, 0),
      },
    };

    if (process.env.VERTEX_AI_ENABLE === "true") {
      const insights = await withAICredit(req.businessId!, req.userId!, "generateReport", () => generateReportWithVertexAI(reportData, parsed.data.reportType));
      return res.json({ report: reportData, insights });
    }

    res.json({ report: reportData, insights: "Upgrade to premium for AI insights" });
  } catch (error) {
    if (error instanceof AICreditExhaustedError) return res.status(402).json({ error: error.message, balance: error.balance, required: error.required });
    console.error("Error generating report:", error);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// Get AI insights for specific invoice
const invoiceInsightSchema = z.object({ invoiceId: z.string() });

aiRouter.post("/invoice-insights", async (req: AuthedRequest, res) => {
  try {
    const parsed = invoiceInsightSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const invoice = await prisma.invoice.findUnique({
      where: { id: parsed.data.invoiceId },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!invoice || invoice.businessId !== req.businessId) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (process.env.VERTEX_AI_ENABLE !== "true") {
      return res.status(402).json({ error: "This feature requires Vertex AI to be enabled" });
    }

    const insights = await withAICredit(req.businessId!, req.userId!, "invoiceInsights", () => getInvoiceInsightsWithVertexAI(invoice));
    res.json({ invoiceId: invoice.id, insights });
  } catch (error) {
    if (error instanceof AICreditExhaustedError) return res.status(402).json({ error: error.message, balance: error.balance, required: error.required });
    console.error("Error getting invoice insights:", error);
    res.status(500).json({ error: "Failed to get insights" });
  }
});
