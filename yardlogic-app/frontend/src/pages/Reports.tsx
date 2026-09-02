import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Reports() {
  const [summary, setSummary] = useState<any>(null);
  const [gst, setGst] = useState<any>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [pack, setPack] = useState<any>(null);
  const [packError, setPackError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [gstReturns, setGstReturns] = useState<any>({});
  const [gstLoading, setGstLoading] = useState(false);
  const [documentWarnings, setDocumentWarnings] = useState<string[]>([]);

  useEffect(() => {
    api("/reports/summary").then(setSummary).catch(() => {});
    api("/reports/gst").then(setGst).catch(() => {});
  }, []);

  async function generatePack() {
    setPackError("");
    try {
      const nextPack = await api(`/gst/preparation-pack/${period}`);
      setPack(nextPack);
      setGstReturns({});
    } catch (error) {
      setPackError(error instanceof Error ? error.message : "Unable to generate preparation pack");
    }
  }

  async function prepareReturn(returnType: "gstr1" | "gstr3b") {
    setGstLoading(true);
    setPackError("");
    try {
      const result = await api(`/gst/${returnType}/${period}`);
      setGstReturns((current: any) => ({ ...current, [returnType]: result }));
    } catch (error) {
      setPackError(error instanceof Error ? error.message : "Unable to prepare GST return");
    } finally {
      setGstLoading(false);
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

  async function uploadDocument(file: File) {
    setUploading(true);
    setPackError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ warnings?: string[] }>("/gst/documents/ai-organize", { method: "POST", body: form });
      setDocumentWarnings(result.warnings || []);
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
        <label style={{ marginLeft: 8 }}>Upload and organize document with AI<input type="file" accept=".pdf,.csv,.xlsx,.xls,.jpg,.jpeg,.png" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file); event.currentTarget.value = ""; }} /></label>
        {packError && <p style={{ color: "var(--red)" }}>{packError}</p>}
        {documentWarnings.length > 0 && <p style={{ color: "var(--gold)" }}>Review warnings: {documentWarnings.join("; ")}</p>}
        {pack && <div style={{ marginTop: 16 }}><p>Pack ready: {pack.summary.salesInvoiceCount} GST invoices, ₹{pack.summary.netTaxPayable.toLocaleString("en-IN")} estimated net tax.</p><button className="secondary" onClick={downloadPack}>Download preparation pack</button></div>}
      </section>
      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18 }}>GST compliance for {period}</h2>
        <p style={{ color: "var(--ink-soft)" }}>Prepare the monthly returns, review source documents, then submit through your registered GST provider.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button className="gold" onClick={() => void prepareReturn("gstr1")} disabled={gstLoading}>Prepare GSTR-1</button>
          <button className="secondary" onClick={() => void prepareReturn("gstr3b")} disabled={gstLoading}>Prepare GSTR-3B</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div><strong>GSTR-1</strong><div>{gstReturns.gstr1 ? `${gstReturns.gstr1.filing.status} | ${gstReturns.gstr1.invoiceCount} invoices` : "Not prepared"}</div></div>
          <div><strong>GSTR-3B</strong><div>{gstReturns.gstr3b ? `${gstReturns.gstr3b.filing.status} | Net tax Rs. ${Number(gstReturns.gstr3b.netTaxPayable || 0).toLocaleString("en-IN")}` : "Not prepared"}</div></div>
          <div><strong>Required review</strong><div>{pack ? `${pack.checklist.unresolvedMismatches} unresolved ITC mismatches` : "Generate the pack to check"}</div></div>
        </div>
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
