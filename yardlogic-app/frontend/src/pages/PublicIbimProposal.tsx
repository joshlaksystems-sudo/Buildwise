import { FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

type Proposal = {
  id: string;
  type: "NEW_BUSINESS" | "RENEWAL";
  status: string;
  data: {
    businessDescription?: string;
    tradeAssociation?: string;
    annualTurnover?: number;
    employeeCount?: number;
    requestedCover?: string;
  };
  member?: { legalName?: string | null; tradingName?: string | null; email?: string | null } | null;
};

const emptyForm = {
  businessDescription: "",
  tradeAssociation: "",
  annualTurnover: "",
  employeeCount: "",
  requestedCover: "",
};

export function PublicIbimProposal() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || !token) {
      setError("This proposal link is incomplete.");
      setLoading(false);
      return;
    }
    void api<{ proposal: Proposal }>(`/ibim/public/proposals/${id}?token=${encodeURIComponent(token)}`)
      .then((result) => {
        setProposal(result.proposal);
        setForm({
          businessDescription: result.proposal.data.businessDescription || "",
          tradeAssociation: result.proposal.data.tradeAssociation || "",
          annualTurnover: result.proposal.data.annualTurnover?.toString() || "",
          employeeCount: result.proposal.data.employeeCount?.toString() || "",
          requestedCover: result.proposal.data.requestedCover || "",
        });
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load this proposal"))
      .finally(() => setLoading(false));
  }, [id, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!id || !token) return;
    setSaving(true);
    setError("");
    try {
      await api(`/ibim/public/proposals/${id}?token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: JSON.stringify({ data: { ...form, annualTurnover: Number(form.annualTurnover), employeeCount: Number(form.employeeCount) } }),
      });
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit your proposal");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="auth-page"><section className="auth-card"><p>Loading your proposal form...</p></section></main>;
  if (error && !proposal) return <main className="auth-page"><section className="auth-card"><h1>iBIM</h1><h2>Proposal form unavailable</h2><p>{error}</p></section></main>;
  if (submitted) return <main className="auth-page"><section className="auth-card"><p className="eyebrow">iBIM / proposal received</p><h1>Thank you</h1><p>Your proposal information has been submitted successfully. The account team will review it and contact you with the next step.</p></section></main>;
  if (!proposal) return null;

  const isRenewal = proposal.type === "RENEWAL";
  return <main className="auth-page"><section className="auth-card" style={{ width: "min(680px, 100%)" }}>
    <p className="eyebrow">iBIM / {isRenewal ? "renewal information" : "new business"}</p>
    <h1>{isRenewal ? "Confirm your renewal details" : "Tell us about your business"}</h1>
    <p>Please complete the form below. Your information will be sent securely to the Insurance Mutual team.</p>
    {proposal.member?.legalName && <p><strong>Business:</strong> {proposal.member.legalName}</p>}
    {error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    <form onSubmit={submit} style={{ display: "grid", gap: 16, marginTop: 24 }}>
      <label>Business description<textarea required minLength={2} value={form.businessDescription} onChange={(event) => setForm({ ...form, businessDescription: event.target.value })} /></label>
      <label>Trade association<input required value={form.tradeAssociation} onChange={(event) => setForm({ ...form, tradeAssociation: event.target.value })} /></label>
      <label>Annual turnover (GBP)<input required min="0" type="number" value={form.annualTurnover} onChange={(event) => setForm({ ...form, annualTurnover: event.target.value })} /></label>
      <label>Number of employees<input required min="0" type="number" value={form.employeeCount} onChange={(event) => setForm({ ...form, employeeCount: event.target.value })} /></label>
      <label>Requested cover<textarea required value={form.requestedCover} onChange={(event) => setForm({ ...form, requestedCover: event.target.value })} /></label>
      <button className="gold" disabled={saving}>{saving ? "Submitting..." : "Submit proposal information"}</button>
    </form>
  </section></main>;
}