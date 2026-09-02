export type NotificationProvider = "sms" | "email" | "whatsapp";

export function resolveNotificationProvider(identifier: string): NotificationProvider {
  const normalized = identifier.trim();
  if (normalized.includes("@")) return "email";
  if (/^\+?[0-9\s-]{8,}$/.test(normalized)) return "sms";
  return "sms";
}

export function formatOtpMessage(identifier: string, code: string) {
  const provider = resolveNotificationProvider(identifier);
  const base = `Your YardLogic OTP is ${code}. Valid for 5 minutes.`;
  if (provider === "email") {
    return `Hello,\n\n${base}\n\nIf you did not request this, please ignore this email.`;
  }
  return `${base} Do not share this code with anyone.`;
}

async function sendSmsOtp(phone: string, code: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (sid && token && from) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: formatOtpMessage(phone, code),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twilio SMS send failed: ${response.status} ${text}`);
    }
    return;
  }

  const msg91Auth = process.env.MSG91_AUTH_KEY;
  const msg91Sender = process.env.MSG91_SENDER_ID;
  const msg91TemplateId = process.env.MSG91_TEMPLATE_ID;
  if (msg91Auth && msg91Sender && msg91TemplateId) {
    const url = "https://control.msg91.com/api/v5/otp";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authkey: msg91Auth,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        mobile: phone,
        template_id: msg91TemplateId,
        sender: msg91Sender,
        otp: code,
        message: formatOtpMessage(phone, code),
        country: "91",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MSG91 send failed: ${response.status} ${text}`);
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("No SMS provider configured. Set Twilio variables or MSG91_AUTH_KEY/MSG91_SENDER_ID/MSG91_TEMPLATE_ID.");
  }

  console.log(`[dev] Would SMS OTP ${code} to ${phone}`);
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getGmailAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Gmail OAuth token request failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail OAuth response did not contain an access token");
  return data.access_token;
}

async function sendEmailOtp(email: string, code: string) {
  await sendGmailEmail(email, "Your YardLogic OTP", formatOtpMessage(email, code));
}

async function sendGmailEmail(email: string, subject: string, message: string) {
  const from = process.env.GMAIL_FROM_EMAIL;
  const accessToken = await getGmailAccessToken();

  if (accessToken && from) {
    const body = [
      `From: ${from}`,
      `To: ${email}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      message,
    ].join("\r\n");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encodeBase64Url(body) }),
    });
    if (!response.ok) throw new Error(`Gmail send failed: ${response.status} ${await response.text()}`);
    return true;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Gmail is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_FROM_EMAIL.");
  }

  console.log(`[dev] Would email ${subject} to ${email}`);
  return false;
}

export async function sendWelcomeEmail(email: string, name: string) {
  return sendGmailEmail(
    email,
    "Welcome to YardLogic",
    `Hello ${name},\n\nYour YardLogic account has been created successfully. You can now log in with your email address and password.\n\nRegards,\nYardLogic`
  );
}

export async function sendOtp(identifier: string, code: string) {
  const provider = resolveNotificationProvider(identifier);

  if (provider === "email") {
    await sendEmailOtp(identifier, code);
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("The pilot uses Gmail only. Request OTP with an email address; SMS is disabled until an SMS provider is configured.");
  }

  await sendSmsOtp(identifier, code);
}
