import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Challans() {
  const [challans, setChallans] = useState<any[]>([]);
  const [lines, setLines] = useState([{ name: "", quantity: 1 }]);

  function refresh() {
    api("/challans").then(setChallans).catch(() => {});
  }
  useEffect(refresh, []);

  async function create() {
    await api("/challans", { method: "POST", body: JSON.stringify({ lines }) });
    setLines([{ name: "", quantity: 1 }]);
    refresh();
  }

  async function markDelivered(id: string) {
    await api(`/challans/${id}/deliver`, { method: "PATCH" });
    refresh();
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Delivery Challans</h1>

      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>New challan</h2>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Item name" value={l.name} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} />
            <input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
          </div>
        ))}
        <button className="secondary" onClick={() => setLines([...lines, { name: "", quantity: 1 }])}>+ Add line</button>
        <button className="gold" style={{ marginLeft: 8 }} onClick={create} disabled={!lines[0].name}>Create challan</button>
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
