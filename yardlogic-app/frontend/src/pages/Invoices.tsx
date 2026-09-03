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
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [historyFilter, setHistoryFilter] = useState("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [paymentEdited, setPaymentEdited] = useState(false);

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
  const invoiceTotal = Math.max(0, subTotal + tax);

  useEffect(() => {
    if (!paymentEdited && !editingId) setAmountPaid(invoiceTotal);
  }, [invoiceTotal, paymentEdited, editingId]);

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
      const payload = { customerId: customerId || undefined, customerName: customerName || undefined, customerPhone: customerPhone || undefined, customerEmail: customerEmail || undefined, type: invoiceType, lines, amountPaid, paymentMode: amountPaid > 0 ? paymentMode : undefined, dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined, followUpDate: followUpDate ? new Date(`${followUpDate}T00:00:00.000Z`).toISOString() : undefined, notes: notes || undefined, terms: terms || undefined };
      const idempotencyKey = requestId || crypto.randomUUID();
      if (!editingId && !requestId) setRequestId(idempotencyKey);
      await api(editingId ? `/invoices/${editingId}` : "/invoices", { method: editingId ? "PATCH" : "POST", ...(editingId ? {} : { headers: { "X-Idempotency-Key": idempotencyKey } }), body: JSON.stringify(payload) });
      setLines([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18, discount: 0 }]);
      setCustomerId(""); setCustomerName(""); setCustomerPhone(""); setCustomerEmail("");
      setAmountPaid(0); setPaymentMode("CASH"); setDueDate(""); setFollowUpDate(""); setNotes(""); setTerms("");
      setPaymentEdited(false);
      setRequestId(null);
      setEditingId(null);
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
  async function downloadPdf(id: string, number: string, mode: "download" | "view" = "download") {
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
    if (mode === "view") {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      a.download = `${number}.pdf`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function viewPdf(id: string, number: string) {
    await downloadPdf(id, number, "view");
  }

  function editInvoice(invoice: any) {
    setEditingId(invoice.id);
    setCustomerId(invoice.customerId || "");
    setCustomerName(invoice.customerName || "");
    setCustomerPhone(invoice.customerPhone || "");
    setCustomerEmail(invoice.customerEmail || "");
    setInvoiceType(invoice.type);
    setAmountPaid(invoice.amountPaid || 0);
    setPaymentMode(invoice.paymentMode || "CASH");
    setDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 10) : "");
    setFollowUpDate(invoice.followUpDate ? invoice.followUpDate.slice(0, 10) : "");
    setNotes(invoice.notes || "");
    setTerms(invoice.terms || "");
    setLines(invoice.items.map((item: any) => ({ itemId: item.itemId || undefined, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, discount: item.discount })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteInvoice(id: string) {
    if (!window.confirm("Cancel this invoice? It will remain in your records as cancelled.")) return;
    await api(`/invoices/${id}`, { method: "DELETE" });
    setSelectedInvoices((current) => current.filter((invoiceId) => invoiceId !== id));
    refresh();
  }

  async function bulkDownload() {
    for (const id of selectedInvoices) {
      const invoice = invoices.find((candidate) => candidate.id === id);
      if (invoice) await downloadPdf(invoice.id, invoice.number);
    }
  }

  async function bulkDelete() {
    if (!selectedInvoices.length || !window.confirm(`Cancel ${selectedInvoices.length} selected invoices?`)) return;
    await Promise.all(selectedInvoices.map((id) => api(`/invoices/${id}`, { method: "DELETE" })));
    setSelectedInvoices([]);
    refresh();
  }

  async function bulkShare() {
    for (const id of selectedInvoices) await shareOnWhatsApp(id);
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
            <h2>{editingId ? "Edit invoice" : "New invoice"}</h2>
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
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.gstin ? ` · GSTIN ${customer.gstin}` : ""}</option>)}
          </select>
            {customerId && customers.find((customer) => customer.id === customerId)?.gstin && <small>Customer GSTIN: {customers.find((customer) => customer.id === customerId)?.gstin}</small>}
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
          <label>Amount paid<input type="number" min="0" max={invoiceTotal} value={amountPaid} onChange={(e) => { setPaymentEdited(true); setAmountPaid(Math.max(0, Number(e.target.value))); }} /></label>
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
              {activeProductLine === i && inventory.length > 0 && <div className="product-suggestions">
                {inventory.filter((item) => !l.name.trim() || item.name.toLowerCase().includes(l.name.trim().toLowerCase())).slice(0, 12).map((item) => <button type="button" key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectProduct(i, item)}><span>{item.name}</span><small>{item.currentStock} {item.unit} available · Rs. {item.salePrice}</small></button>)}
              </div>}
              <small>{l.itemId ? `${inventory.find((item) => item.id === l.itemId)?.currentStock ?? 0} ${inventory.find((item) => item.id === l.itemId)?.unit ?? "units"} currently in stock` : "Saved products will fill price and GST automatically."}</small>
            </label>
            <label>Quantity{l.itemId && <small>{inventory.find((item) => item.id === l.itemId)?.unit}</small>}<input type="number" min="0.01" placeholder="0" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} /></label>
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
            {creating ? "Saving..." : editingId ? "Save invoice changes" : amountPaid < subTotal + tax ? "Create credit invoice" : "Create paid invoice"}
          </button>
          {editingId && <button className="secondary" onClick={() => setEditingId(null)}>Cancel edit</button>}
        </div>
      </section>

      <section className="invoice-history">
      <div className="section-heading"><div><p className="eyebrow">Recent activity</p><h2>Invoices</h2></div><span className="status-note">{invoices.length} total</span></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <label>Filter<select value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)}><option value="ALL">All invoices</option><option value="PAID">Paid</option><option value="PARTIAL">Partial</option><option value="UNPAID">Unpaid</option><option value="CANCELLED">Cancelled</option></select></label>
        <button className="secondary" disabled={!selectedInvoices.length} onClick={() => void bulkDownload()}>Download selected</button>
        <button className="secondary" disabled={!selectedInvoices.length} onClick={() => void bulkShare()}>Share selected</button>
        <button className="secondary" disabled={!selectedInvoices.length} onClick={() => void bulkDelete()}>Cancel selected</button>
      </div>
      <table>
        <thead>
          <tr><th><input type="checkbox" aria-label="Select all invoices" checked={invoices.filter((invoice) => historyFilter === "ALL" || invoice.status === historyFilter).length > 0 && selectedInvoices.length === invoices.filter((invoice) => historyFilter === "ALL" || invoice.status === historyFilter).length} onChange={(event) => setSelectedInvoices(event.target.checked ? invoices.filter((invoice) => historyFilter === "ALL" || invoice.status === historyFilter).map((invoice) => invoice.id) : [])} /></th><th>Number</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th><th></th></tr>
        </thead>
        <tbody>
          {invoices.filter((invoice) => historyFilter === "ALL" || invoice.status === historyFilter).map((inv) => (
            <tr key={inv.id}>
              <td><input type="checkbox" aria-label={`Select ${inv.number}`} checked={selectedInvoices.includes(inv.id)} onChange={(event) => setSelectedInvoices((current) => event.target.checked ? [...current, inv.id] : current.filter((id) => id !== inv.id))} /></td>
              <td>{inv.number}</td>
              <td>{inv.customer?.name ?? "Walk-in"}</td>
              <td className="numeral">₹{inv.grandTotal.toLocaleString("en-IN")}</td>
              <td>{inv.status}</td>
              <td>{new Date(inv.createdAt).toLocaleDateString("en-IN")}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="secondary" onClick={() => void viewPdf(inv.id, inv.number)}>View</button>
                <button className="secondary" onClick={() => downloadPdf(inv.id, inv.number)}>PDF</button>
                <button className="secondary" onClick={() => shareOnWhatsApp(inv.id)}>WhatsApp</button>
                <button className="secondary" onClick={() => void editInvoice(inv)}>Edit</button>
                <button className="secondary" onClick={() => void deleteInvoice(inv.id)}>Cancel</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </section>
    </div>
  );
}
