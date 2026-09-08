import { strict as assert } from "node:assert";
import { maskEmail, maskLicenseKey, maskPhone, maskUser } from "./masking.js";

assert.equal(maskEmail("sriram@example.com", "ADMIN"), "sriram@example.com");
assert.equal(maskEmail("sriram@example.com", "STAFF_DETAILER"), "s*****m@example.com");
assert.equal(maskEmail("sriram@example.com", "CLIENT"), "s*****@******.com");
assert.equal(maskPhone("+61406860078", "STAFF_DETAILER"), "+6140****0078");
assert.equal(maskLicenseKey("IBIM-98A4-B2C1-33EF", "STAFF_DETAILER"), "IBIM-98A4-****-****");
assert.match(maskLicenseKey("IBIM-98A4-B2C1-33EF", "CLIENT") || "", /^[A-F0-9]{16}$/);
assert.deepEqual(maskUser({ id: "u1", name: "Sriram", email: "sriram@example.com", phone: "+61406860078" }, "CLIENT"), {
  id: "u1",
  name: "Sriram",
  email: "s*****@******.com",
  phone: "+61********",
});
