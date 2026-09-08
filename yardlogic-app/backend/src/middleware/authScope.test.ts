import test from "node:test";
import assert from "node:assert/strict";
import { validateApplicationScope } from "./auth";

test("accepts matching app scope for a tenant", () => {
  assert.equal(validateApplicationScope("IBIM", "IBIM"), true);
  assert.equal(validateApplicationScope("YARDLOGIC", "YARDLOGIC"), true);
});

test("rejects mismatched app scope between tenants", () => {
  assert.equal(validateApplicationScope("IBIM", "YARDLOGIC"), false);
  assert.equal(validateApplicationScope("YARDLOGIC", "IBIM"), false);
});

test("rejects missing or invalid app scope values", () => {
  assert.equal(validateApplicationScope(undefined, "IBIM"), false);
  assert.equal(validateApplicationScope("OTHER", "IBIM"), false);
  assert.equal(validateApplicationScope("", "IBIM"), false);
});
