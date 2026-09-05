import assert from "node:assert/strict";
import test from "node:test";
import { parseVertexJson, validateDocumentUpload } from "./googleCloud";

test("accepts a complete PDF and sanitizes its filename", () => {
  const result = validateDocumentUpload(Buffer.from("%PDF-1.7\n1 0 obj\nendobj\n%%EOF"), "application/pdf", "invoice/ March 2026.pdf");
  assert.equal(result.safeFileName, "invoice__March_2026.pdf");
});

test("rejects a MIME-spoofed PDF", () => {
  assert.throws(() => validateDocumentUpload(Buffer.from("not a pdf"), "application/pdf", "invoice.pdf"), /does not match/);
});

test("rejects incomplete PDFs and active content", () => {
  assert.throws(() => validateDocumentUpload(Buffer.from("%PDF-1.7\ntruncated"), "application/pdf", "invoice.pdf"), /incomplete/);
  assert.throws(() => validateDocumentUpload(Buffer.from("%PDF-1.7\n\/JavaScript true\n%%EOF"), "application/pdf", "invoice.pdf"), /active or embedded/);
});

test("rejects empty and oversized files", () => {
  assert.throws(() => validateDocumentUpload(Buffer.alloc(0), "application/pdf", "empty.pdf"), /empty/);
  assert.throws(() => validateDocumentUpload(Buffer.alloc(10 * 1024 * 1024 + 1), "image/png", "large.png"), /10 MB/);
});

test("parses fenced JSON with nested data and trailing commentary", () => {
  const result = parseVertexJson<{ extractedData: { vendor: string }; reasoning: string }>(
    '```json\n{"extractedData":{"vendor":"ACME {India}"},"reasoning":"done"}\n```\nAdditional notes.'
  );
  assert.equal(result.extractedData.vendor, "ACME {India}");
  assert.equal(result.reasoning, "done");
});

test("parses a multi-expense Vertex response", () => {
  const result = parseVertexJson<{ expenses: Array<{ amount: number }> }>(
    '{"expenses":[{"amount":4500},{"amount":12000}]}'
  );
  assert.deepEqual(result.expenses.map((expense) => expense.amount), [4500, 12000]);
});
