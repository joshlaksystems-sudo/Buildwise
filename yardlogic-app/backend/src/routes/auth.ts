import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { authenticator } from "otplib";
import { prisma } from "../lib/prisma";
import { signToken, requireAuth, AuthedRequest } from "../middleware/auth";
import { sendOtp, sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail } from "../services/notifyService";

export const authRouter = Router();

function createRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueAuthToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET", expiresInMs: number) {
  const rawToken = createRawToken();
  await prisma.authToken.create({ data: { userId, type, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + expiresInMs) } });
  return rawToken;
}

// Returns every business this user belongs to, with their role in
// each — the frontend uses this to render the business switcher and
// to pick which X-Business-Id to send on subsequent requests.
async function userWithBusinesses(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      businesses: {
        include: {
          business: {
            select: {
              id: true, name: true, gstin: true, address: true, logoUrl: true, defaultTax: true,
              ownerName: true, ownerPhone: true, ownerEmail: true, stateName: true, stateCode: true,
              gstnType: true, financialYearStart: true, invoicePrefix: true, invoiceStartNumber: true,
              estimatePrefix: true, estimateStartNumber: true, challanPrefix: true, challanStartNumber: true,
              businessType: true, industryVertical: true, bankAccountNumber: true, bankName: true,
              ifscCode: true, setupComplete: true, drugLicenseNumber: true, drugLicenseExpiry: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!user) return user;
  return {
    ...user,
    businesses: user.businesses.map((membership) => ({
      ...membership,
      business: {
        ...membership.business,
        bankAccountNumber: membership.business.bankAccountNumber
          ? `****${membership.business.bankAccountNumber.slice(-4)}`
          : null,
        ifscCode: membership.business.ifscCode ? "***********" : null,
      },
    })),
  };
}

function isEmail(v: string) {
  return v.includes("@");
}

const identifierSchema = z.string().trim().refine((value) => {
  if (value.includes("@")) return z.string().email().safeParse(value).success;
  return /^\+?[0-9][0-9\s-]{7,19}$/.test(value);
}, "Enter a valid email address or mobile number");

// ---------- Password login (email or phone as identifier) ----------

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  identifier: identifierSchema,
  password: z.string().min(8).max(128),
  businessName: z.string().trim().min(2).max(120),
  applicationPreference: z.enum(["YARDLOGIC", "IBIM"]).default("YARDLOGIC"),
});

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, identifier, password, businessName, applicationPreference } = parsed.data;
  const field = isEmail(identifier) ? "email" : "phone";

  const existing = await prisma.user.findFirst({ where: { [field]: identifier } as any });
  if (existing) return res.status(409).json({ error: "Account already exists — try logging in" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      [field]: identifier,
      passwordHash,
      applicationPreference,
      businesses: { create: { role: "OWNER", business: { create: { name: businessName } } } },
    } as any,
  });

  const full = await userWithBusinesses(user.id);
  if (field === "email") {
    const verificationToken = await issueAuthToken(user.id, "EMAIL_VERIFICATION", 24 * 60 * 60 * 1000);
    void sendVerificationEmail(identifier, name, verificationToken).catch((error) => console.error("Verification email failed:", error));
  }
  res.status(201).json({ token: signToken(user.id), user: { id: user.id, name: user.name, applicationPreference: user.applicationPreference }, applicationPreference: user.applicationPreference, businesses: full!.businesses });
});

const forgotPasswordSchema = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()) });

authRouter.post("/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user?.email) {
    const token = await issueAuthToken(user.id, "PASSWORD_RESET", 60 * 60 * 1000);
    void sendPasswordResetEmail(user.email, user.name, token).catch((error) => console.error("Password reset email failed:", error));
  }
  res.json({ sent: true });
});

const tokenSchema = z.object({ token: z.string().trim().min(40).max(200) });

authRouter.post("/verify-email", async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid verification token" });
  const record = await prisma.authToken.findFirst({ where: { tokenHash: hashToken(parsed.data.token), type: "EMAIL_VERIFICATION", consumedAt: null, expiresAt: { gt: new Date() } } });
  if (!record) return res.status(400).json({ error: "Invalid or expired verification token" });
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.authToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
  ]);
  res.json({ verified: true });
});

const resetPasswordSchema = tokenSchema.extend({ password: z.string().min(8).max(128) });

authRouter.post("/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const record = await prisma.authToken.findFirst({ where: { tokenHash: hashToken(parsed.data.token), type: "PASSWORD_RESET", consumedAt: null, expiresAt: { gt: new Date() } } });
  if (!record) return res.status(400).json({ error: "Invalid or expired password reset token" });
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.authToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
  ]);
  res.json({ reset: true });
});

authRouter.post("/welcome-email", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.email) return res.status(400).json({ error: "Account has no email address" });
    await sendWelcomeEmail(user.email, user.name);
    res.json({ sent: true });
  } catch (error) {
    console.error("Welcome email failed:", error);
    res.status(502).json({ error: "Account created, but welcome email could not be sent" });
  }
});

const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1).max(128),
  totpCode: z.string().optional(), // required only if the account has 2FA enabled
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { identifier, password, totpCode } = parsed.data;
  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, { phone: identifier }] } });
  if (!user?.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && user.email && !user.emailVerifiedAt) {
    return res.status(403).json({ error: "Please verify your email before logging in", requiresEmailVerification: true });
  }

  if (user.totpEnabled) {
    if (!totpCode) return res.status(401).json({ error: "2FA code required", requiresTotp: true });
    const ok = authenticator.verify({ token: totpCode, secret: user.totpSecret! });
    if (!ok) return res.status(401).json({ error: "Invalid 2FA code" });
  }

  const full = await userWithBusinesses(user.id);
  res.json({ token: signToken(user.id), user: { id: user.id, name: user.name, applicationPreference: user.applicationPreference }, applicationPreference: user.applicationPreference, businesses: full!.businesses });
});

// ---------- Two-factor auth (Step 6 hardening) ----------

// Generates a TOTP secret and the otpauth:// URL for a QR code —
// not yet enabled until the user proves they can generate a valid
// code with it (verify-setup below).
authRouter.post("/2fa/setup", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: req.userId }, data: { totpSecret: secret } });

  const otpauthUrl = authenticator.keyuri(user?.email || user?.phone || user!.id, process.env.PRODUCT_NAME || "Buildwise", secret);
  res.json({ secret, otpauthUrl });
});

const verifySetupSchema = z.object({ totpCode: z.string() });

authRouter.post("/2fa/verify-setup", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = verifySetupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.totpSecret) return res.status(400).json({ error: "Call /2fa/setup first" });

  const ok = authenticator.verify({ token: parsed.data.totpCode, secret: user.totpSecret });
  if (!ok) return res.status(401).json({ error: "Invalid code — scan the QR again and try the next code" });

  await prisma.user.update({ where: { id: req.userId }, data: { totpEnabled: true } });
  res.json({ enabled: true });
});

authRouter.post("/2fa/disable", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.user.update({ where: { id: req.userId }, data: { totpEnabled: false, totpSecret: null } });
  res.json({ enabled: false });
});

// ---------- OTP login (email or mobile, no password) ----------

const otpRequestSchema = z.object({ identifier: identifierSchema });

authRouter.post("/otp/request", async (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { identifier } = parsed.data;

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.otp.create({
    data: { target: identifier, code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });

  await sendOtp(identifier, code);

  // In dev, echo the code back so you can test without a real
  // SMS/email provider wired up yet. Never do this in production.
  const dev = process.env.NODE_ENV !== "production";
  res.json({ sent: true, ...(dev ? { devCode: code } : {}) });
});

const otpVerifySchema = z.object({
  identifier: identifierSchema,
  code: z.string().length(6),
  // only needed the first time — creates the account + first business
  name: z.string().optional(),
  businessName: z.string().optional(),
  applicationPreference: z.enum(["YARDLOGIC", "IBIM"]).default("YARDLOGIC"),
});

authRouter.post("/otp/verify", async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { identifier, code, name, businessName, applicationPreference } = parsed.data;

  const otp = await prisma.otp.findFirst({
    where: { target: identifier, code, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return res.status(401).json({ error: "Invalid or expired code" });

  const field = isEmail(identifier) ? "email" : "phone";
  let user = await prisma.user.findFirst({ where: { [field]: identifier } as any });

  if (!user) {
    if (!name || !businessName) {
      return res.status(400).json({ error: "First-time login needs name and businessName" });
    }
    user = await prisma.user.create({
      data: {
        name,
        [field]: identifier,
        applicationPreference,
        ...(field === "email" ? { emailVerifiedAt: new Date() } : {}),
        businesses: { create: { role: "OWNER", business: { create: { name: businessName } } } },
      } as any,
    });
  }

  if (field === "email" && !user.emailVerifiedAt) {
    user = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }

  const consumed = await prisma.otp.updateMany({ where: { id: otp.id, consumed: false }, data: { consumed: true } });
  if (consumed.count !== 1) return res.status(401).json({ error: "Invalid or already-used code" });

  const full = await userWithBusinesses(user.id);
  res.json({ token: signToken(user.id), user: { id: user.id, name: user.name, applicationPreference: user.applicationPreference }, applicationPreference: user.applicationPreference, businesses: full!.businesses });
});
