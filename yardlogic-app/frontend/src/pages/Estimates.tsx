import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Estimates() {
  const [estimates, setEstimates] = useState<any[]>([]);
  const [lines, setLines] = useState([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18 }]);

  function refresh() {
    api("/estimates").then(setEstimates).catch(() => {});
  }
  useEffect(refresh, []);

  async function create() {
    await api("/estimates", { method: "POST", body: JSON.stringify({ lines }) });
    setLines([{ name: "", quantity: 1, unitPrice: 0, taxRate: 18 }]);
    refresh();
  }

  async function convert(id: string) {
    await api(`/estimates/${id}/convert`, { method: "POST" });
    refresh();
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Estimates & Quotations</h1>

      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>New estimate</h2>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Item name" value={l.name} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} />
            <input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
            <input type="number" placeholder="Price" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} />
            <input type="number" placeholder="GST %" value={l.taxRate} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, taxRate: Number(e.target.value) } : x)))} />
          </div>
        ))}
        <button className="secondary" onClick={() => setLines([...lines, { name: "", quantity: 1, unitPrice: 0, taxRate: 18 }])}>+ Add line</button>
        <button className="gold" style={{ marginLeft: 8 }} onClick={create} disabled={!lines[0].name}>Save estimate</button>
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
