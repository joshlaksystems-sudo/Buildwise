import { strict as assert } from "node:assert";
import { containsForbiddenField, normalizeRows } from "./bigquery";

assert.equal(containsForbiddenField({ id: "u1", password_hash: "hash" }), true);
assert.equal(containsForbiddenField({ id: "u1", refreshToken: "token" }), true);
assert.deepEqual(normalizeRows([{ id: "u1", password_hash: "hash", name: "User" }]), [{ id: "u1", name: "User" }]);