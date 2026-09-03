// Google Cloud integration service
// Handles BigQuery, Cloud Storage, Vertex AI, and authentication

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Type definitions (placeholders until packages are installed)
type BigQuery = any;
type Storage = any;
type VertexAI = any;

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const location = process.env.VERTEX_AI_LOCATION || "asia-southeast1";
const dataset = process.env.BIGQUERY_DATASET || "gst_transactions";
const gcsBucket = process.env.GCS_BUCKET || "docuvault-invoices";

let bigQuery: BigQuery;
let storage: Storage;
let vertexAI: VertexAI;

function getServiceAccountCredentials(): Record<string, string> | undefined {
  const raw = process.env.GCP_SERVICE_ACCOUNT_KEY;
  if (!raw) return undefined;
  try {
    const credentials = JSON.parse(raw) as Record<string, string>;
    if (!credentials.client_email || !credentials.private_key) return undefined;
    return credentials;
  } catch {
    return undefined;
  }
}

export function googleCloudStatus() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return {
    projectConfigured: Boolean(projectId),
    credentialsConfigured: Boolean((credentialsPath && fs.existsSync(credentialsPath)) || getServiceAccountCredentials()),
    bigQueryInitialized: Boolean(bigQuery),
    storageInitialized: Boolean(storage),
    vertexAIInitialized: Boolean(vertexAI),
    vertexAIEnabled: process.env.VERTEX_AI_ENABLE === "true",
    dataset,
    location,
  };
}

export async function checkBigQueryConnection() {
  if (!bigQuery) return { ok: false, error: "BigQuery client is not initialized" };
  try {
    await bigQuery.query({ query: "SELECT 1 AS ok", location });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Serverless platforms (Vercel) can't take a checked-in key file path —
// GCP_SERVICE_ACCOUNT_KEY carries the same JSON as an env var instead,
// written out to the writable /tmp dir once per cold start.
function resolveGoogleApplicationCredentials() {
  const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (configuredPath) {
    const existingPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
    if (fs.existsSync(existingPath)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = existingPath;
      return;
    }
  }

  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
  if (!keyJson) return;

  try {
    const keyPath = path.join(os.tmpdir(), "gcp-key.json");
    const parsedKey = JSON.parse(keyJson);
    fs.writeFileSync(keyPath, JSON.stringify(parsedKey), { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
  } catch (error) {
    console.warn("⚠️  Failed to parse GCP_SERVICE_ACCOUNT_KEY:", error instanceof Error ? error.message : error);
  }
}

// Initialize Google Cloud clients
export function initializeGoogleCloud() {
  try {
    resolveGoogleApplicationCredentials();

    // Lazy load modules to avoid errors if packages not installed
    let BigQueryClass: any;
    let StorageClass: any;
    let VertexAIClass: any;

    try {
      BigQueryClass = require("@google-cloud/bigquery").BigQuery;
      StorageClass = require("@google-cloud/storage").Storage;
      VertexAIClass = require("@google-cloud/vertexai").VertexAI;
    } catch (error) {
      console.warn("⚠️  Google Cloud libraries not fully installed yet.");
      console.warn("   Run: npm install @google-cloud/bigquery @google-cloud/storage @google-cloud/vertexai");
      return;
    }

    // Prefer the JSON secret used by Vercel/GitHub Actions. A local file
    // remains supported for local development.
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credentials = getServiceAccountCredentials();
    const hasCredentials = Boolean(credentials || (credentialsPath && fs.existsSync(credentialsPath)));

    if (!projectId || !hasCredentials) {
      console.warn(
        "⚠️  Google Cloud not configured (missing GOOGLE_CLOUD_PROJECT_ID or GOOGLE_APPLICATION_CREDENTIALS). Skipping init; AI/BigQuery/Storage features are disabled."
      );
      return;
    }

    // Initialize BigQuery
    bigQuery = new BigQueryClass({
      projectId,
      location,
      ...(credentials ? { credentials } : {}),
    });

    // Initialize Cloud Storage
    storage = new StorageClass({
      projectId,
      ...(credentials ? { credentials } : {}),
    });

    // Initialize Vertex AI
    vertexAI = new VertexAIClass({
      project: projectId,
      location,
      ...(credentials ? { googleAuthOptions: { credentials } } : {}),
    });

    console.log("✅ Google Cloud services initialized");
    console.log(`   - Project: ${projectId}`);
    console.log(`   - Region: ${location}`);
    console.log(`   - BigQuery Dataset: ${dataset}`);
    console.log(`   - GCS Bucket: ${gcsBucket}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Failed to initialize Google Cloud services: ${message}`);
    console.warn("   Some features will be disabled.");
  }
}

// ============ BIGQUERY OPERATIONS ============

export interface InvoiceRecord {
  invoiceId: string;
  businessId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  taxAmount: number;
  discountAmount: number;
  status: string;
  invoiceDate: string;
  dueDate: string | null;
  amountPaid: number;
  isPaid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  paymentId: string;
  businessId: string;
  invoiceId: string | null;
  billId: string | null;
  amount: number;
  mode: string;
  direction: string;
  reconciled: boolean;
  date: string;
  createdAt: string;
}

export interface ExpenseRecord {
  expenseId: string;
  businessId: string;
  category: string;
  amount: number;
  taxAmount: number;
  note: string | null;
  aiCategoryConfidence: number;
  date: string;
  createdAt: string;
}

export interface InvoiceItemRecord {
  id: string;
  invoiceId: string;
  itemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineTotal: number;
}

// Log invoice to BigQuery
export async function logInvoiceToBigQuery(invoice: InvoiceRecord): Promise<boolean> {
  try {
    if (!bigQuery) {
      console.warn("⚠️  BigQuery not initialized");
      return false;
    }

    const table = bigQuery.dataset(dataset).table("invoices");
    await table.insert([{
      id: invoice.invoiceId,
      business_id: invoice.businessId,
      customer_id: invoice.customerId,
      customer_name: invoice.customerName,
      number: invoice.invoiceNumber,
      status: invoice.status,
      sub_total: invoice.amount - invoice.taxAmount,
      tax_total: invoice.taxAmount,
      grand_total: invoice.amount,
      amount_paid: invoice.amountPaid,
      due_date: invoice.dueDate,
      created_at: invoice.createdAt,
      updated_at: invoice.updatedAt,
    }]);
    console.log(`✅ Invoice ${invoice.invoiceNumber} logged to BigQuery`);
    return true;
  } catch (error) {
    console.error(`❌ Error logging invoice to BigQuery:`, error);
    return false;
  }
}

export async function logInvoiceItemsToBigQuery(items: InvoiceItemRecord[]): Promise<boolean> {
  if (!items.length) return true;
  try {
    if (!bigQuery) {
      console.warn("⚠️  BigQuery not initialized");
      return false;
    }
    await bigQuery.dataset(dataset).table("invoice_items").insert(items.map((item) => ({
      id: item.id,
      invoice_id: item.invoiceId,
      item_id: item.itemId,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount: item.discount,
      tax_rate: item.taxRate,
      line_total: item.lineTotal,
    })));
    return true;
  } catch (error) {
    console.error("❌ Error logging invoice items to BigQuery:", error);
    return false;
  }
}

// Log payment to BigQuery
export async function logPaymentToBigQuery(payment: PaymentRecord): Promise<boolean> {
  try {
    if (!bigQuery) {
      console.warn("⚠️  BigQuery not initialized");
      return false;
    }

    const table = bigQuery.dataset(dataset).table("payments");
    await table.insert([{
      id: payment.paymentId,
      business_id: payment.businessId,
      invoice_id: payment.invoiceId,
      amount: payment.amount,
      mode: payment.mode,
      direction: payment.direction,
      created_at: payment.createdAt,
    }]);
    console.log(`✅ Payment logged to BigQuery`);
    return true;
  } catch (error) {
    console.error(`❌ Error logging payment to BigQuery:`, error);
    return false;
  }
}

// Log expense to BigQuery
export async function logExpenseToBigQuery(expense: ExpenseRecord): Promise<boolean> {
  try {
    if (!bigQuery) {
      console.warn("⚠️  BigQuery not initialized");
      return false;
    }

    const table = bigQuery.dataset(dataset).table("expenses");
    await table.insert([{
      id: expense.expenseId,
      business_id: expense.businessId,
      category: expense.category,
      amount: expense.amount,
      tax_amount: expense.taxAmount,
      note: expense.note,
      ai_category_confidence: expense.aiCategoryConfidence,
      payment_date: expense.date,
      created_at: expense.createdAt,
    }]);
    console.log(`✅ Expense logged to BigQuery`);
    return true;
  } catch (error) {
    console.error(`❌ Error logging expense to BigQuery:`, error);
    return false;
  }
}

// Query invoices from BigQuery
export async function queryInvoicesFromBigQuery(businessId: string, limit = 100) {
  try {
    if (!bigQuery) {
      console.warn("⚠️  BigQuery not initialized");
      return [];
    }

    const query = `
      SELECT * FROM \`${projectId}.${dataset}.invoices\`
      WHERE business_id = @businessId
      ORDER BY created_at DESC
      LIMIT @limit
    `;

    const options = {
      query,
      location,
      params: { businessId, limit },
    };

    const [rows] = await bigQuery.query(options);
    return rows;
  } catch (error) {
    console.error("❌ Error querying BigQuery:", error);
    return [];
  }
}

// ============ CLOUD STORAGE OPERATIONS ============

export interface UploadOptions {
  contentType?: string;
  public?: boolean;
  metadata?: Record<string, string>;
}

// Upload invoice PDF to GCS
export async function uploadInvoiceToGCS(
  fileBuffer: Buffer,
  invoiceNumber: string,
  businessId: string,
  options: UploadOptions = {}
): Promise<string | null> {
  try {
    if (!storage) {
      console.warn("⚠️  Cloud Storage not initialized");
      return null;
    }

    const bucket = storage.bucket(gcsBucket);
    const fileName = `invoices/${businessId}/${invoiceNumber}.pdf`;

    const file = bucket.file(fileName);

    await file.save(fileBuffer, {
      metadata: {
        contentType: options.contentType || "application/pdf",
        ...options.metadata,
      },
    });

    // Return signed URL (valid for 7 days)
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    console.log(`✅ Invoice ${invoiceNumber} uploaded to GCS`);
    return url;
  } catch (error) {
    console.error(`❌ Error uploading to GCS:`, error);
    return null;
  }
}

// Upload receipt image to GCS
export async function uploadReceiptToGCS(
  fileBuffer: Buffer,
  fileName: string,
  businessId: string
): Promise<string | null> {
  try {
    if (!storage) {
      console.warn("⚠️  Cloud Storage not initialized");
      return null;
    }

    const bucket = storage.bucket(gcsBucket);
    const objectName = `receipts/${businessId}/${Date.now()}-${fileName}`;

    const file = bucket.file(objectName);

    await file.save(fileBuffer, {
      metadata: {
        contentType: "image/jpeg",
      },
    });

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days
    });

    console.log(`✅ Receipt uploaded to GCS`);
    return url;
  } catch (error) {
    console.error(`❌ Error uploading receipt:`, error);
    return null;
  }
}

export async function uploadComplianceDocumentToGCS(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  businessId: string,
  documentType: string,
  period?: string
): Promise<{ url: string; path: string } | null> {
  try {
    if (!storage) return null;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `compliance/${businessId}/${period || "unperiodized"}/${documentType}/${Date.now()}-${safeName}`;
    const file = storage.bucket(gcsBucket).file(objectPath);
    await file.save(fileBuffer, { metadata: { contentType: mimeType } });
    const [url] = await file.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return { url, path: objectPath };
  } catch (error) {
    console.error("Error uploading compliance document:", error);
    return null;
  }
}

// Get signed URL for GCS object
export async function getSignedUrlFromGCS(objectPath: string, expiresIn = 3600): Promise<string | null> {
  try {
    if (!storage) {
      console.warn("⚠️  Cloud Storage not initialized");
      return null;
    }

    const bucket = storage.bucket(gcsBucket);
    const file = bucket.file(objectPath);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresIn * 1000,
    });

    return url;
  } catch (error) {
    console.error("❌ Error generating signed URL:", error);
    return null;
  }
}

// Delete object from GCS
export async function deleteFromGCS(objectPath: string): Promise<boolean> {
  try {
    if (!storage) {
      console.warn("⚠️  Cloud Storage not initialized");
      return false;
    }

    const bucket = storage.bucket(gcsBucket);
    await bucket.file(objectPath).delete();

    console.log(`✅ File deleted from GCS: ${objectPath}`);
    return true;
  } catch (error) {
    console.error("❌ Error deleting from GCS:", error);
    return false;
  }
}

// ============ VERTEX AI OPERATIONS ============

export interface AIExpenseResult {
  category: string;
  amount: number;
  taxAmount: number;
  vendor?: string;
  confidence: number;
  reasoning: string;
}

export interface PurchaseBillExtraction {
  supplierName: string | null;
  supplierGstin: string | null;
  billNumber: string | null;
  billDate: string | null;
  items: { name: string; quantity: number; unitPrice: number; taxRate: number; lineTotal: number }[];
  subTotal: number;
  taxTotal: number;
  grandTotal: number;
  confidence: number;
  warnings: string[];
}

export interface DocumentOrganizationResult {
  documentType: "GSTR1_SOURCE" | "GSTR2B_SOURCE" | "PURCHASE_BILL" | "EXPENSE_RECEIPT" | "BANK_STATEMENT" | "OTHER";
  period: string | null;
  confidence: number;
  extractedData: Record<string, unknown>;
  warnings: string[];
}

function parseVertexJson<T>(text: string): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Vertex AI did not return structured JSON");
  return JSON.parse(jsonMatch[0]) as T;
}

// Check if subscription is active (required for Vertex AI)
export async function isSubscriptionActive(businessId: string): Promise<boolean> {
  // TODO: Implement actual subscription check against your subscription table
  // For now, return true for testing
  if (process.env.VERTEX_AI_SUBSCRIPTION_REQUIRED === "false") {
    return true;
  }
  return true;
}

// Categorize expense using Vertex AI (Gemini)
export async function categorizeExpenseWithVertexAI(receiptText: string): Promise<AIExpenseResult> {
  try {
    if (!vertexAI) {
      throw new Error("Vertex AI is not initialized. Install @google-cloud/vertexai package.");
    }

    if (process.env.VERTEX_AI_ENABLE !== "true") {
      throw new Error("Vertex AI is disabled. Set VERTEX_AI_ENABLE=true");
    }

    const model = vertexAI.getGenerativeModel({
      model: process.env.VERTEX_AI_MODEL_ID || "gemini-2.5-flash",
      systemInstruction: `You are an accounting assistant for Buildwise by JC Nexus. Given raw receipt text, extract:
- Total amount
- Tax amount (GST if present in India)
- Vendor name if visible
- Expense category from: Inventory Purchase, Rent, Utilities, Salaries, Transport, Office Supplies, Marketing, Repairs, Other

Respond ONLY with valid JSON (no markdown, no preamble):
{"category": string, "amount": number, "taxAmount": number, "vendor": string|null, "confidence": 0-1, "reasoning": string}`,
    });

    const response = await model.generateContent(receiptText);
    const content = response.response.candidates?.[0]?.content?.parts?.[0];

    if (!content || !("text" in content)) {
      throw new Error("Invalid response from Vertex AI");
    }

    const text = content.text as string;
    return parseVertexJson<AIExpenseResult>(text);
  } catch (error) {
    console.error("❌ Error with Vertex AI:", error);
    throw error;
  }
}

// Extracts a purchase bill for human review. This endpoint intentionally
// returns data only; inventory and payable balances change only after the
// user confirms the reviewed bill through the normal purchase-bill route.
export async function extractPurchaseBillWithVertexAI(receiptText: string): Promise<PurchaseBillExtraction> {
  if (!vertexAI) throw new Error("Vertex AI is not initialized");
  if (process.env.VERTEX_AI_ENABLE !== "true") throw new Error("Vertex AI is disabled. Set VERTEX_AI_ENABLE=true");

  const model = vertexAI.getGenerativeModel({
    model: process.env.VERTEX_AI_MODEL_ID || "gemini-2.5-flash",
    systemInstruction: `You extract purchase bills for an Indian accounting application. Read the OCR text and return ONLY valid JSON. Never invent missing values: use null and add a warning. Amounts are numbers in INR. Return exactly:
{"supplierName":string|null,"supplierGstin":string|null,"billNumber":string|null,"billDate":"YYYY-MM-DD"|null,"items":[{"name":string,"quantity":number,"unitPrice":number,"taxRate":number,"lineTotal":number}],"subTotal":number,"taxTotal":number,"grandTotal":number,"confidence":number,"warnings":string[]}
Use confidence from 0 to 1. If totals conflict with item calculations, keep the printed totals and add a warning.`
  });
  const response = await model.generateContent(receiptText);
  const content = response.response.candidates?.[0]?.content?.parts?.[0];
  if (!content || !("text" in content)) throw new Error("Invalid response from Vertex AI");
  const result = parseVertexJson<PurchaseBillExtraction>(content.text as string);
  if (!Array.isArray(result.items) || !Array.isArray(result.warnings) || !Number.isFinite(result.grandTotal)) {
    throw new Error("Vertex AI returned an invalid purchase bill shape");
  }
  return result;
}

// Classifies an uploaded document and extracts searchable metadata. The
// original file is still stored unchanged; AI only chooses its folder and
// produces a reviewable index, never an accounting transaction.
export async function organizeDocumentWithVertexAI(buffer: Buffer, mimeType: string, fileName: string): Promise<DocumentOrganizationResult> {
  if (!vertexAI) throw new Error("Vertex AI is not initialized");
  if (process.env.VERTEX_AI_ENABLE !== "true") throw new Error("Vertex AI is disabled. Set VERTEX_AI_ENABLE=true");

  const model = vertexAI.getGenerativeModel({
    model: process.env.VERTEX_AI_MODEL_ID || "gemini-2.5-flash",
    systemInstruction: `You classify business documents for an Indian small business. Choose exactly one documentType: GSTR1_SOURCE, GSTR2B_SOURCE, PURCHASE_BILL, EXPENSE_RECEIPT, BANK_STATEMENT, OTHER. Extract only visible facts. Never invent values. Return ONLY JSON in this exact shape:
{"documentType":"PURCHASE_BILL","period":"YYYY-MM"|null,"confidence":0.0,"extractedData":{},"warnings":[]}
extractedData may include supplierName, supplierGstin, billNumber, invoiceNumber, total, taxTotal, bankName, accountLast4, transactionCount, or documentDate. Use warnings for unreadable or conflicting fields.`
  });
  const response = await model.generateContent([
    { text: `Classify this file. Original filename: ${fileName}` },
    { inlineData: { data: buffer.toString("base64"), mimeType } },
  ]);
  const content = response.response.candidates?.[0]?.content?.parts?.[0];
  if (!content || !("text" in content)) throw new Error("Invalid response from Vertex AI");
  const result = parseVertexJson<DocumentOrganizationResult>(content.text as string);
  const allowed = ["GSTR1_SOURCE", "GSTR2B_SOURCE", "PURCHASE_BILL", "EXPENSE_RECEIPT", "BANK_STATEMENT", "OTHER"];
  if (!allowed.includes(result.documentType) || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1 || !Array.isArray(result.warnings) || !result.extractedData) {
    throw new Error("Vertex AI returned invalid document metadata");
  }
  return result;
}

// Generate report summary using Vertex AI
export async function generateReportWithVertexAI(
  reportData: Record<string, unknown>,
  reportType: string
): Promise<string> {
  try {
    if (!vertexAI) {
      throw new Error("Vertex AI is not initialized");
    }

    const model = vertexAI.getGenerativeModel({
      model: process.env.VERTEX_AI_MODEL_ID || "gemini-1.5-pro",
    });

    const prompt = `Generate a professional business report for Buildwise by JC Nexus.
Report Type: ${reportType}
Data: ${JSON.stringify(reportData, null, 2)}

Provide insights, trends, and recommendations.`;

    const response = await model.generateContent(prompt);
    const content = response.response.candidates?.[0]?.content?.parts?.[0];

    if (!content || !("text" in content)) {
      throw new Error("Invalid response from Vertex AI");
    }

    return content.text as string;
  } catch (error) {
    console.error("❌ Error generating report:", error);
    throw error;
  }
}

// Get invoice insights using Vertex AI
export async function getInvoiceInsightsWithVertexAI(invoiceData: Record<string, unknown>): Promise<string> {
  try {
    if (!vertexAI) {
      throw new Error("Vertex AI is not initialized");
    }

    const model = vertexAI.getGenerativeModel({
      model: process.env.VERTEX_AI_MODEL_ID || "gemini-1.5-pro",
    });

    const prompt = `Analyze this invoice from Buildwise and provide business insights:
${JSON.stringify(invoiceData, null, 2)}

Consider: payment delays, customer patterns, potential issues.`;

    const response = await model.generateContent(prompt);
    const content = response.response.candidates?.[0]?.content?.parts?.[0];

    if (!content || !("text" in content)) {
      throw new Error("Invalid response from Vertex AI");
    }

    return content.text as string;
  } catch (error) {
    console.error("❌ Error getting invoice insights:", error);
    throw error;
  }
}

export async function answerBusinessQuestionWithVertexAI(question: string, data: Record<string, unknown>): Promise<string> {
  if (!vertexAI) throw new Error("Vertex AI is not initialized");
  if (process.env.VERTEX_AI_ENABLE !== "true") throw new Error("Vertex AI is disabled. Set VERTEX_AI_ENABLE=true");

  const model = vertexAI.getGenerativeModel({
    model: process.env.VERTEX_AI_MODEL_ID || "gemini-1.5-pro",
    systemInstruction: "You are a careful business assistant for an Indian shop. Answer only from the supplied JSON. Never invent figures, never claim a GST return was filed, and say when data is missing. Keep the answer concise and use Rs. for money.",
  });
  const response = await model.generateContent(`Question: ${question}\n\nBusiness data:\n${JSON.stringify(data).slice(0, 16000)}`);
  const content = response.response.candidates?.[0]?.content?.parts?.[0];
  if (!content || !("text" in content)) throw new Error("Invalid response from Vertex AI");
  return content.text as string;
}

// ============ EXPORT FOR USE IN ROUTES ============

export { bigQuery, storage, vertexAI };
