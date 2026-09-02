import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Line { name: string; quantity: number; unitPrice: number; taxRate: number; discount: number }

export function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18, discount: 0 }]);
  const [creating, setCreating] = useState(false);

  function refresh() {
    api("/invoices").then(setInvoices).catch(() => {});
  }
  useEffect(refresh, []);

  const subTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice - l.discount, 0);
  const tax = lines.reduce((s, l) => s + (l.quantity * l.unitPrice - l.discount) * (l.taxRate / 100), 0);

  async function submit() {
    setCreating(true);
    try {
      await api("/invoices", { method: "POST", body: JSON.stringify({ lines, amountPaid: subTotal + tax, paymentMode: "CASH" }) });
      setLines([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18, discount: 0 }]);
      refresh();
    } finally {
      setCreating(false);
    }
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // A plain <a href> can't carry the Authorization/X-Business-Id
  // headers the PDF route requires, so we fetch it as a blob and
  // open that instead.
  async function downloadPdf(id: string, number: string) {
    const token = localStorage.getItem("token");
    const businessId = localStorage.getItem("businessId");
    const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/invoices/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}`, "X-Business-Id": businessId || "" },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function shareOnWhatsApp(id: string) {
    const { link } = await api<{ link: string }>(`/invoices/${id}/whatsapp-link`);
    window.open(link, "_blank");
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Invoices</h1>

      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>New bill</h2>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Item name" value={l.name} onChange={(e) => updateLine(i, { name: e.target.value })} />
            <input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
            <input type="number" placeholder="Price" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} />
            <input type="number" placeholder="GST %" value={l.taxRate} onChange={(e) => updateLine(i, { taxRate: Number(e.target.value) })} />
            <input type="number" placeholder="Discount" value={l.discount} onChange={(e) => updateLine(i, { discount: Number(e.target.value) })} />
          </div>
        ))}
        <button className="secondary" onClick={() => setLines([...lines, { name: "", quantity: 1, unitPrice: 0, taxRate: 18, discount: 0 }])}>
          + Add line
        </button>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="numeral" style={{ fontSize: 18 }}>
            Total: ₹{(subTotal + tax).toFixed(2)} <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>(incl. ₹{tax.toFixed(2)} GST)</span>
          </div>
          <button className="gold" onClick={submit} disabled={creating || !lines[0].name}>
            {creating ? "Creating…" : "Create & mark paid"}
          </button>
        </div>
      </section>

      <table>
        <thead>
          <tr><th>Number</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th><th></th></tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.number}</td>
              <td>{inv.customer?.name ?? "Walk-in"}</td>
              <td className="numeral">₹{inv.grandTotal.toLocaleString("en-IN")}</td>
              <td>{inv.status}</td>
              <td>{new Date(inv.createdAt).toLocaleDateString("en-IN")}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="secondary" onClick={() => downloadPdf(inv.id, inv.number)}>PDF</button>
                <button className="secondary" onClick={() => shareOnWhatsApp(inv.id)}>WhatsApp</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
