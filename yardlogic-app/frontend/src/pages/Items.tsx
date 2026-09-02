import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { readLocal, saveLocalFirst } from "../lib/syncManager";

export function Items() {
  const [items, setItems] = useState<any[]>([]);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [form, setForm] = useState({ name: "", salePrice: 0, purchasePrice: 0, taxRate: 18, openingStock: 0, lowStockAlert: 5, barcode: "" });

  // Reads from the local cache first (instant, works offline), then
  // reconciles with the server in the background when online.
  async function refresh() {
    const local = await readLocal("item");
    setItems(local.sort((a, b) => a.name.localeCompare(b.name)));
    if (navigator.onLine) {
      try {
        const server = await api<any[]>("/items");
        setItems(server);
      } catch {
        // stay on the local copy if the server call fails
      }
    }
  }

  useEffect(() => {
    refresh();
    const onOnline = () => { setOffline(false); refresh(); };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function add() {
    // Writes locally immediately and either syncs now or queues for
    // later — the item shows up in the list either way, instantly.
    const currentStock = form.openingStock;
    await saveLocalFirst("item", { ...form, currentStock });
    setForm({ name: "", salePrice: 0, purchasePrice: 0, taxRate: 18, openingStock: 0, lowStockAlert: 5, barcode: "" });
    refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <h1 style={{ fontSize: 28 }}>Inventory</h1>
        {offline && (
          <span style={{ fontSize: 12, color: "var(--gold)", border: "1px solid var(--gold)", padding: "4px 10px", borderRadius: 3 }}>
            Offline — changes will sync automatically
          </span>
        )}
      </div>

      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Add item</h2>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          <label>Item name<input placeholder="e.g. OPC Cement 50kg" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Barcode<input placeholder="Optional barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></label>
          <label>Sale price<input type="number" min="0" placeholder="0.00" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} /></label>
          <label>Purchase price<input type="number" min="0" placeholder="0.00" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} /></label>
          <label>Opening stock<input type="number" min="0" placeholder="0" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value) })} /></label>
          <label>Reorder at<input type="number" min="0" placeholder="5" value={form.lowStockAlert} onChange={(e) => setForm({ ...form, lowStockAlert: Number(e.target.value) })} /></label>
        </div>
        <button className="gold" onClick={add} disabled={!form.name}>Add to inventory</button>
      </section>

      <table>
        <thead>
          <tr><th>Item</th><th>Stock</th><th>Sale price</th><th>GST</th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td className="numeral" style={{ color: i.lowStockAlert > 0 && i.currentStock <= i.lowStockAlert ? "var(--red)" : "inherit" }}>
                {i.currentStock} {i.unit}
              </td>
              <td className="numeral">₹{i.salePrice}</td>
              <td>{i.taxRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
