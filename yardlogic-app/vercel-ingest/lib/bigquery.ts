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
  "delivery_challan_items", "expenses", "payments", "salesman_logs",
];
