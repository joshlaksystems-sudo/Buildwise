import test from "node:test";
import assert from "node:assert/strict";
import { resolveNotificationProvider, formatOtpMessage } from "./notifyService";

test("resolves a phone-based identifier to the SMS provider", () => {
  assert.equal(resolveNotificationProvider("+91 98765 43210"), "sms");
});

test("formats a short OTP reminder message for both SMS and email", () => {
  const sms = formatOtpMessage("+91 98765 43210", "123456");
  const email = formatOtpMessage("user@example.com", "123456");

  assert.match(sms, /123456/);
  assert.match(email, /123456/);
  assert.match(sms, /OTP/i);
  assert.match(email, /OTP/i);
});
