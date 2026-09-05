import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import {
  categorizeExpenseWithVertexAI,
  isSubscriptionActive,
  generateReportWithVertexAI,
  getInvoiceInsightsWithVertexAI,
  extractPurchaseBillWithVertexAI,
  answerBusinessQuestionWithVertexAI,
  scanDocumentForMalware,
  validateDocumentUpload,
} from "../services/googleCloud";
import { AICreditExhaustedError, getAIWallet, withAICredit } from "../services/aiWallet";

export const aiRouter = Router();
aiRouter.use(requireAuth);
const aiDocumentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
  rawText: z.string().max(8000).optional().default(""),
  imageUrl: z.string().optional(),
});

const aiExpenseResultSchema = z.object({
  category: z.string().trim().min(1).max(80),
  amount: z.number().positive(),
  taxAmount: z.number().min(0),
  vendor: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(1000),
});

aiRouter.post("/categorize-expense", aiDocumentUpload.single("file"), async (req: AuthedRequest, res) => {
  try {
    const parsed = ocrSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (!parsed.data.rawText.trim() && !req.file) return res.status(400).json({ error: "Paste receipt text or upload a PDF/image" });
    if (process.env.VERTEX_AI_ENABLE !== "true") return res.status(503).json({ error: "AI categorization is disabled. Set VERTEX_AI_ENABLE=true in the backend environment." });

    let document: { buffer: Buffer; mimeType: string } | undefined;
    if (req.file) {
      validateDocumentUpload(req.file.buffer, req.file.mimetype, req.file.originalname);
      await scanDocumentForMalware(req.file.buffer, req.file.originalname);
      document = { buffer: req.file.buffer, mimeType: req.file.mimetype };
    }

    const result = await withAICredit(req.businessId!, req.userId!, "categorizeExpense", async () => {
      return categorizeExpenseWithVertexAI(parsed.data.rawText, document);
    });
    const validatedResult = aiExpenseResultSchema.safeParse(result);
    if (!validatedResult.success) {
      return res.status(422).json({ error: "AI could not reliably read this receipt. Please enter the expense manually.", details: validatedResult.error.flatten() });
    }

    res.json({ preview: validatedResult.data, aiReasoning: validatedResult.data.reasoning, sourceFileName: req.file?.originalname ?? null });
  } catch (error) {
    if (error instanceof AICreditExhaustedError) return res.status(402).json({ error: error.message, balance: error.balance, required: error.required });
    console.error("Error categorizing expense:", error);
    const message = error instanceof Error ? error.message : String(error);
    if (/not initialized|disabled|not configured|credentials|API key|404|NOT_FOUND|model.*not found/i.test(message)) {
      return res.status(503).json({ error: "AI categorization is not configured on the backend.", details: message });
    }
    res.status(502).json({ error: "AI provider could not categorize this expense. Enter it manually and try again.", details: message });
  }
});

const confirmExpenseSchema = z.object({
  clientRequestId: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  amount: z.number().positive(),
  taxAmount: z.number().min(0),
  note: z.string().optional(),
  sourceImageUrl: z.string().optional(),
  aiCategoryConfidence: z.number().min(0).max(1).optional(),
});

aiRouter.post("/categorize-expense/confirm", async (req: AuthedRequest, res) => {
  const parsed = confirmExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const scopedClientRequestId = `${req.businessId}:${parsed.data.clientRequestId}`.slice(0, 120);
  const existing = await prisma.expense.findFirst({
    where: {
      businessId: req.businessId,
      clientRequestId: { in: [parsed.data.clientRequestId, scopedClientRequestId] },
    },
  });
  if (existing) return res.json(existing);
  try {
    const expense = await prisma.expense.create({ data: { ...parsed.data, clientRequestId: scopedClientRequestId, businessId: req.businessId! } });
    res.status(201).json(expense);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existingExpense = await prisma.expense.findFirst({ where: { businessId: req.businessId, clientRequestId: scopedClientRequestId } });
      if (existingExpense) return res.json(existingExpense);
    }
    console.error("Error confirming categorized expense:", error);
    res.status(500).json({ error: "Unable to save categorized expense" });
  }
});

const purchaseBillExtractionSchema = z.object({ rawText: z.string().min(1).max(12000) });

// OCR/Vertex preview only. The reviewed result must be submitted to
// POST /purchase-bills before it changes stock or supplier balances.
aiRouter.post("/extract-purchase-bill", aiDocumentUpload.single("file"), async (req: AuthedRequest, res) => {
  try {
    const parsed = purchaseBillExtractionSchema.partial().safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (!parsed.data.rawText?.trim() && !req.file) return res.status(400).json({ error: "Paste bill text or upload a PDF/image" });
    if (process.env.VERTEX_AI_ENABLE !== "true") return res.status(402).json({ error: "This feature requires Vertex AI to be enabled" });
    let document: { buffer: Buffer; mimeType: string } | undefined;
    if (req.file) {
      validateDocumentUpload(req.file.buffer, req.file.mimetype, req.file.originalname);
      await scanDocumentForMalware(req.file.buffer, req.file.originalname);
      document = { buffer: req.file.buffer, mimeType: req.file.mimetype };
    }
    const extraction = await withAICredit(req.businessId!, req.userId!, "extractPurchaseBill", () => extractPurchaseBillWithVertexAI(parsed.data.rawText || "", document));
    res.json({ extraction, requiresReview: true });
  } catch (error) {
    if (error instanceof AICreditExhaustedError) return res.status(402).json({ error: error.message, balance: error.balance, required: error.required });
    console.error("Error extracting purchase bill:", error);
    res.status(500).json({ error: "Failed to extract purchase bill" });
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

    if (process.env.VERTEX_AI_ENABLE !== "true") return res.status(503).json({ error: "Vertex AI is not enabled" });
    const answer = await withAICredit(req.businessId!, req.userId!, "ask", () =>
      answerBusinessQuestionWithVertexAI(parsed.data.question, { invoices, expenses, payments, gstFilings })
    );

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

    if (process.env.VERTEX_AI_ENABLE !== "true") return res.status(503).json({ error: "Vertex AI is not enabled" });
    const insights = await withAICredit(req.businessId!, req.userId!, "generateReport", () => generateReportWithVertexAI(reportData, parsed.data.reportType));
    res.json({ report: reportData, insights });
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
