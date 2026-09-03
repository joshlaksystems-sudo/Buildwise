import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { cacheInvoicePdf, getCachedInvoicePdf } from "../lib/offlineDb";
import "./Invoices.css";

interface Line { itemId?: string; name: string; quantity: number; unitPrice: number; taxRate: number; discount: number }
interface BusinessMetadata { name: string; gstin?: string | null; address?: string | null; ownerPhone?: string | null; stateName?: string | null }
interface Customer { id: string; name: string; phone?: string | null; gstin?: string | null }
interface InventoryItem { id: string; name: string; salePrice: number; taxRate: number; currentStock: number; unit: string; sku?: string | null }

export function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18, discount: 0 }]);
  const [creating, setCreating] = useState(false);
  const [business, setBusiness] = useState<BusinessMetadata | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [invoiceType, setInvoiceType] = useState("GST");
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [dueDate, setDueDate] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [activeProductLine, setActiveProductLine] = useState<number | null>(null);

  function refresh() {
    api("/invoices").then(setInvoices).catch(() => {});
  }

  function refreshInventory() {
    return api<InventoryItem[]>("/items").then(setInventory);
  }
  useEffect(refresh, []);
  useEffect(() => {
    const activeBusinessId = localStorage.getItem("businessId");
    if (!activeBusinessId) return;
    api<BusinessMetadata>(`/business/${activeBusinessId}`).then(setBusiness).catch(() => {});
    api<Customer[]>("/contacts/customers").then(setCustomers).catch(() => {});
    refreshInventory().catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "Unable to load inventory");
    });
  }, []);

  const subTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice - l.discount, 0);
  const tax = lines.reduce((s, l) => s + (l.quantity * l.unitPrice - l.discount) * (l.taxRate / 100), 0);

  async function submit() {
    if (lines.some((line) => !line.name.trim() || line.quantity <= 0 || line.unitPrice < 0 || line.discount < 0 || line.discount > line.quantity * line.unitPrice)) {
      setError("Check item names, quantities, prices, and discounts before creating the invoice.");
      return;
    }
    const insufficient = lines.find((line) => {
      const item = line.itemId ? inventory.find((candidate) => candidate.id === line.itemId) : undefined;
      return item && line.quantity > item.currentStock;
    });
    if (insufficient) {
      const item = inventory.find((candidate) => candidate.id === insufficient.itemId);
      setError(`${item?.name || "Product"} has only ${item?.currentStock || 0} ${item?.unit || "units"} available.`);
      return;
    }
    setCreating(true);
    setError("");
    try {
      const idempotencyKey = requestId || crypto.randomUUID();
      if (!requestId) setRequestId(idempotencyKey);
      await api("/invoices", { method: "POST", headers: { "X-Idempotency-Key": idempotencyKey }, body: JSON.stringify({ customerId: customerId || undefined, customerName: customerName || undefined, customerPhone: customerPhone || undefined, customerEmail: customerEmail || undefined, type: invoiceType, lines, amountPaid, paymentMode: amountPaid > 0 ? paymentMode : undefined, dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined, followUpDate: followUpDate ? new Date(`${followUpDate}T00:00:00.000Z`).toISOString() : undefined, notes: notes || undefined, terms: terms || undefined }) });
      setLines([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18, discount: 0 }]);
      setCustomerId(""); setCustomerName(""); setCustomerPhone(""); setCustomerEmail("");
      setAmountPaid(0); setPaymentMode("CASH"); setDueDate(""); setFollowUpDate(""); setNotes(""); setTerms("");
      setRequestId(null);
      setActiveProductLine(null);
      refresh();
      await refreshInventory();
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

  function typeInventoryItem(index: number, value: string) {
    const match = inventory.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());
    updateLine(index, match
      ? { itemId: match.id, name: match.name, unitPrice: match.salePrice, taxRate: match.taxRate }
      : { itemId: undefined, name: value });
  }

  function selectProduct(index: number, item: InventoryItem) {
    updateLine(index, { itemId: item.id, name: item.name, unitPrice: item.salePrice, taxRate: item.taxRate });
    setActiveProductLine(null);
  }

  // A plain <a href> can't carry the Authorization/X-Business-Id
  // headers the PDF route requires, so we fetch it as a blob and
  // open that instead.
  async function downloadPdf(id: string, number: string) {
    let blob: Blob | null = null;
    if (navigator.onLine) {
      const token = localStorage.getItem("token");
      const businessId = localStorage.getItem("businessId");
      const apiBaseUrl = import.meta.env.VITE_API_URL || (
        import.meta.env.DEV ? "http://localhost:4000" : "https://yardlogic-backend.vercel.app"
      );
      const res = await fetch(`${apiBaseUrl}/invoices/${id}/pdf`, {
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
    <div className="invoice-page">
      <div className="invoice-page-heading">
        <div>
          <p className="eyebrow">Sales</p>
          <h1>Invoices</h1>
        </div>
        <p className="page-note">Create a bill and stock updates automatically.</p>
      </div>

      {error && <p className="invoice-error" role="alert">{error}</p>}

      <section className="invoice-composer">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2>New invoice</h2>
          </div>
          <span className="status-note">Inventory-aware sale</span>
        </div>
        {business && (
          <div className="business-summary">
            <strong>{business.name}</strong>
            <div className="business-meta">
              {business.gstin && <span>GSTIN: {business.gstin}</span>}
              {business.address && <span>{business.address}</span>}
              {(business.stateName || business.ownerPhone) && <span>{[business.stateName, business.ownerPhone].filter(Boolean).join(" | ")}</span>}
            </div>
          </div>
        )}
        <div className="invoice-form-grid invoice-form-grid-primary">
          <label>Customer (optional)
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in / enter below</option>
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
          {!customerId && <label>Customer name (optional)<input placeholder="Leave blank for anonymous sale" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></label>}
          {!customerId && <label>Mobile (optional)<input placeholder="10-digit mobile number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></label>}
          {!customerId && <label>Email (optional)<input type="email" placeholder="customer@example.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /></label>}
        </div>
        <div className="invoice-form-grid">
          <label>Due date (optional)<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <label>Amount paid<input type="number" min="0" max={subTotal + tax} value={amountPaid} onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value)))} /></label>
          {amountPaid > 0 && <label>Payment mode<select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}><option>CASH</option><option>UPI</option><option>CARD</option><option>BANK_TRANSFER</option><option>CHEQUE</option></select></label>}
          {amountPaid < subTotal + tax && <label>Credit follow-up date<input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} required /></label>}
          <label>Notes<input placeholder="Optional note for customer" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <label>Terms<input placeholder="Payment terms or conditions" value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
        </div>
        <div className="invoice-lines-heading"><h3>Items</h3><span>Choose a saved product to track stock</span></div>
        {lines.map((l, i) => (
          <div key={i} className="invoice-line">
            <label className="line-item-field">Product or item name
              <input autoComplete="off" placeholder="Start typing a product name" value={l.name} onFocus={() => setActiveProductLine(i)} onChange={(e) => { setActiveProductLine(i); typeInventoryItem(i, e.target.value); }} />
              {activeProductLine === i && l.name.trim() && inventory.filter((item) => item.name.toLowerCase().includes(l.name.trim().toLowerCase())).length > 0 && <div className="product-suggestions">
                {inventory.filter((item) => item.name.toLowerCase().includes(l.name.trim().toLowerCase())).slice(0, 8).map((item) => <button type="button" key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectProduct(i, item)}><span>{item.name}</span><small>{item.currentStock} {item.unit} available</small></button>)}
              </div>}
              <small>{l.itemId ? `${inventory.find((item) => item.id === l.itemId)?.currentStock ?? 0} ${inventory.find((item) => item.id === l.itemId)?.unit ?? "units"} currently in stock` : "Saved products will fill price and GST automatically."}</small>
            </label>
            <label>Quantity<input type="number" min="0.01" placeholder="0" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} /></label>
            <label>Unit price<input type="number" min="0" placeholder="0.00" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} /></label>
            <label>GST %<input type="number" min="0" max="100" placeholder="18" value={l.taxRate} onChange={(e) => updateLine(i, { taxRate: Number(e.target.value) })} /></label>
            <label>Discount<input type="number" min="0" placeholder="0.00" value={l.discount} onChange={(e) => updateLine(i, { discount: Number(e.target.value) })} /></label>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setLines([...lines, { name: "", quantity: 1, unitPrice: 0, taxRate: 18, discount: 0 }])}>
          + Add line
        </button>

        <div className="invoice-footer">
          <div className="invoice-total numeral">
            <div>Total: Rs. {(subTotal + tax).toFixed(2)}</div>
            <div className="invoice-total-detail">GST: Rs. {tax.toFixed(2)} | Paid: Rs. {amountPaid.toFixed(2)} | Balance: Rs. {Math.max(0, subTotal + tax - amountPaid).toFixed(2)}</div>
          </div>
          <button className="gold" onClick={submit} disabled={creating || !lines[0].name || amountPaid > subTotal + tax || (amountPaid < subTotal + tax && !followUpDate)}>
            {creating ? "Creating..." : amountPaid < subTotal + tax ? "Create credit invoice" : "Create paid invoice"}
          </button>
        </div>
      </section>

      <section className="invoice-history">
      <div className="section-heading"><div><p className="eyebrow">Recent activity</p><h2>Invoices</h2></div><span className="status-note">{invoices.length} total</span></div>
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
      </section>
    </div>
  );
}
