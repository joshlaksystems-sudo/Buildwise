import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Overview = { members: number; openProposals: number; renewalsDue: number; premium: string };
type Member = { id: string; legalName: string; tradingName?: string | null; email?: string | null; status: string };
type Proposal = { id: string; type: string; status: string; member?: Member | null };
type Task = { id: string; type: string; status: string; dueAt?: string | null; member?: Member | null };
type Policy = { id: string; policyNumber: string; status: string; renewalDate?: string | null; member?: Member | null };
type ManagementReport = { policies: Array<{ status: string; _count: { _all: number } }>; transactions: Array<{ type: string; _sum: { amount: string | number | null } }>; proposals: Array<{ status: string; _count: { _all: number } }> };

export function IbimWorkspace() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview>({ members: 0, openProposals: 0, renewalsDue: 0, premium: "0" });
  const [members, setMembers] = useState<Member[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [report, setReport] = useState<ManagementReport | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([api<Overview>("/ibim/overview"), api<{ members: Member[] }>("/ibim/members"), api<{ proposals: Proposal[] }>("/ibim/proposals"), api<{ tasks: Task[] }>("/ibim/tasks"), api<{ policies: Policy[] }>("/ibim/policies"), api<ManagementReport>("/ibim/reports/management")]).then(([nextOverview, nextMembers, nextProposals, nextTasks, nextPolicies, nextReport]) => {
      setOverview(nextOverview);
      setMembers(nextMembers.members);
      setProposals(nextProposals.proposals);
      setTasks(nextTasks.tasks);
      setPolicies(nextPolicies.policies);
      setReport(nextReport);
    }).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "Unable to load insurance overview");
    });
  }, []);

  async function addMember() {
    if (!memberName.trim() || saving) return;
    setSaving(true);
    try {
      const result = await api<{ member: Member }>("/ibim/members", { method: "POST", body: JSON.stringify({ legalName: memberName.trim(), email: memberEmail.trim() }) });
      setMembers((current) => [result.member, ...current]);
      setMemberName("");
      setMemberEmail("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add member");
    } finally { setSaving(false); }
  }

  async function submitProposal() {
    if (!selectedMemberId || saving) return;
    setSaving(true);
    try {
      const result = await api<{ proposal: Proposal }>("/ibim/proposals", { method: "POST", body: JSON.stringify({ memberId: selectedMemberId, type: "NEW_BUSINESS", formVersion: "1", data: { source: "iBIM workspace" } }) });
      setProposals((current) => [result.proposal, ...current]);
      setSelectedMemberId("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit proposal");
    } finally { setSaving(false); }
  }

  async function askCopilot() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    setError("");
    try {
      const data = await api<{ answer: string }>("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      setAnswer(data.answer);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Copilot is unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#101214", color: "#ebe7df", fontFamily: "Manrope, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 5vw", borderBottom: "1px solid #2b3033" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><strong style={{ fontSize: 20 }}>iB<span style={{ color: "#d68656" }}>.</span></strong><small style={{ color: "#8c918e", letterSpacing: ".12em" }}>COMMAND CENTRE</small></div>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "52px 5vw" }}>
        <p style={{ color: "#d68656", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>iBIM / Mutual operations</p>
        <h1 style={{ maxWidth: 680, margin: "12px 0", fontSize: "clamp(32px, 5vw, 58px)", lineHeight: 1, letterSpacing: "-2px" }}>One record for every member<span style={{ color: "#d68656" }}>.</span></h1>
        <p style={{ maxWidth: 540, color: "#8c918e", lineHeight: 1.7 }}>Manage digital proposals, renewals, policy records, chasing, bordereaux, payments, and rebates from one operational workspace.</p>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, margin: "36px 0 20px" }}>
          {[["Active members", overview.members], ["Open proposals", overview.openProposals], ["Renewals due", overview.renewalsDue], ["Premium tracked", `£${overview.premium}`]].map(([label, value]) => <article key={label} style={{ padding: 18, border: "1px solid #2b3033", background: "#171a1d" }}><small style={{ color: "#8c918e", textTransform: "uppercase", letterSpacing: ".1em" }}>{label}</small><strong style={{ display: "block", marginTop: 15, fontSize: 27, fontWeight: 400 }}>{value}</strong></article>)}
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, .8fr)", gap: 20 }}>
          <article style={{ border: "1px solid #2b3033", background: "#171a1d" }}>
            <div style={{ padding: 20, borderBottom: "1px solid #2b3033" }}><small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>Workflow pulse</small><h2 style={{ margin: "8px 0 0", fontSize: 18 }}>Insurance work in motion</h2></div>
            {["Prospecting and member intake", "New business proposals", "Renewal preparation", "Post-bind reporting"].map((item) => <div key={item} style={{ padding: "16px 20px", borderBottom: "1px solid #23282a" }}><strong style={{ display: "block", fontSize: 12 }}>{item}</strong><small style={{ color: "#656c6a" }}>Ready for workflow records and assigned actions</small></div>)}
          </article>
          <article style={{ padding: 24, border: "1px solid #2b3033", background: "#171a1d" }}>
            <small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>Member intake</small>
            <h2 style={{ margin: "12px 0 16px", fontSize: 20 }}>Add a master record</h2>
            <input value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Legal name" style={{ width: "100%", marginBottom: 8, padding: 10 }} />
            <input value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="Email address" style={{ width: "100%", marginBottom: 8, padding: 10 }} />
            <button onClick={addMember} disabled={saving || !memberName.trim()} style={{ width: "100%", padding: 12, background: "#d68656", color: "#1b1715" }}>Save member</button>
          </article>
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 20 }}>
          <article style={{ padding: 20, border: "1px solid #2b3033", background: "#171a1d" }}><small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>Members</small>{members.slice(0, 5).map((member) => <p key={member.id} style={{ margin: "12px 0 0", fontSize: 12 }}>{member.legalName}</p>)}</article>
          <article style={{ padding: 20, border: "1px solid #2b3033", background: "#171a1d" }}><small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>New proposal</small><select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)} style={{ width: "100%", margin: "14px 0 8px", padding: 10 }}><option value="">Choose member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.legalName}</option>)}</select><button onClick={submitProposal} disabled={saving || !selectedMemberId} style={{ width: "100%", padding: 10, background: "#d68656", color: "#1b1715" }}>Submit proposal</button>{proposals.slice(0, 3).map((proposal) => <p key={proposal.id} style={{ margin: "12px 0 0", fontSize: 12 }}>{proposal.type} · {proposal.status}</p>)}</article>
          <article style={{ padding: 20, border: "1px solid #2b3033", background: "#171a1d" }}><small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>Open actions</small>{tasks.length === 0 ? <p style={{ color: "#8c918e", fontSize: 12 }}>No open actions yet.</p> : tasks.slice(0, 5).map((task) => <p key={task.id} style={{ margin: "12px 0 0", fontSize: 12 }}>{task.type} · {task.member?.legalName || "Unassigned"}</p>)}</article>
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, marginTop: 20 }}>
          <article style={{ padding: 20, border: "1px solid #2b3033", background: "#171a1d" }}><small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>Policy register</small>{policies.length === 0 ? <p style={{ color: "#8c918e", fontSize: 12 }}>No policies recorded yet.</p> : policies.slice(0, 5).map((policy) => <p key={policy.id} style={{ margin: "12px 0 0", fontSize: 12 }}>{policy.policyNumber} · {policy.status} · {policy.member?.legalName || "No member"}</p>)}</article>
          <article style={{ padding: 20, border: "1px solid #2b3033", background: "#171a1d" }}><small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>Management reporting</small>{report?.transactions.length ? report.transactions.map((entry) => <p key={entry.type} style={{ margin: "12px 0 0", fontSize: 12 }}>{entry.type} · {entry._sum.amount ?? "0"}</p>) : <p style={{ color: "#8c918e", fontSize: 12 }}>Financial activity will appear here.</p>}</article>
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, .8fr)", gap: 20, marginTop: 20 }}>
          <article style={{ padding: 24, border: "1px solid #45352b", background: "#211d1a" }}><small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>iBIM assistant</small><h2 style={{ margin: "14px 0 8px", fontSize: 25 }}>Turn brief work into action.</h2><p style={{ color: "#a8a49c", fontSize: 12, lineHeight: 1.6 }}>Ask for a renewal chase, proposal validation rule, or management-reporting summary.</p><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What needs attention?" style={{ width: "100%", minHeight: 90, padding: 10, resize: "vertical", color: "#eee9df", border: "1px solid #554038", outline: "none", background: "#171515" }} /><button onClick={askCopilot} disabled={loading} style={{ width: "100%", marginTop: 8, padding: 12, color: "#1b1715", border: 0, background: "#d68656", cursor: "pointer" }}>{loading ? "Thinking..." : "Ask assistant"}</button>{error && <p style={{ color: "#d99a91", fontSize: 11 }}>{error}</p>}{answer && <pre style={{ maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", color: "#d1cbc1", fontSize: 11, lineHeight: 1.5 }}>{answer}</pre>}</article>
        </section>
      </main>
    </div>
  );
}
