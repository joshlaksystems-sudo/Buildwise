// GST filing, e-invoice IRN generation, and e-way bill generation
// all require submitting data to the government's GSTN network,
// which by law goes through a licensed GSP (GST Suvidha Provider)
// or the NIC's own API — not something any app can do by itself
// without that contract. Common GSPs: ClearTax, Zoho Books GSP,
// Vayana, Cygnet. Each has its own signup, API keys, and pricing.
//
// This file is the ONE place that talks to a GSP. Everything else
// in the app (GstFiling, ItcReconciliation, EwayBill tables/routes)
// works today without a GSP — it computes real numbers from your
// real invoices. Only the actual "submit to government" step is
// gated behind GSP_API_KEY being configured.

interface GspConfig {
  apiKey?: string;
  baseUrl?: string;
}

function getConfig(): GspConfig {
  return {
    apiKey: process.env.GSP_API_KEY,
    baseUrl: process.env.GSP_BASE_URL,
  };
}

export function isGspConfigured() {
  return Boolean(getConfig().apiKey);
}

export class GspNotConfiguredError extends Error {
  constructor() {
    super(
      "No GSP is configured. Filing GSTR-1/3B, generating an e-invoice IRN, " +
      "or generating an e-way bill requires signing up with a licensed GSP " +
      "(e.g. ClearTax, Zoho, Vayana, Cygnet) and setting GSP_API_KEY / GSP_BASE_URL. " +
      "This app has prepared the correct data — it just cannot submit it without a GSP contract."
    );
  }
}

export async function fileGstReturn(_payload: { returnType: string; period: string; data: unknown }): Promise<{ gspReference: string }> {
  if (!isGspConfigured()) throw new GspNotConfiguredError();
  // TODO once a GSP is chosen: POST _payload to their filing endpoint
  // using getConfig().baseUrl + getConfig().apiKey, per that GSP's
  // documented API contract, and return their acknowledgement number.
  throw new Error("GSP client not implemented for the configured provider yet.");
}

export async function generateEInvoiceIrn(_invoiceId: string): Promise<{ irn: string; qrCode: string }> {
  if (!isGspConfigured()) throw new GspNotConfiguredError();
  throw new Error("GSP client not implemented for the configured provider yet.");
}

export async function generateEwayBill(_invoiceId: string, _vehicleNumber: string): Promise<{ ewbNumber: string; validUntil: Date }> {
  if (!isGspConfigured()) throw new GspNotConfiguredError();
  throw new Error("GSP client not implemented for the configured provider yet.");
}
