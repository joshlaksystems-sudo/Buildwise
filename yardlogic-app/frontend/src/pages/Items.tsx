import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { readLocal, saveLocalFirst } from "../lib/syncManager";
import "./Items.css";

export function Items() {
  const [items, setItems] = useState<any[]>([]);
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [form, setForm] = useState({ name: "", unit: "PCS", salePrice: 0, purchasePrice: 0, taxRate: 18, openingStock: 0, lowStockAlert: 5, barcode: "" });

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
    const itemPayload = {
      name: form.name.trim(),
      unit: form.unit,
      salePrice: form.salePrice,
      purchasePrice: form.purchasePrice,
      taxRate: form.taxRate,
      openingStock: form.openingStock,
      lowStockAlert: form.lowStockAlert,
      barcode: form.barcode.trim() || undefined,
    };

    try {
      if (navigator.onLine) {
        const result = await api<{ merged?: boolean }>("/items", { method: "POST", body: JSON.stringify(itemPayload) });
        setNotice(result.merged ? "Existing product found. Stock was added to that product instead of creating a duplicate." : "Product added to inventory.");
      } else {
        await saveLocalFirst("item", {
          ...itemPayload,
          currentStock: form.openingStock,
        });
      }
      setForm({ name: "", unit: "PCS", salePrice: 0, purchasePrice: 0, taxRate: 18, openingStock: 0, lowStockAlert: 5, barcode: "" });
      await refresh();
    } catch (error) {
      if (!navigator.onLine) {
        await saveLocalFirst("item", { ...itemPayload, currentStock: form.openingStock });
        setForm({ name: "", unit: "PCS", salePrice: 0, purchasePrice: 0, taxRate: 18, openingStock: 0, lowStockAlert: 5, barcode: "" });
        await refresh();
        return;
      }
      console.error("Error adding inventory item:", error);
    }
  }

  const lowStockCount = items.filter((item) => item.currentStock <= item.lowStockAlert && item.lowStockAlert > 0).length;

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

      <section className="inventory-composer" style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 32 }}>
        <div className="inventory-section-heading">
          <div><p className="eyebrow">Product catalogue</p><h2 style={{ fontSize: 18 }}>Add item</h2></div>
          <span className="inventory-count">{items.length} products{lowStockCount > 0 ? ` · ${lowStockCount} need restocking` : ""}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          <label>Item name<input placeholder="e.g. OPC Cement 50kg" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Unit<select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option>PCS</option><option>Bag</option><option>Kg</option><option>Gram</option><option>Ton</option><option>Liter</option><option>Meter</option><option>Box</option></select></label>
          <label>Barcode<input placeholder="Optional barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></label>
          <label>Sale price<input type="number" min="0" placeholder="0.00" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} /></label>
          <label>Purchase price<input type="number" min="0" placeholder="0.00" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} /></label>
          <label>Opening stock<input type="number" min="0" placeholder="0" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value) })} /></label>
          <label>Reorder at<input type="number" min="0" placeholder="5" value={form.lowStockAlert} onChange={(e) => setForm({ ...form, lowStockAlert: Number(e.target.value) })} /></label>
        </div>
        <button className="gold" onClick={add} disabled={!form.name}>Add to inventory</button>
      </section>

      {notice && <p role="status" style={{ color: "var(--gold)", marginBottom: 16 }}>{notice}</p>}

      <section className="inventory-list">
      <div className="inventory-section-heading">
        <div><p className="eyebrow">Live quantities</p><h2 style={{ fontSize: 18 }}>Inventory</h2></div>
        <span className="inventory-count">Updated from your account</span>
      </div>
      <table>
        <thead>
          <tr><th>Item</th><th>Current stock</th><th>Status</th><th>Sale price</th><th>GST</th></tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={5} className="inventory-empty">No products saved yet. Add your first product above.</td></tr>}
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td className="numeral" style={{ color: i.lowStockAlert > 0 && i.currentStock <= i.lowStockAlert ? "var(--red)" : "inherit" }}>
                {i.currentStock} {i.unit}
              </td>
              <td><span className={`stock-status ${i.currentStock <= 0 ? "out" : i.lowStockAlert > 0 && i.currentStock <= i.lowStockAlert ? "low" : "available"}`}>
                {i.currentStock <= 0 ? "Out of stock" : i.lowStockAlert > 0 && i.currentStock <= i.lowStockAlert ? "Low stock" : "In stock"}
              </span></td>
              <td className="numeral">₹{i.salePrice}</td>
              <td>{i.taxRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      </section>
    </div>
  );
}
