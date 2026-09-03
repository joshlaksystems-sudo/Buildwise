import { Router, Request, Response, NextFunction } from "express";
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

    res.json(business);
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

export default router;
