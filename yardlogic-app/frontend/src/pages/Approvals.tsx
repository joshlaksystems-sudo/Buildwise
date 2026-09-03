import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Approval { id: string; entityType: string; entityId: string; status: string; note?: string | null; requester?: { name?: string | null }; reviewer?: { name?: string | null } }

export function Approvals() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [form, setForm] = useState({ entityType: "INVOICE", entityId: "", note: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() { try { setApprovals(await api<Approval[]>("/approvals")); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to load approvals"); } }
  useEffect(() => { void refresh(); }, []);

  async function requestApproval() {
    try { await api("/approvals", { method: "POST", body: JSON.stringify(form) }); setForm({ ...form, entityId: "", note: "" }); setMessage("Approval request submitted."); await refresh(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to submit approval"); }
  }
  async function review(id: string, status: "APPROVED" | "REJECTED") {
    try { await api(`/approvals/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setMessage(`Request ${status.toLowerCase()}.`); await refresh(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Only owners and admins can review requests"); }
  }

  return <div><p className="eyebrow">Control & governance</p><h1>Approval requests</h1>{message && <p role="status" style={{ color: "var(--gold)" }}>{message}</p>}{error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20, margin: "20px 0" }}><h2>Submit a request</h2><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}><option>INVOICE</option><option>PURCHASE_BILL</option><option>STOCK_ADJUSTMENT</option><option>GST_FILING</option></select><input placeholder="Record ID" value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} /><input placeholder="Reason or note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /><button className="gold" disabled={!form.entityId} onClick={() => void requestApproval()}>Submit</button></div></section>
    <table><thead><tr><th>Type</th><th>Record</th><th>Requested by</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>{approvals.map((approval) => <tr key={approval.id}><td>{approval.entityType}</td><td>{approval.entityId}</td><td>{approval.requester?.name || "User"}</td><td>{approval.note || "-"}</td><td>{approval.status}</td><td>{approval.status === "PENDING" && <span style={{ display: "flex", gap: 6 }}><button className="gold" onClick={() => void review(approval.id, "APPROVED")}>Approve</button><button className="secondary" onClick={() => void review(approval.id, "REJECTED")}>Reject</button></span>}</td></tr>)}</tbody></table>
  </div>;
}
