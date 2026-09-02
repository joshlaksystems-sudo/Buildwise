import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Reports() {
  const [summary, setSummary] = useState<any>(null);
  const [gst, setGst] = useState<any>(null);

  useEffect(() => {
    api("/reports/summary").then(setSummary).catch(() => {});
    api("/reports/gst").then(setGst).catch(() => {});
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Reports</h1>
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
