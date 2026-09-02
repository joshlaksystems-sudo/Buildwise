import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { cacheInvoicePdf, getCachedInvoicePdf } from "../lib/offlineDb";

interface Line { itemId?: string; name: string; quantity: number; unitPrice: number; taxRate: number; discount: number }
interface BusinessMetadata { name: string; gstin?: string | null; address?: string | null; ownerPhone?: string | null; stateName?: string | null }
interface Customer { id: string; name: string; phone?: string | null; gstin?: string | null }
interface InventoryItem { id: string; name: string; salePrice: number; taxRate: number; currentStock: number; unit: string }

export function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18, discount: 0 }]);
  const [creating, setCreating] = useState(false);
  const [business, setBusiness] = useState<BusinessMetadata | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [invoiceType, setInvoiceType] = useState("GST");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  function refresh() {
    api("/invoices").then(setInvoices).catch(() => {});
  }
  useEffect(refresh, []);
  useEffect(() => {
    const activeBusinessId = localStorage.getItem("businessId");
    if (!activeBusinessId) return;
    Promise.all([
      api<BusinessMetadata>(`/business/${activeBusinessId}`),
      api<Customer[]>("/contacts/customers"),
      api<InventoryItem[]>("/items"),
    ]).then(([businessData, customerData, inventoryData]) => {
      setBusiness(businessData);
      setCustomers(customerData);
      setInventory(inventoryData);
    }).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "Unable to load invoice metadata");
    });
  }, []);

  const subTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice - l.discount, 0);
  const tax = lines.reduce((s, l) => s + (l.quantity * l.unitPrice - l.discount) * (l.taxRate / 100), 0);

  async function submit() {
    if (lines.some((line) => !line.name.trim() || line.quantity <= 0 || line.unitPrice < 0 || line.discount < 0 || line.discount > line.quantity * line.unitPrice)) {
      setError("Check item names, quantities, prices, and discounts before creating the invoice.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const idempotencyKey = requestId || crypto.randomUUID();
      if (!requestId) setRequestId(idempotencyKey);
      await api("/invoices", { method: "POST", headers: { "X-Idempotency-Key": idempotencyKey }, body: JSON.stringify({ customerId: customerId || undefined, type: invoiceType, lines, amountPaid: subTotal + tax, paymentMode: "CASH", dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined, notes: notes || undefined, terms: terms || undefined }) });
      setLines([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18, discount: 0 }]);
      setCustomerId("");
      setDueDate(""); setNotes(""); setTerms("");
      setRequestId(null);
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create invoice");
    } finally {
      setCreating(false);
    }
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function selectInventoryItem(index: number, itemId: string) {
    const item = inventory.find((candidate) => candidate.id === itemId);
    updateLine(index, item ? { itemId, name: item.name, unitPrice: item.salePrice, taxRate: item.taxRate } : { itemId: undefined });
  }

  // A plain <a href> can't carry the Authorization/X-Business-Id
  // headers the PDF route requires, so we fetch it as a blob and
  // open that instead.
  async function downloadPdf(id: string, number: string) {
    let blob: Blob | null = null;
    if (navigator.onLine) {
      const token = localStorage.getItem("token");
      const businessId = localStorage.getItem("businessId");
      const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/invoices/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}`, "X-Business-Id": businessId || "" },
      });
      if (res.ok) {
        blob = await res.blob();
        await cacheInvoicePdf(id, blob);
      }
    }
    blob ||= await getCachedInvoicePdf(id);
    if (!blob) throw new Error("Invoice PDF is not cached on this device and the server is unavailable");

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${number}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function shareOnWhatsApp(id: string) {
    const { link } = await api<{ link: string }>(`/invoices/${id}/whatsapp-link`);
    window.open(link, "_blank");
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Invoices</h1>

      {error && <p style={{ color: "var(--red)", marginBottom: 16 }}>{error}</p>}

      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>New bill</h2>
        {business && (
          <div style={{ borderBottom: "1px solid var(--rule)", paddingBottom: 16, marginBottom: 16 }}>
            <strong>{business.name}</strong>
            {business.gstin && <div>GSTIN: {business.gstin}</div>}
            {business.address && <div>{business.address}</div>}
            {(business.stateName || business.ownerPhone) && <div>{[business.stateName, business.ownerPhone].filter(Boolean).join(" | ")}</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <label>Customer
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          </label>
          <label>Invoice type
          <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
            <option value="GST">GST invoice</option>
            <option value="NON_GST">Non-GST invoice</option>
            <option value="POS">POS invoice</option>
          </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <label>Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <label>Notes<input placeholder="Optional note for customer" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <label>Terms<input placeholder="Payment terms or conditions" value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <label>Inventory item<select value={l.itemId || ""} onChange={(e) => selectInventoryItem(i, e.target.value)}><option value="">Select item or type name</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.currentStock} {item.unit})</option>)}</select><input placeholder="Other item name" value={l.name} onChange={(e) => updateLine(i, { itemId: undefined, name: e.target.value })} /></label>
            <label>Quantity<input type="number" min="0.01" placeholder="0" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} /></label>
            <label>Unit price<input type="number" min="0" placeholder="0.00" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} /></label>
            <label>GST %<input type="number" min="0" max="100" placeholder="18" value={l.taxRate} onChange={(e) => updateLine(i, { taxRate: Number(e.target.value) })} /></label>
            <label>Discount<input type="number" min="0" placeholder="0.00" value={l.discount} onChange={(e) => updateLine(i, { discount: Number(e.target.value) })} /></label>
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
