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

// Serverless platforms (Vercel) can't take a checked-in key file path —
// GCP_SERVICE_ACCOUNT_KEY carries the same JSON as an env var instead,
// written out to the writable /tmp dir once per cold start.
function resolveGoogleApplicationCredentials() {
  const existingPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (existingPath && fs.existsSync(existingPath)) return;

  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
  if (!keyJson) return;

  try {
    const keyPath = path.join(os.tmpdir(), "gcp-key.json");
    fs.writeFileSync(keyPath, keyJson, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
  } catch (error) {
    console.warn("⚠️  Failed to write GCP_SERVICE_ACCOUNT_KEY to a temp file:", error instanceof Error ? error.message : error);
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

    // Check for credentials and project id before touching the SDKs.
    // Without both, the clients can't authenticate, so skip init entirely
    // instead of letting VertexAI throw on construction.
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const hasCredentials = !!credentialsPath && fs.existsSync(credentialsPath);

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
    });

    // Initialize Cloud Storage
    storage = new StorageClass({
      projectId,
    });

    // Initialize Vertex AI
    vertexAI = new VertexAIClass({
      project: projectId,
      location,
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

// Log invoice to BigQuery
export async function logInvoiceToBigQuery(invoice: InvoiceRecord): Promise<boolean> {
  try {
    if (!bigQuery) {
      console.warn("⚠️  BigQuery not initialized");
      return false;
    }

    const table = bigQuery.dataset(dataset).table("invoices");
    await table.insert([invoice]);
    console.log(`✅ Invoice ${invoice.invoiceNumber} logged to BigQuery`);
    return true;
  } catch (error) {
    console.error(`❌ Error logging invoice to BigQuery:`, error);
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
    await table.insert([payment]);
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
    await table.insert([expense]);
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
      WHERE businessId = @businessId
      ORDER BY invoiceDate DESC
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
      model: process.env.VERTEX_AI_MODEL_ID || "gemini-1.5-pro",
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
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Could not parse JSON from response");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("❌ Error with Vertex AI:", error);
    throw error;
  }
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

// ============ EXPORT FOR USE IN ROUTES ============

export { bigQuery, storage, vertexAI };
