import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Contacts() {
  const [tab, setTab] = useState<"customers" | "suppliers">("customers");
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", gstin: "" });

  function refresh() {
    api(`/contacts/${tab}`).then(setList).catch(() => {});
  }
  useEffect(refresh, [tab]);

  async function add() {
    await api(`/contacts/${tab}`, { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", phone: "", gstin: "" });
    refresh();
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Customers & Suppliers</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button className={tab === "customers" ? "gold" : "secondary"} onClick={() => setTab("customers")}>Customers</button>
        <button className={tab === "suppliers" ? "gold" : "secondary"} onClick={() => setTab("suppliers")}>Suppliers</button>
      </div>

      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Add {tab === "customers" ? "customer" : "supplier"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          <label>{tab === "customers" ? "Customer name" : "Supplier name"}<input placeholder="Full legal or trading name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Phone<input placeholder="10-digit phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>GSTIN<input placeholder="Optional GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></label>
        </div>
        <button className="gold" onClick={add} disabled={!form.name}>Add</button>
      </section>

      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>GSTIN</th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.phone || "—"}</td>
              <td>{c.gstin || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
