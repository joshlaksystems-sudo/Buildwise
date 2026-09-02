import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authenticator } from "otplib";
import { prisma } from "../lib/prisma";
import { signToken, requireAuth, AuthedRequest } from "../middleware/auth";
import { sendOtp, sendWelcomeEmail } from "../services/notifyService";

export const authRouter = Router();

// Returns every business this user belongs to, with their role in
// each — the frontend uses this to render the business switcher and
// to pick which X-Business-Id to send on subsequent requests.
async function userWithBusinesses(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { businesses: { include: { business: true } } },
  });
}

function isEmail(v: string) {
  return v.includes("@");
}

// ---------- Password login (email or phone as identifier) ----------

const signupSchema = z.object({
  name: z.string().min(1),
  identifier: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(1),
});

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, identifier, password, businessName } = parsed.data;
  const field = isEmail(identifier) ? "email" : "phone";

  const existing = await prisma.user.findFirst({ where: { [field]: identifier } as any });
  if (existing) return res.status(409).json({ error: "Account already exists — try logging in" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      [field]: identifier,
      passwordHash,
      businesses: { create: { role: "OWNER", business: { create: { name: businessName } } } },
    } as any,
  });

  const full = await userWithBusinesses(user.id);
  await sendWelcomeEmail(identifier, name);
  res.status(201).json({ token: signToken(user.id), user: { id: user.id, name: user.name }, businesses: full!.businesses });
});

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string(),
  totpCode: z.string().optional(), // required only if the account has 2FA enabled
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { identifier, password, totpCode } = parsed.data;
  const field = isEmail(identifier) ? "email" : "phone";

  const user = await prisma.user.findFirst({ where: { [field]: identifier } as any });
  if (!user?.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  if (user.totpEnabled) {
    if (!totpCode) return res.status(401).json({ error: "2FA code required", requiresTotp: true });
    const ok = authenticator.verify({ token: totpCode, secret: user.totpSecret! });
    if (!ok) return res.status(401).json({ error: "Invalid 2FA code" });
  }

  const full = await userWithBusinesses(user.id);
  res.json({ token: signToken(user.id), user: { id: user.id, name: user.name }, businesses: full!.businesses });
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

const otpRequestSchema = z.object({ identifier: z.string().email() });

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
  identifier: z.string().email(),
  code: z.string().length(6),
  // only needed the first time — creates the account + first business
  name: z.string().optional(),
  businessName: z.string().optional(),
});

authRouter.post("/otp/verify", async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { identifier, code, name, businessName } = parsed.data;

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
        businesses: { create: { role: "OWNER", business: { create: { name: businessName } } } },
      } as any,
    });
  }

  await prisma.otp.update({ where: { id: otp.id }, data: { consumed: true } });

  const full = await userWithBusinesses(user.id);
  res.json({ token: signToken(user.id), user: { id: user.id, name: user.name }, businesses: full!.businesses });
});
