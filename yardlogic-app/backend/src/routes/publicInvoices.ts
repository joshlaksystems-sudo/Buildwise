import { Router } from "express";
import { prisma } from "../lib/prisma";
import { verifyInvoiceAccessToken } from "../middleware/auth";
import { streamInvoicePdf } from "../services/pdfService";

// Deliberately NOT behind requireAuth — this is what a customer
// with no Khatabook+ account opens from a WhatsApp message. Access
// is scoped by the signed token alone, not by session or business
// membership, and the token only ever unlocks the one invoice it
// was issued for.
export const publicInvoicesRouter = Router();

publicInvoicesRouter.get("/:id/pdf", async (req, res) => {
  const token = req.query.token as string | undefined;
  if (!token) return res.status(401).json({ error: "Missing access token" });

  const verified = verifyInvoiceAccessToken(token);
  if (!verified || verified.invoiceId !== req.params.id) {
    return res.status(401).json({ error: "Invalid or expired link" });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { customer: true, items: true, business: true },
  });
  if (!invoice) return res.status(404).json({ error: "Not found" });

  streamInvoicePdf(invoice, res);
});
