import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { maskUser } from "../security/masking.js";
import { signToken } from "../middleware/auth.js";

export const authRouter = Router();
const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
authRouter.use(authRateLimit);

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  organizationName: z.string().trim().min(2).max(140),
});

const loginSchema = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()), password: z.string().min(1).max(128) });

function organizationSlug(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${normalized || "organization"}-${crypto.randomUUID().slice(0, 8)}`;
}

authRouter.post("/register", async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, email, password, organizationName } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    const organization = await tx.organization.create({ data: { name: organizationName, slug: organizationSlug(organizationName), members: { create: { userId: user.id, role: "ADMIN" } } } });
    return { user, organization };
  });
  res.status(201).json({ token: signToken(result.user.id, result.organization.id, "ADMIN"), user: maskUser(result.user, "ADMIN"), organization: result.organization });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, include: { memberships: { include: { organization: true }, orderBy: { createdAt: "asc" } } } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: "Invalid credentials" });
  const membership = user.memberships[0];
  if (!membership) return res.status(403).json({ error: "No organization access is assigned to this account" });
  res.json({ token: signToken(user.id, membership.organizationId, membership.role), user: maskUser(user, membership.role), organization: membership.organization, role: membership.role });
});
