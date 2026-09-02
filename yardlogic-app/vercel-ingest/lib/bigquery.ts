import { BigQuery } from "@google-cloud/bigquery";

// Vercel env vars can't hold multi-line PEM keys cleanly, so the
// private key is stored with literal "\n" and unescaped here.
const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

export const bigquery = new BigQuery({
  projectId: process.env.BIGQUERY_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: privateKey,
  },
});

export const DATASET = process.env.BIGQUERY_DATASET || "khatabook";

// Every table this pipeline is allowed to write to, and the enum
// columns that must be validated before insert — mirrors
// bigquery/schema.sql exactly. Keep this list in sync if you add
// a table there.
export const TABLE_ENUMS: Record<string, Record<string, string[]>> = {
  user_business: { role: ["OWNER", "ADMIN", "STAFF", "SALESMAN", "ACCOUNTANT"] },
  stock_movements: { reason: ["SALE", "PURCHASE", "ADJUSTMENT", "RETURN", "CHALLAN", "OPENING"] },
  invoices: {
    type: ["GST", "NON_GST", "POS"],
    status: ["DRAFT", "UNPAID", "PARTIAL", "PAID", "CANCELLED"],
    payment_mode: ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"],
  },
  estimates: { status: ["OPEN", "CONVERTED", "EXPIRED"] },
  purchase_bills: {
    status: ["DRAFT", "RECEIVED", "PARTIAL", "PAID", "CANCELLED"],
    payment_mode: ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"],
  },
  delivery_challans: { status: ["PENDING", "DELIVERED", "CANCELLED"] },
  payments: {
    mode: ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"],
    direction: ["IN", "OUT"],
  },
};

export const ALLOWED_TABLES = [
  "businesses", "users", "user_business", "customers", "suppliers",
  "items", "stock_movements", "invoices", "invoice_items",
  "estimates", "estimate_items", "delivery_challans",
  "purchase_bills", "purchase_bill_items",
  "delivery_challan_items", "expenses", "payments", "salesman_logs",
];

const CAMEL_TO_SNAKE: Record<string, string> = {
  businessId: "business_id", customerId: "customer_id", supplierId: "supplier_id",
  invoiceId: "invoice_id", billId: "bill_id", itemId: "item_id", userId: "user_id",
  createdAt: "created_at", updatedAt: "updated_at", dueDate: "due_date", followUpDate: "follow_up_date",
  customerName: "customer_name", customerPhone: "customer_phone", customerEmail: "customer_email",
  amountPaid: "amount_paid", subTotal: "sub_total", taxTotal: "tax_total", lineTotal: "line_total",
  taxAmount: "tax_amount", paymentMode: "payment_mode", sourceImageUrl: "source_image_url",
  aiCategoryConfidence: "ai_category_confidence", aiDocumentType: "ai_document_type",
  extractedData: "extracted_data", storageUrl: "storage_url", storagePath: "storage_path",
  documentType: "document_type", uploadedByUserId: "uploaded_by_user_id", matchedPaymentId: "matched_payment_id",
};

const TIMESTAMP_COLUMNS = new Set([
  "created_at", "updated_at", "due_date", "follow_up_date", "payment_date", "date",
  "expiry_date", "mfg_date", "filed_at", "scheduled_for", "sent_at",
]);

function normalizeTimestamp(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return value;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function normalizeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const normalizedKey = CAMEL_TO_SNAKE[key] || key.trim().toLowerCase();
    return [normalizedKey, TIMESTAMP_COLUMNS.has(normalizedKey) ? normalizeTimestamp(value) : value];
  })));
}
