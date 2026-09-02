import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Challans() {
  const [challans, setChallans] = useState<any[]>([]);
  const [lines, setLines] = useState([{ name: "", quantity: 1 }]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  function refresh() {
    api("/challans").then(setChallans).catch(() => {});
  }
  useEffect(refresh, []);
  useEffect(() => { api("/contacts/customers").then(setCustomers).catch(() => {}); }, []);

  async function create() {
    if (saving) return;
    if (lines.some((line) => !line.name.trim() || line.quantity <= 0)) { setError("Enter an item name and a positive quantity."); return; }
    setSaving(true);
    try {
      const idempotencyKey = requestId || crypto.randomUUID();
      if (!requestId) setRequestId(idempotencyKey);
      await api("/challans", { method: "POST", headers: { "X-Idempotency-Key": idempotencyKey }, body: JSON.stringify({ customerId: customerId || undefined, lines, vehicleNumber: vehicleNumber || undefined, transporterId: transporterId || undefined, notes: notes || undefined }) });
      setLines([{ name: "", quantity: 1 }]); setCustomerId(""); setVehicleNumber(""); setTransporterId(""); setNotes(""); setError(""); refresh();
      setRequestId(null);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to create challan"); }
    finally { setSaving(false); }
  }

  async function markDelivered(id: string) {
    await api(`/challans/${id}/deliver`, { method: "PATCH" });
    refresh();
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Delivery Challans</h1>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}

      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>New challan</h2>
        <label>Customer<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}><label>Vehicle number<input placeholder="e.g. MH12AB1234" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} /></label><label>Transporter ID<input placeholder="Transporter reference" value={transporterId} onChange={(e) => setTransporterId(e.target.value)} /></label><label>Notes<input placeholder="Dispatch instructions" value={notes} onChange={(e) => setNotes(e.target.value)} /></label></div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 8, marginBottom: 8 }}>
            <label>Item name<input placeholder="e.g. Bricks" value={l.name} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} /></label>
            <label>Quantity<input type="number" min="0.01" placeholder="0" value={l.quantity} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: Number(e.target.value) } : x)))} /></label>
          </div>
        ))}
        <button className="secondary" onClick={() => setLines([...lines, { name: "", quantity: 1 }])}>+ Add line</button>
        <button className="gold" style={{ marginLeft: 8 }} onClick={create} disabled={saving || !lines[0].name}>{saving ? "Creating..." : "Create challan"}</button>
      </section>

      <table>
        <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {challans.map((c) => (
            <tr key={c.id}>
              <td>{c.number}</td>
              <td>{c.customer?.name ?? "Walk-in"}</td>
              <td>{c.status}</td>
              <td>
                {c.status === "PENDING" && (
                  <button className="secondary" onClick={() => markDelivered(c.id)}>Mark delivered</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
