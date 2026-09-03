import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Item { id: string; name: string; unit: string; currentStock: number; salePrice: number; purchasePrice: number; taxRate: number; barcode?: string | null }
interface Warehouse { id: string; name: string; address?: string | null; isDefault: boolean; stock: { quantity: number; item: { name: string; unit: string } }[] }
interface Batch { id: string; batchNumber: string; quantity: number; expiryDate?: string | null; item: { name: string; unit: string } }
interface Conversion { id: string; fromUnit: string; toUnit: string; factor: number; item: { name: string; unit: string } }

export function Operations() {
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [warehouseForm, setWarehouseForm] = useState({ name: "", address: "", isDefault: false });
  const [batchForm, setBatchForm] = useState({ itemId: "", batchNumber: "", quantity: "", expiryDate: "", mfgDate: "" });
  const [conversionForm, setConversionForm] = useState({ itemId: "", fromUnit: "Bag", toUnit: "Kg", factor: "50" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [nextItems, nextWarehouses, nextBatches, nextConversions] = await Promise.all([
        api<Item[]>("/items"), api<Warehouse[]>("/operations/warehouses"), api<Batch[]>("/operations/batches"), api<Conversion[]>("/operations/conversions"),
      ]);
      setItems(nextItems); setWarehouses(nextWarehouses); setBatches(nextBatches); setConversions(nextConversions);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to load operations"); }
  }
  useEffect(() => { void refresh(); }, []);

  async function addWarehouse() {
    setError(""); setMessage("");
    try { await api("/operations/warehouses", { method: "POST", body: JSON.stringify(warehouseForm) }); setWarehouseForm({ name: "", address: "", isDefault: false }); setMessage("Warehouse added."); await refresh(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to add warehouse"); }
  }
  async function addBatch() {
    setError(""); setMessage("");
    try { await api("/operations/batches", { method: "POST", body: JSON.stringify({ itemId: batchForm.itemId, batchNumber: batchForm.batchNumber, quantity: Number(batchForm.quantity), expiryDate: batchForm.expiryDate ? new Date(`${batchForm.expiryDate}T00:00:00.000Z`).toISOString() : undefined, mfgDate: batchForm.mfgDate ? new Date(`${batchForm.mfgDate}T00:00:00.000Z`).toISOString() : undefined }) }); setBatchForm({ itemId: "", batchNumber: "", quantity: "", expiryDate: "", mfgDate: "" }); setMessage("Batch recorded."); await refresh(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to record batch"); }
  }
  async function addConversion() {
    setError(""); setMessage("");
    try { await api("/operations/conversions", { method: "POST", body: JSON.stringify({ itemId: conversionForm.itemId, fromUnit: conversionForm.fromUnit, toUnit: conversionForm.toUnit, factor: Number(conversionForm.factor) }) }); setMessage("Unit conversion saved."); await refresh(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to save conversion"); }
  }
  function exportItems() {
    const headers = ["name", "unit", "barcode", "salePrice", "purchasePrice", "taxRate", "currentStock"];
    const csv = [headers.join(","), ...items.map((item) => headers.map((header) => JSON.stringify(item[header as keyof Item] ?? "")).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = "yardlogic-inventory.csv"; link.click(); URL.revokeObjectURL(url);
  }
  async function importItems(file: File) {
    const text = await file.text();
    const rows = text.trim().split(/\r?\n/).map((row) => row.split(",").map((value) => value.trim().replace(/^"|"$/g, "")));
    const [headers, ...values] = rows;
    if (!headers || !values.length) { setError("CSV must contain a header row and at least one product."); return; }
    const parsed = values.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])) ).map((row: any) => ({ name: row.name, unit: row.unit || "PCS", barcode: row.barcode || undefined, salePrice: Number(row.salePrice || 0), purchasePrice: Number(row.purchasePrice || 0), taxRate: Number(row.taxRate || 0), openingStock: Number(row.currentStock || row.openingStock || 0), lowStockAlert: Number(row.lowStockAlert || 0) }));
    try { const result = await api<{ created: number; merged: number }>("/items/import", { method: "POST", body: JSON.stringify({ rows: parsed }) }); setMessage(`Imported ${result.created} new products and merged ${result.merged} existing products.`); await refresh(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to import CSV"); }
  }

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}><div><p className="eyebrow">Operations</p><h1>Warehouses & stock controls</h1></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><label className="secondary">Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importItems(file); event.currentTarget.value = ""; }} /></label><button className="secondary" onClick={exportItems}>Export inventory CSV</button></div></div>
    {message && <p role="status" style={{ color: "var(--gold)" }}>{message}</p>}{error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, margin: "20px 0" }}><h2>Warehouses</h2><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input placeholder="Warehouse name" value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} /><input placeholder="Address (optional)" value={warehouseForm.address} onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })} /><label><input type="checkbox" checked={warehouseForm.isDefault} onChange={(e) => setWarehouseForm({ ...warehouseForm, isDefault: e.target.checked })} /> Default</label><button className="gold" disabled={!warehouseForm.name} onClick={() => void addWarehouse()}>Add warehouse</button></div><ul>{warehouses.map((warehouse) => <li key={warehouse.id}><strong>{warehouse.name}</strong>{warehouse.isDefault ? " · Default" : ""} {warehouse.address || ""} · {warehouse.stock.length} stocked products</li>)}</ul></section>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20 }}><h2>Batch & expiry</h2><select value={batchForm.itemId} onChange={(e) => setBatchForm({ ...batchForm, itemId: e.target.value })}><option value="">Choose product</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select><input placeholder="Batch number" value={batchForm.batchNumber} onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value })} /><input type="number" min="0" placeholder="Quantity" value={batchForm.quantity} onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })} /><label>Manufactured<input type="date" value={batchForm.mfgDate} onChange={(e) => setBatchForm({ ...batchForm, mfgDate: e.target.value })} /></label><label>Expiry<input type="date" value={batchForm.expiryDate} onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })} /></label><button className="gold" disabled={!batchForm.itemId || !batchForm.batchNumber || !batchForm.quantity} onClick={() => void addBatch()}>Record batch</button><ul>{batches.slice(0, 8).map((batch) => <li key={batch.id}>{batch.item.name} · {batch.batchNumber} · {batch.quantity} {batch.item.unit} · expiry {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString("en-IN") : "not set"}</li>)}</ul></section>
      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20 }}><h2>Unit conversions</h2><select value={conversionForm.itemId} onChange={(e) => setConversionForm({ ...conversionForm, itemId: e.target.value })}><option value="">Choose product</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} (base: {item.unit})</option>)}</select><div style={{ display: "flex", gap: 8 }}><input placeholder="From" value={conversionForm.fromUnit} onChange={(e) => setConversionForm({ ...conversionForm, fromUnit: e.target.value })} /><input placeholder="To" value={conversionForm.toUnit} onChange={(e) => setConversionForm({ ...conversionForm, toUnit: e.target.value })} /></div><label>Factor<input type="number" min="0.0001" value={conversionForm.factor} onChange={(e) => setConversionForm({ ...conversionForm, factor: e.target.value })} /></label><button className="gold" disabled={!conversionForm.itemId} onClick={() => void addConversion()}>Save conversion</button><ul>{conversions.map((conversion) => <li key={conversion.id}>{conversion.item.name}: 1 {conversion.fromUnit} = {conversion.factor} {conversion.toUnit}</li>)}</ul></section>
    </div>
  </div>;
}
