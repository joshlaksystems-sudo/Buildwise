import test from "node:test";
import assert from "node:assert/strict";
import { signInvoiceAccessToken, verifyInvoiceAccessToken } from "./auth";

test("invoice access tokens verify only for the issued invoice", () => {
  const token = signInvoiceAccessToken("invoice-123");

  assert.deepEqual(verifyInvoiceAccessToken(token), { invoiceId: "invoice-123" });
  assert.equal(verifyInvoiceAccessToken("not-a-token"), null);
});