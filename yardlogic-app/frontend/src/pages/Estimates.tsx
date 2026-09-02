import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Estimates() {
  const [estimates, setEstimates] = useState<any[]>([]);
  const [lines, setLines] = useState([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18 }]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  function refresh() {
    api("/estimates").then(setEstimates).catch(() => {});
  }
  useEffect(refresh, []);
  useEffect(() => { api("/contacts/customers").then(setCustomers).catch(() => {}); }, []);

  async function create() {
    if (saving) return;
    if (lines.some((line) => !line.name.trim() || line.quantity <= 0 || line.unitPrice < 0 || line.taxRate < 0 || line.taxRate > 100)) {
      setError("Enter a name, positive quantity, valid price, and GST rate from 0 to 100.");
      return;
    }
    setSaving(true);
    try {
      const idempotencyKey = requestId || crypto.randomUUID();
      if (!requestId) setRequestId(idempotencyKey);
      await api("/estimates", { method: "POST", headers: { "X-Idempotency-Key": idempotencyKey }, body: JSON.stringify({ customerId: customerId || undefined, lines, validUntil: validUntil ? new Date(`${validUntil}T00:00:00.000Z`).toISOString() : undefined, notes: notes || undefined, terms: terms || undefined }) });
      setLines([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18 }]);
      setCustomerId("");
      setValidUntil(""); setNotes(""); setTerms("");
      setRequestId(null);
      setError("");
      refresh();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to save estimate"); }
    finally { setSaving(false); }
  }

  async function convert(id: string) {
    await api(`/estimates/${id}/convert`, { method: "POST" });
    refresh();
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Estimates & Quotations</h1>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}

      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>New estimate</h2>
        <label>Customer<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}><label>Valid until<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label><label>Notes<input placeholder="Optional note" value={notes} onChange={(e) => setNotes(e.target.value)} /></label><label>Terms<input placeholder="Quotation terms" value={terms} onChange={(e) => setTerms(e.target.value)} /></label></div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <label>Item name<input placeholder="e.g. TMT Steel 10mm" value={l.name} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} /></label>
            <label>Quantity<input type="number" min="0.01" placeholder="0" value={l.quantity} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: Number(e.target.value) } : x)))} /></label>
            <label>Unit price<input type="number" min="0" placeholder="0.00" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} /></label>
            <label>GST %<input type="number" min="0" max="100" placeholder="18" value={l.taxRate} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, taxRate: Number(e.target.value) } : x)))} /></label>
          </div>
        ))}
        <button className="secondary" onClick={() => setLines([...lines, { name: "", quantity: 1, unitPrice: 0, taxRate: 18 }])}>+ Add line</button>
        <button className="gold" style={{ marginLeft: 8 }} onClick={create} disabled={saving || !lines[0].name}>{saving ? "Saving..." : "Save estimate"}</button>
      </section>

      <table>
        <thead><tr><th>Number</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {estimates.map((e) => (
            <tr key={e.id}>
              <td>{e.number}</td>
              <td>{e.customer?.name ?? "Walk-in"}</td>
              <td className="numeral">₹{e.grandTotal.toLocaleString("en-IN")}</td>
              <td>{e.status}</td>
              <td>
                {e.status === "OPEN" && (
                  <button className="secondary" onClick={() => convert(e.id)}>Convert to invoice</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
