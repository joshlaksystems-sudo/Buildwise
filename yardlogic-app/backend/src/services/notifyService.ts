// Plug a real provider in here — e.g. Twilio/MSG91 for SMS,
// Resend/SendGrid for email. Kept as one function so every OTP
// send goes through a single seam, regardless of channel.

export async function sendOtp(identifier: string, code: string) {
  const isEmail = identifier.includes("@");

  if (isEmail) {
    // TODO: wire a real email provider (e.g. Resend, SendGrid)
    console.log(`[dev] Would email OTP ${code} to ${identifier}`);
  } else {
    // TODO: wire a real SMS provider (e.g. Twilio, MSG91 — MSG91
    // is the common choice for Indian phone numbers)
    console.log(`[dev] Would SMS OTP ${code} to ${identifier}`);
  }
}
