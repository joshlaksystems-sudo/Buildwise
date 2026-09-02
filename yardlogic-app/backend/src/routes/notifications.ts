import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

// GET /notifications - Get unread notifications for user
notificationsRouter.get("/", async (req: AuthedRequest, res) => {
  try {
    const { limit = 20, offset = 0, type } = req.query;

    const where: any = {
      businessId: req.businessId,
      isRead: false,
    };

    if (type && type !== "all") {
      where.type = type;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      notifications,
      total,
      unreadCount: total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /notifications/all - Get all notifications (read + unread)
notificationsRouter.get("/all", async (req: AuthedRequest, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const notifications = await prisma.notification.findMany({
      where: { businessId: req.businessId },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const unreadCount = await prisma.notification.count({
      where: { businessId: req.businessId, isRead: false },
    });

    res.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching all notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /notifications/:id/read - Mark notification as read
notificationsRouter.patch("/:id/read", async (req: AuthedRequest, res) => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    });

    if (!notification || notification.businessId !== req.businessId) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true, readAt: new Date() },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /notifications/read-all - Mark all notifications as read
notificationsRouter.patch("/bulk/read-all", async (req: AuthedRequest, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { businessId: req.businessId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ updated: result.count });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /notifications/:id - Delete notification
notificationsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    });

    if (!notification || notification.businessId !== req.businessId) {
      return res.status(404).json({ error: "Notification not found" });
    }

    await prisma.notification.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /notifications/preferences - Get notification preferences
notificationsRouter.get("/preferences/get", async (req: AuthedRequest, res) => {
  try {
    const preferences = await prisma.notificationPreference.findUnique({
      where: {
        businessId_userId: {
          businessId: req.businessId!,
          userId: req.userId!,
        },
      },
    });

    if (!preferences) {
      // Create default preferences
      const created = await prisma.notificationPreference.create({
        data: {
          businessId: req.businessId!,
          userId: req.userId!,
          lowStockAlert: true,
          overdueAlert: true,
          paymentAlert: true,
          dailyDigest: false,
        },
      });
      return res.json(created);
    }

    res.json(preferences);
  } catch (error) {
    console.error("Error fetching preferences:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /notifications/preferences - Update notification preferences
const preferencesSchema = z.object({
  lowStockAlert: z.boolean().optional(),
  overdueAlert: z.boolean().optional(),
  paymentAlert: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
});

notificationsRouter.patch("/preferences/update", async (req: AuthedRequest, res) => {
  try {
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const preferences = await prisma.notificationPreference.upsert({
      where: {
        businessId_userId: {
          businessId: req.businessId!,
          userId: req.userId!,
        },
      },
      update: parsed.data,
      create: {
        businessId: req.businessId!,
        userId: req.userId!,
        ...parsed.data,
      },
    });

    await writeAudit({
      businessId: req.businessId!,
      userId: req.userId,
      action: "notification.preferences_updated",
      entityType: "NotificationPreference",
      entityId: preferences.id,
      detail: parsed.data,
    });

    res.json(preferences);
  } catch (error) {
    console.error("Error updating preferences:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Internal helper: Create notification (not exposed to API)
export async function createNotification(
  businessId: string,
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string
) {
  try {
    return await prisma.notification.create({
      data: {
        businessId,
        type,
        title,
        message,
        entityType,
        entityId,
      },
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

// Trigger: Check low stock and create notifications
export async function checkLowStockAndNotify(businessId: string) {
  try {
    const lowStockItems = await prisma.item.findMany({
      where: {
        businessId,
        currentStock: {
          lt: prisma.item.fields.lowStockAlert,
        },
      },
    });

    for (const item of lowStockItems) {
      // Check if we already have an unread notification for this item
      const existing = await prisma.notification.findFirst({
        where: {
          businessId,
          type: "LOW_STOCK",
          entityType: "Item",
          entityId: item.id,
          isRead: false,
        },
      });

      if (!existing) {
        await createNotification(
          businessId,
          "LOW_STOCK",
          `Low Stock: ${item.name}`,
          `${item.name} is running low (${item.currentStock} units, alert threshold: ${item.lowStockAlert})`,
          "Item",
          item.id
        );
      }
    }

    return lowStockItems.length;
  } catch (error) {
    console.error("Error checking low stock:", error);
    return 0;
  }
}

// Trigger: Check overdue invoices and create notifications.
// Invoices have no explicit dueDate, so "overdue" means unpaid/partial and
// older than the standard payment term window.
const OVERDUE_INVOICE_DAYS = 30;

export async function checkOverdueInvoicesAndNotify(businessId: string) {
  try {
    const cutoff = new Date(Date.now() - OVERDUE_INVOICE_DAYS * 24 * 60 * 60 * 1000);
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ["UNPAID", "PARTIAL"] },
        createdAt: { lte: cutoff },
      },
    });

    for (const invoice of overdueInvoices) {
      const existing = await prisma.notification.findFirst({
        where: {
          businessId,
          type: "OVERDUE_INVOICE",
          entityType: "Invoice",
          entityId: invoice.id,
          isRead: false,
        },
      });

      if (!existing) {
        const daysOverdue = Math.floor((Date.now() - invoice.createdAt.getTime()) / (1000 * 60 * 60 * 24)) - OVERDUE_INVOICE_DAYS;
        await createNotification(
          businessId,
          "OVERDUE_INVOICE",
          `Overdue Invoice: ${invoice.number}`,
          `Invoice ${invoice.number} is ${daysOverdue} day(s) overdue (Balance: ₹${invoice.grandTotal - invoice.amountPaid})`,
          "Invoice",
          invoice.id
        );
      }
    }

    return overdueInvoices.length;
  } catch (error) {
    console.error("Error checking overdue invoices:", error);
    return 0;
  }
}

// Trigger: Check payment due notifications
export async function checkPaymentDueAndNotify(businessId: string) {
  try {
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const dueBills = await prisma.purchaseBill.findMany({
      where: {
        businessId,
        dueDate: { gte: now, lte: inSevenDays },
        status: { notIn: ["PAID", "CANCELLED"] },
      },
    });

    for (const bill of dueBills) {
      const existing = await prisma.notification.findFirst({
        where: {
          businessId,
          type: "PAYMENT_DUE",
          entityId: bill.id,
          isRead: false,
        },
      });

      if (!existing) {
        const daysUntilDue = Math.floor((bill.dueDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        await createNotification(
          businessId,
          "PAYMENT_DUE",
          `Payment Due: Bill ${bill.number}`,
          `Bill ${bill.number} is due in ${daysUntilDue} days (Amount: ₹${bill.grandTotal})`,
          "Bill",
          bill.id
        );
      }
    }

    return dueBills.length;
  } catch (error) {
    console.error("Error checking payment due:", error);
    return 0;
  }
}

// Runs all three checks for every business. Call periodically (see
// startNotificationScheduler) so alerts actually get created — the
// check* functions above are otherwise never invoked.
export async function runNotificationChecksForAllBusinesses() {
  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const { id: businessId } of businesses) {
    await checkLowStockAndNotify(businessId);
    await checkOverdueInvoicesAndNotify(businessId);
    await checkPaymentDueAndNotify(businessId);
  }
  return businesses.length;
}

// Starts a background interval that regenerates notifications for all
// businesses. Runs once shortly after boot, then on a fixed interval.
export function startNotificationScheduler(intervalMs = 15 * 60 * 1000) {
  setTimeout(() => {
    runNotificationChecksForAllBusinesses().catch((error) =>
      console.error("Error running notification checks:", error)
    );
  }, 10_000);

  setInterval(() => {
    runNotificationChecksForAllBusinesses().catch((error) =>
      console.error("Error running notification checks:", error)
    );
  }, intervalMs);
}

