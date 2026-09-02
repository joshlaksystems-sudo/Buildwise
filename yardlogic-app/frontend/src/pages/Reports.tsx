import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Reports() {
  const [summary, setSummary] = useState<any>(null);
  const [gst, setGst] = useState<any>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [pack, setPack] = useState<any>(null);
  const [packError, setPackError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api("/reports/summary").then(setSummary).catch(() => {});
    api("/reports/gst").then(setGst).catch(() => {});
  }, []);

  async function generatePack() {
    setPackError("");
    try {
      setPack(await api(`/gst/preparation-pack/${period}`));
    } catch (error) {
      setPackError(error instanceof Error ? error.message : "Unable to generate preparation pack");
    }
  }

  function downloadPack() {
    if (!pack) return;
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yardlogic-gst-preparation-${period}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function uploadDocument(file: File, documentType: string) {
    setUploading(true);
    setPackError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("documentType", documentType);
      form.append("period", period);
      await api("/gst/documents", { method: "POST", body: form });
      if (pack) await generatePack();
    } catch (error) {
      setPackError(error instanceof Error ? error.message : "Unable to upload document");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Reports</h1>
      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18 }}>Accountant preparation pack</h2>
        <p style={{ color: "var(--ink-soft)" }}>Prepare sales, purchases, expenses, GST totals, reconciliation, and source-document references for one month.</p>
        <label>Period<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
        <button className="gold" onClick={generatePack}>Generate pack</button>
        <label style={{ marginLeft: 8 }}>Upload GST/source document<input type="file" accept=".pdf,.csv,.xlsx,.xls,.jpg,.jpeg,.png" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file, "OTHER"); event.currentTarget.value = ""; }} /></label>
        {packError && <p style={{ color: "var(--red)" }}>{packError}</p>}
        {pack && <div style={{ marginTop: 16 }}><p>Pack ready: {pack.summary.salesInvoiceCount} GST invoices, ₹{pack.summary.netTaxPayable.toLocaleString("en-IN")} estimated net tax.</p><button className="secondary" onClick={downloadPack}>Download preparation pack</button></div>}
      </section>
      <table>
        <tbody>
          <Row label="Total sales" value={summary?.totalSales} />
          <Row label="Total GST collected" value={gst?.gstCollected} />
          <Row label="Total expenses" value={summary?.totalExpenses} />
          <Row label="Estimated net profit" value={summary?.netProfitEstimate} />
          <Row label="Outstanding receivables" value={summary?.outstanding} />
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: number }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="numeral">{value !== undefined ? `₹${value.toLocaleString("en-IN")}` : "—"}</td>
    </tr>
  );
}
