// Accepting UPI/card payments ON invoices (not just recording that
// cash/UPI was received, which the app already does) requires a
// payment gateway contract — Razorpay, Cashfree, PayU. Same honesty
// pattern as gspService.ts: one seam, clearly gated, no fake success.

function getConfig() {
  return { keyId: process.env.PAYMENT_GATEWAY_KEY_ID, keySecret: process.env.PAYMENT_GATEWAY_KEY_SECRET };
}

export function isPaymentGatewayConfigured() {
  return Boolean(getConfig().keyId);
}

export class PaymentGatewayNotConfiguredError extends Error {
  constructor() {
    super(
      "No payment gateway is configured. Accepting a live UPI/card payment on an invoice " +
      "requires a gateway account (Razorpay, Cashfree, PayU) and PAYMENT_GATEWAY_KEY_ID / " +
      "PAYMENT_GATEWAY_KEY_SECRET. Recording that a payment was received via cash/UPI/bank " +
      "transfer already works without this — this seam is only for accepting the payment " +
      "through the app itself."
    );
  }
}

export async function createPaymentLink(_invoiceId: string, _amount: number): Promise<{ paymentUrl: string }> {
  if (!isPaymentGatewayConfigured()) throw new PaymentGatewayNotConfiguredError();
  // TODO once a gateway is chosen: create a payment link/order via
  // their SDK and return the URL to share with the customer.
  throw new Error("Payment gateway client not implemented for the configured provider yet.");
}
