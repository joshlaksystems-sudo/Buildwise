import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// Middleware: verify user is owner/admin of the business
async function requireBusinessOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  const businessId = req.params.id;
  const userId = req.userId;

  if (!businessId || !userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const membership = await prisma.userBusiness.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });

  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return res.status(403).json({ error: "Only owner/admin can update business profile" });
  }

  next();
}

// GET /business/:id - Fetch business profile
router.get("/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verify user has access to this business (already checked by requireAuth middleware)
    if (id !== req.businessId) {
      // Allow fetching any business the user has access to
      const membership = await prisma.userBusiness.findUnique({
        where: {
          userId_businessId: { userId: userId!, businessId: id },
        },
      });

      if (!membership) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const business = await prisma.business.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        gstin: true,
        address: true,
        logoUrl: true,
        defaultTax: true,
        ownerName: true,
        ownerPhone: true,
        ownerEmail: true,
        stateName: true,
        stateCode: true,
        gstnType: true,
        financialYearStart: true,
        invoicePrefix: true,
        invoiceStartNumber: true,
        estimatePrefix: true,
        estimateStartNumber: true,
        challanPrefix: true,
        challanStartNumber: true,
        businessType: true,
        industryVertical: true,
        bankAccountNumber: true,
        bankName: true,
        ifscCode: true,
        setupComplete: true,
        createdAt: true,
      },
    });

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    res.json({
      ...business,
      bankAccountNumber: business.bankAccountNumber ? `****${business.bankAccountNumber.slice(-4)}` : null,
      ifscCode: business.ifscCode ? "***********" : null,
    });
  } catch (error) {
    console.error("Error fetching business:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /business/:id - Update business profile
router.patch(
  "/:id",
  requireBusinessOwner,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const {
        name,
        gstin,
        address,
        logoUrl,
        defaultTax,
        ownerName,
        ownerPhone,
        ownerEmail,
        stateName,
        stateCode,
        gstnType,
        financialYearStart,
        invoicePrefix,
        invoiceStartNumber,
        estimatePrefix,
        estimateStartNumber,
        challanPrefix,
        challanStartNumber,
        businessType,
        industryVertical,
        bankAccountNumber,
        bankName,
        ifscCode,
      } = req.body;

      // GSTIN is required only for GST-registered businesses. Retail,
      // service, and other non-GST businesses can complete setup without it.
      const requiredFields = [
        name,
        ownerName,
        address,
        stateName,
        stateCode,
      ];
      const gstReady = !gstin || (typeof gstin === "string" && gstin.trim().length === 15);
      const setupComplete = requiredFields.every((field) => field && typeof field === 'string' && field.trim()) && gstReady;

      const updatedBusiness = await prisma.business.update({
        where: { id },
        data: {
          name: name || undefined,
          gstin: gstin || undefined,
          address: address || undefined,
          logoUrl: logoUrl || undefined,
          defaultTax: defaultTax !== undefined ? defaultTax : undefined,
          ownerName: ownerName || undefined,
          ownerPhone: ownerPhone || undefined,
          ownerEmail: ownerEmail || undefined,
          stateName: stateName || undefined,
          stateCode: stateCode || undefined,
          gstnType: gstnType || undefined,
          financialYearStart: financialYearStart || undefined,
          invoicePrefix: invoicePrefix || undefined,
          invoiceStartNumber: invoiceStartNumber || undefined,
          estimatePrefix: estimatePrefix || undefined,
          estimateStartNumber: estimateStartNumber || undefined,
          challanPrefix: challanPrefix || undefined,
          challanStartNumber: challanStartNumber || undefined,
          businessType: businessType || undefined,
          industryVertical: industryVertical || undefined,
          bankAccountNumber: bankAccountNumber || undefined,
          bankName: bankName || undefined,
          ifscCode: ifscCode || undefined,
          setupComplete,
        },
      });

      res.json(updatedBusiness);
    } catch (error) {
      console.error("Error updating business:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /business/:id/setup-status - Check setup completion status
router.get("/:id/setup-status", async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verify user has access
    const membership = await prisma.userBusiness.findUnique({
      where: {
        userId_businessId: { userId: userId!, businessId: id },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const business = await prisma.business.findUnique({
      where: { id },
      select: {
        setupComplete: true,
        name: true,
        ownerName: true,
        address: true,
        stateName: true,
        gstin: true,
      },
    });

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Return which fields are missing
    const missing: string[] = [];
    if (!business.name) missing.push("name");
    if (!business.ownerName) missing.push("ownerName");
    if (!business.address) missing.push("address");
    if (!business.stateName) missing.push("stateName");
    if (!business.gstin) missing.push("gstin");

    res.json({
      setupComplete: business.setupComplete,
      missingFields: missing,
      completionPercentage: Math.round(((5 - missing.length) / 5) * 100),
    });
  } catch (error) {
    console.error("Error fetching setup status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------- RBAC Staff Management ----------

// GET /business/:id/staff - List all staff members
router.get("/:id/staff", async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verify user has access to this business
    const membership = await prisma.userBusiness.findUnique({
      where: {
        userId_businessId: { userId: userId!, businessId: id },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const staff = await prisma.userBusiness.findMany({
      where: { businessId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    res.json({
      staff: staff.map((s) => ({
        id: s.userId,
        name: s.user.name,
        email: s.user.email,
        phone: s.user.phone,
        role: s.role,
      })),
    });
  } catch (error) {
    console.error("Error fetching staff:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /business/:id/staff/:userId - Update staff role
router.patch("/:id/staff/:userId", requireBusinessOwner, async (req: AuthedRequest, res: Response) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    // Validate role
    const validRoles = ["OWNER", "ADMIN", "STAFF", "SALESMAN", "ACCOUNTANT"];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
      });
    }

    // Cannot demote owner if they're the only owner
    if (role !== "OWNER") {
      const currentMembership = await prisma.userBusiness.findUnique({
        where: {
          userId_businessId: { userId, businessId: id },
        },
      });

      if (currentMembership?.role === "OWNER") {
        const ownerCount = await prisma.userBusiness.count({
          where: { businessId: id, role: "OWNER" },
        });
        if (ownerCount === 1) {
          return res.status(400).json({
            error: "Cannot remove the last owner. Promote someone else to owner first.",
          });
        }
      }
    }

    const updated = await prisma.userBusiness.update({
      where: {
        userId_businessId: { userId, businessId: id },
      },
      data: { role },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    res.json({
      id: updated.user.id,
      name: updated.user.name,
      email: updated.user.email,
      phone: updated.user.phone,
      role: updated.role,
    });
  } catch (error) {
    if ((error as any).code === "P2025") {
      return res.status(404).json({ error: "Staff member not found" });
    }
    console.error("Error updating staff role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /business/:id/staff/:userId - Remove staff member
router.delete("/:id/staff/:userId", requireBusinessOwner, async (req: AuthedRequest, res: Response) => {
  try {
    const { id, userId } = req.params;

    // Cannot remove owner if they're the only owner
    const membership = await prisma.userBusiness.findUnique({
      where: {
        userId_businessId: { userId, businessId: id },
      },
    });

    if (!membership) {
      return res.status(404).json({ error: "Staff member not found" });
    }

    if (membership.role === "OWNER") {
      const ownerCount = await prisma.userBusiness.count({
        where: { businessId: id, role: "OWNER" },
      });
      if (ownerCount === 1) {
        return res.status(400).json({
          error: "Cannot remove the last owner. Promote someone else to owner first.",
        });
      }
    }

    await prisma.userBusiness.delete({
      where: {
        userId_businessId: { userId, businessId: id },
      },
    });

    res.json({ removed: true });
  } catch (error) {
    if ((error as any).code === "P2025") {
      return res.status(404).json({ error: "Staff member not found" });
    }
    console.error("Error removing staff:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /business/:id/staff/invite - Invite new staff by email/phone (creates user + membership)
const inviteStaffSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+?[0-9][0-9\s-]{7,19}$/).optional(),
  name: z.string().min(2).max(80),
  role: z.enum(["ADMIN", "STAFF", "SALESMAN", "ACCOUNTANT"]),
}).refine((data) => data.email || data.phone, {
  message: "Either email or phone must be provided",
});

router.post("/:id/staff/invite", requireBusinessOwner, async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = inviteStaffSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { email, phone, name, role } = parsed.data;

    // Check if user already exists
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });

    // If user exists, check if already in this business
    if (user) {
      const existing = await prisma.userBusiness.findUnique({
        where: {
          userId_businessId: { userId: user.id, businessId: id },
        },
      });

      if (existing) {
        return res.status(409).json({
          error: "This staff member is already part of this business",
        });
      }

      // Add existing user to business
      const membership = await prisma.userBusiness.create({
        data: {
          userId: user.id,
          businessId: id,
          role,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      });

      return res.status(201).json({
        id: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        phone: membership.user.phone,
        role: membership.role,
        existingUser: true,
      });
    }

    // Create new user
    user = await prisma.user.create({
      data: {
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        businesses: {
          create: {
            businessId: id,
            role,
          },
        },
      },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email || null,
      phone: user.phone || null,
      role: role,
      existingUser: false,
      message: "New user created. They can set a password by signing up with their email/phone.",
    });
  } catch (error) {
    console.error("Error inviting staff:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
