import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export type OrganizationRole = "ADMIN" | "STAFF_DETAILER" | "CLIENT" | "ENGINEER_TRAINEE";
export type AuthenticatedRequest = Request & { userId?: string; organizationId?: string; role?: OrganizationRole };

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be configured in production");
  return secret || "ibim-development-only-secret";
}

export function signToken(userId: string, organizationId: string, role: OrganizationRole) {
  return jwt.sign({ userId, organizationId, role }, jwtSecret(), { expiresIn: "30m", issuer: "ibim-api", audience: "ibim-portal" });
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing bearer token" });
  try {
    const payload = jwt.verify(header.slice(7), jwtSecret(), { issuer: "ibim-api", audience: "ibim-portal" }) as { userId: string; organizationId: string; role: OrganizationRole };
    const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: payload.organizationId, userId: payload.userId } } });
    if (!membership || membership.role !== payload.role) return res.status(403).json({ error: "Organization access is no longer valid" });
    req.userId = payload.userId;
    req.organizationId = payload.organizationId;
    req.role = membership.role;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: OrganizationRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}
