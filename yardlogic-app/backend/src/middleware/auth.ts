import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production"
  ? (() => { throw new Error("JWT_SECRET must be configured in production"); })()
  : "dev-secret-change-me");

export interface AuthedRequest extends Request {
  userId?: string;
  businessId?: string;
  role?: string;
}

export function validateApplicationScope(requestedApplication: string | undefined, membershipApplication: string | undefined) {
  if (!requestedApplication || !membershipApplication) return false;
  if (requestedApplication !== "IBIM" && requestedApplication !== "YARDLOGIC") return false;
  if (membershipApplication !== "IBIM" && membershipApplication !== "YARDLOGIC") return false;
  return requestedApplication === membershipApplication;
}

export function validateConfiguredApplicationScope(
  configuredApplication: string | undefined,
  requestedApplication: string | undefined,
  membershipApplication: string | undefined,
) {
  if (configuredApplication === "ALL") {
    return validateApplicationScope(requestedApplication, membershipApplication);
  }
  if (configuredApplication === "IBIM" || configuredApplication === "YARDLOGIC") {
    return membershipApplication === configuredApplication
      && (!requestedApplication || requestedApplication === configuredApplication);
  }
  return true;
}

export async function requireIdentity(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing bearer token" });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Every protected route expects a bearer token AND an
// X-Business-Id header, since one login can belong to many
// businesses (multi-shop owners) or many logins to one business
// (staff with role-based access).
//
// CRITICAL: the header alone proves nothing — it's just a string
// the client sends. This middleware looks up the UserBusiness
// join row and rejects the request if this user isn't actually a
// member of that business. Without this check, any logged-in user
// could read/write another business's data just by changing a
// header — every route downstream relies on req.businessId being
// trustworthy, so this is the one place tenant isolation is
// actually enforced.
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  let userId: string;
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { userId: string };
    userId = payload.userId;
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const businessId = req.header("X-Business-Id");
  if (!businessId) {
    return res.status(400).json({ error: "Missing X-Business-Id header" });
  }

  const membership = await prisma.userBusiness.findUnique({
    where: { userId_businessId: { userId, businessId } },
    include: { business: { select: { applicationId: true } } },
  });
  if (!membership) {
    return res.status(403).json({ error: "You do not have access to this business" });
  }

  const requestedApplication = req.header("X-Application-Id");
  if (!validateConfiguredApplicationScope(process.env.APPLICATION_ID, requestedApplication, membership.business.applicationId)) {
    if (process.env.APPLICATION_ID === "ALL" && !requestedApplication) {
      return res.status(400).json({ error: "Missing or invalid X-Application-Id header" });
    }
    return res.status(403).json({ error: "This business belongs to a different application" });
  }

  req.userId = userId;
  req.businessId = businessId;
  req.role = membership.role;
  next();
}

export function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

// A separate, narrow-purpose token for sharing a single invoice PDF
// with someone who has no account at all (the customer receiving a
// WhatsApp link). It only ever proves "this token was issued for
// invoice X" — it carries no user identity and grants no access to
// anything else, unlike the main session JWT above.
export function signInvoiceAccessToken(invoiceId: string) {
  return jwt.sign({ invoiceId, scope: "invoice-pdf" }, JWT_SECRET, { expiresIn: "30d" });
}

export function signIbimProposalAccessToken(proposalId: string) {
  return jwt.sign({ proposalId, scope: "ibim-proposal" }, JWT_SECRET, { expiresIn: "14d" });
}

export function verifyIbimProposalAccessToken(token: string): { proposalId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { proposalId: string; scope: string };
    if (payload.scope !== "ibim-proposal") return null;
    return { proposalId: payload.proposalId };
  } catch {
    return null;
  }
}

export function verifyInvoiceAccessToken(token: string): { invoiceId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { invoiceId: string; scope: string };
    if (payload.scope !== "invoice-pdf") return null;
    return { invoiceId: payload.invoiceId };
  } catch {
    return null;
  }
}

// Coarse role gate — refine per-route as needed (e.g. only
// OWNER/ADMIN can void an invoice).
export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export const PERMISSIONS = [
  "MEMBERS_VIEW", "MEMBERS_EDIT", "PROSPECTS_MANAGE", "PROPOSALS_MANAGE", "POLICIES_BIND",
  "ACTIONS_MANAGE", "FINANCE_VIEW", "FINANCE_EDIT", "REBATES_MANAGE", "BUDGET_MANAGE", "REPORTS_VIEW",
  "BORDEREAUX_CLOSE", "REPORTS_EXPORT", "STAFF_MANAGE",
] as const;

const rolePermissions: Record<string, readonly string[]> = {
  STAFF: ["MEMBERS_VIEW", "MEMBERS_EDIT", "PROSPECTS_MANAGE", "PROPOSALS_MANAGE", "ACTIONS_MANAGE", "FINANCE_VIEW", "REPORTS_VIEW"],
  SALESMAN: ["MEMBERS_VIEW", "MEMBERS_EDIT", "PROSPECTS_MANAGE", "PROPOSALS_MANAGE", "ACTIONS_MANAGE"],
  ACCOUNTANT: ["MEMBERS_VIEW", "FINANCE_VIEW", "FINANCE_EDIT", "REBATES_MANAGE", "BUDGET_MANAGE", "REPORTS_VIEW", "REPORTS_EXPORT"],
};

export function requirePermission(permission: typeof PERMISSIONS[number]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.userId || !req.businessId) return res.status(401).json({ error: "Unauthorized" });
    if (await hasPermission(req, permission)) {
      next();
      return;
    }
    return res.status(403).json({ error: `Missing permission: ${permission}` });
  };
}

export async function hasPermission(req: AuthedRequest, permission: typeof PERMISSIONS[number]) {
  if (!req.userId || !req.businessId) return false;
  const membership = await prisma.userBusiness.findUnique({ where: { userId_businessId: { userId: req.userId, businessId: req.businessId } }, include: { permissions: true } });
  if (!membership) return false;
  return membership.role === "OWNER" || membership.role === "ADMIN" || membership.permissions.some((item) => item.permission === permission) || rolePermissions[membership.role]?.includes(permission) === true;
}
