import PDFDocument from "pdfkit";
import type { Response } from "express";

// Colors match frontend/src/styles/tokens.css so the PDF and the
// web UI feel like the same product, not a generic invoice template.
const INK = "#16233f";
const INK_SOFT = "#4a5570";
const GOLD = "#c98a1f";
const RULE = "#d8d6cc";

interface InvoiceForPdf {
  number: string;
  createdAt: Date;
  type: string;
  status: string;
  subTotal: number;
  taxTotal: number;
  discount: number;
  grandTotal: number;
  amountPaid: number;
  dueDate?: Date | null;
  followUpDate?: Date | null;
  notes?: string | null;
  terms?: string | null;
  business: { name: string; gstin?: string | null; address?: string | null; ownerName?: string | null; ownerPhone?: string | null; stateName?: string | null };
  customer?: { name: string; phone?: string | null; gstin?: string | null } | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  items: { name: string; quantity: number; unitPrice: number; taxRate: number; hsnCode?: string | null; cgstAmount?: number; sgstAmount?: number; igstAmount?: number; lineTotal: number }[];
}

export function generateInvoicePdf(invoice: InvoiceForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const money = (value: number) => `Rs. ${value.toFixed(2)}`;
    const date = (value: Date) => value.toLocaleDateString("en-IN");
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const customerName = invoice.customer?.name || invoice.customerName || "Walk-in customer";
    const customerPhone = invoice.customer?.phone || invoice.customerPhone;
    const balance = Math.max(0, invoice.grandTotal - invoice.amountPaid);

    doc.roundedRect(left, 38, width, 92, 6).fill(INK);
    doc.fillColor("#ffffff").fontSize(21).font("Helvetica-Bold").text(invoice.business.name, left + 18, 54, { width: width - 180 });
    doc.font("Helvetica").fontSize(9).fillColor("#e8edf7");
    doc.text([invoice.business.address, invoice.business.gstin ? `GSTIN: ${invoice.business.gstin}` : null, [invoice.business.ownerName, invoice.business.ownerPhone, invoice.business.stateName].filter(Boolean).join(" | ")].filter(Boolean).join("\n"), left + 18, 83, { width: width - 190, lineGap: 2 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(GOLD).text("TAX INVOICE", right - 145, 57, { width: 127, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#ffffff").text(invoice.type, right - 145, 78, { width: 127, align: "right" });

    doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text(`Invoice ${invoice.number}`, left, 153);
    doc.font("Helvetica").fontSize(9).fillColor(INK_SOFT).text(`Issued ${date(invoice.createdAt)}   |   Status: ${invoice.status}`, left, 177);
    if (invoice.dueDate) doc.text(`Due date: ${date(invoice.dueDate)}`, left, 191);

    const boxY = invoice.dueDate ? 218 : 204;
    doc.roundedRect(left, boxY, width, 76, 4).lineWidth(1).strokeColor(RULE).stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GOLD).text("BILLED TO", left + 14, boxY + 13);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(customerName, left + 14, boxY + 29);
    doc.font("Helvetica").fontSize(9).fillColor(INK_SOFT).text([customerPhone, invoice.customerEmail, invoice.customer?.gstin ? `GSTIN: ${invoice.customer.gstin}` : null].filter(Boolean).join("  |  "), left + 14, boxY + 48, { width: width - 28 });

    const tableY = boxY + 101;
    const columns = { item: left + 12, qty: right - 242, price: right - 180, gst: right - 106, total: right - 12 };
    doc.rect(left, tableY, width, 28).fill(INK);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
    doc.text("ITEM / HSN", columns.item, tableY + 9);
    doc.text("QTY", columns.qty, tableY + 9, { width: 38, align: "right" });
    doc.text("RATE", columns.price, tableY + 9, { width: 58, align: "right" });
    doc.text("GST", columns.gst, tableY + 9, { width: 42, align: "right" });
    doc.text("AMOUNT", columns.total - 64, tableY + 9, { width: 64, align: "right" });

    let rowY = tableY + 28;
    invoice.items.forEach((item, index) => {
      const rowHeight = Math.max(28, doc.heightOfString(item.name, { width: columns.qty - columns.item - 28 }) + 16);
      if (index % 2 === 0) doc.rect(left, rowY, width, rowHeight).fill("#f7f6f1");
      doc.font("Helvetica").fontSize(9).fillColor(INK);
      doc.text([item.name, item.hsnCode ? `HSN: ${item.hsnCode}` : null].filter(Boolean).join("\n"), columns.item, rowY + 9, { width: columns.qty - columns.item - 28 });
      doc.text(String(item.quantity), columns.qty, rowY + 9, { width: 38, align: "right" });
      doc.text(money(item.unitPrice), columns.price, rowY + 9, { width: 58, align: "right" });
      doc.text(`${item.taxRate}%`, columns.gst, rowY + 9, { width: 42, align: "right" });
      doc.text(money(item.lineTotal), columns.total - 64, rowY + 9, { width: 64, align: "right" });
      rowY += rowHeight;
    });
    doc.strokeColor(RULE).moveTo(left, rowY).lineTo(right, rowY).stroke();

    const totalsY = rowY + 18;
    const totalRow = (label: string, value: string, y: number, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 13 : 9).fillColor(bold ? INK : INK_SOFT);
      doc.text(label, right - 185, y, { width: 88 });
      doc.text(value, right - 92, y, { width: 92, align: "right" });
    };
    totalRow("Taxable subtotal", money(invoice.subTotal), totalsY);
    if (invoice.discount) totalRow("Discount", `- ${money(invoice.discount)}`, totalsY + 17);
    totalRow("CGST", money(invoice.items.reduce((sum, item) => sum + (item.cgstAmount || 0), 0)), totalsY + (invoice.discount ? 34 : 17));
    totalRow("SGST", money(invoice.items.reduce((sum, item) => sum + (item.sgstAmount || 0), 0)), totalsY + (invoice.discount ? 51 : 34));
    totalRow("IGST", money(invoice.items.reduce((sum, item) => sum + (item.igstAmount || 0), 0)), totalsY + (invoice.discount ? 68 : 51));
    const grandY = totalsY + (invoice.discount ? 95 : 78);
    doc.roundedRect(right - 220, grandY - 7, 220, 35, 4).fill("#fff5df");
    totalRow("TOTAL", money(invoice.grandTotal), grandY + 5, true);
    totalRow("Paid", money(invoice.amountPaid), grandY + 48);
    totalRow(balance > 0 ? "Balance due" : "Balance", money(balance), grandY + 65, true);
    if (invoice.followUpDate && balance > 0) totalRow("Follow-up", date(invoice.followUpDate), grandY + 84);

    const noteY = grandY + (invoice.followUpDate && balance > 0 ? 120 : 100);
    if (invoice.notes || invoice.terms) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text("Notes", left, noteY);
      doc.font("Helvetica").fontSize(8).fillColor(INK_SOFT).text([invoice.notes, invoice.terms ? `Terms: ${invoice.terms}` : null].filter(Boolean).join("\n"), left, noteY + 15, { width: width - 250, lineGap: 3 });
    }
    doc.strokeColor(RULE).moveTo(left, doc.page.height - 66).lineTo(right, doc.page.height - 66).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(INK_SOFT).text(`Thank you for doing business with ${invoice.business.name}.`, left, doc.page.height - 52);
    doc.text(`Generated by ${process.env.PRODUCT_NAME || "Buildwise"}`, right - 180, doc.page.height - 52, { width: 180, align: "right" });

    doc.end();
  });
}

export async function streamInvoicePdf(invoice: InvoiceForPdf, res: Response) {
  const pdf = await generateInvoicePdf(invoice);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.number}.pdf"`);
  res.send(pdf);
}
