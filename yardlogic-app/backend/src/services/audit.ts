import { prisma } from "../lib/prisma";

interface AuditParams {
  businessId: string;
  userId?: string;
  action: string;       // "invoice.create", "item.adjust_stock", "invoice.void"...
  entityType: string;   // "Invoice", "Item"...
  entityId?: string;
  detail?: Record<string, unknown>;
}

// Fire-and-forget by design — an audit write should never block or
// fail the actual business operation it's logging. Call it after
// the real mutation succeeds, not inside its transaction.
export async function writeAudit(params: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        businessId: params.businessId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        detail: params.detail as any,
      },
    });
  } catch (err) {
    console.error("Audit log write failed (non-fatal):", err);
  }
}
