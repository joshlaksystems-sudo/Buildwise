import assert from "node:assert/strict";
import test from "node:test";
import { memberSchema, normalizeImportedMember, parseCsvRows, proposalDataSchema } from "./ibimValidation";

test("parses quoted CSV member rows", () => {
  const rows = parseCsvRows('legalName,email,address\n"North, Trade Ltd",member@example.com,"12 Main Street, Preston"');
  assert.deepEqual(rows[0], { legalName: "North, Trade Ltd", email: "member@example.com", address: "12 Main Street, Preston" });
});

test("normalizes imported member aliases and flags invalid records", () => {
  const valid = normalizeImportedMember({ legal_name: "North Trade Ltd", phone: "+441234567890" });
  assert.equal(valid.success, true);
  const invalid = memberSchema.safeParse({ legalName: "x", email: "not-an-email" });
  assert.equal(invalid.success, false);
});

test("rejects incomplete proposal data", () => {
  const result = proposalDataSchema.safeParse({ businessDescription: "", tradeAssociation: "A", annualTurnover: -1, employeeCount: 2, requestedCover: "" });
  assert.equal(result.success, false);
});
