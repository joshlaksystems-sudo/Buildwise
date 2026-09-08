import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

const projects = [
  { name: "Avondale Logistics Hub", client: "Northline Structures", status: "On track", progress: 78 },
  { name: "Boort Processing Plant", client: "Civic Steel Group", status: "Review", progress: 56 },
  { name: "Festival Stand - Stage 02", client: "Mason & Field", status: "At risk", progress: 34 },
];

export function IbimWorkspace() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function askCopilot() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    setError("");
    try {
      const data = await api<{ answer: string }>("/ai/tekla-assistant", {
        method: "POST",
        body: JSON.stringify({ prompt: prompt.trim(), teklaVersion: "Tekla 2024" }),
      });
      setAnswer(data.answer);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Copilot is unavailable");
    } finally {
      setLoading(false);
    }
  }

  function switchToYardLogic() {
    localStorage.setItem("applicationPreference", "YARDLOGIC");
    navigate("/");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#101214", color: "#ebe7df", fontFamily: "Manrope, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 5vw", borderBottom: "1px solid #2b3033" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><strong style={{ fontSize: 20 }}>iB<span style={{ color: "#d68656" }}>.</span></strong><small style={{ color: "#8c918e", letterSpacing: ".12em" }}>COMMAND CENTRE</small></div>
        <button onClick={switchToYardLogic} style={{ padding: "9px 12px", color: "#d9b093", border: "1px solid #4b3b32", background: "transparent", cursor: "pointer" }}>Open YardLogic ERP</button>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "52px 5vw" }}>
        <p style={{ color: "#d68656", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>IBim Consulting / Operations</p>
        <h1 style={{ maxWidth: 680, margin: "12px 0", fontSize: "clamp(32px, 5vw, 58px)", lineHeight: 1, letterSpacing: "-2px" }}>Structure your next move<span style={{ color: "#d68656" }}>.</span></h1>
        <p style={{ maxWidth: 540, color: "#8c918e", lineHeight: 1.7 }}>One workspace for Tekla detailing delivery, automation tools, training, and the people behind complex work.</p>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, margin: "36px 0 20px" }}>
          {[['Active projects', '08'], ['Utilisation', '86.4%'], ['Hours recovered', '214h'], ['Pipeline value', '$184k']].map(([label, value]) => <article key={label} style={{ padding: 18, border: "1px solid #2b3033", background: "#171a1d" }}><small style={{ color: "#8c918e", textTransform: "uppercase", letterSpacing: ".1em" }}>{label}</small><strong style={{ display: "block", marginTop: 15, fontSize: 27, fontWeight: 400 }}>{value}</strong></article>)}
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, .8fr)", gap: 20 }}>
          <article style={{ border: "1px solid #2b3033", background: "#171a1d" }}>
            <div style={{ padding: 20, borderBottom: "1px solid #2b3033" }}><small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>Delivery pulse</small><h2 style={{ margin: "8px 0 0", fontSize: 18 }}>Projects in motion</h2></div>
            {projects.map((project) => <div key={project.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 90px 100px", gap: 14, alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #23282a" }}><div><strong style={{ display: "block", fontSize: 12 }}>{project.name}</strong><small style={{ color: "#656c6a" }}>{project.client}</small></div><span style={{ color: project.status === "On track" ? "#8dc4a2" : project.status === "Review" ? "#f0b38b" : "#d99a91", fontSize: 10 }}>{project.status}</span><div><div style={{ height: 4, background: "#2a3031" }}><span style={{ display: "block", width: `${project.progress}%`, height: "100%", background: "#d68656" }} /></div><small style={{ color: "#8c918e", fontSize: 10 }}>{project.progress}%</small></div></div>)}
          </article>
          <article style={{ padding: 24, border: "1px solid #45352b", background: "#211d1a" }}><small style={{ color: "#d68656", letterSpacing: ".1em", textTransform: "uppercase" }}>Tekla Copilot</small><h2 style={{ margin: "14px 0 8px", fontSize: 25 }}>Make Tekla work smarter.</h2><p style={{ color: "#a8a49c", fontSize: 12, lineHeight: 1.6 }}>Ask for an Open API pattern, detailing review, or workflow recommendation.</p><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What are you working on?" style={{ width: "100%", minHeight: 90, padding: 10, resize: "vertical", color: "#eee9df", border: "1px solid #554038", outline: "none", background: "#171515" }} /><button onClick={askCopilot} disabled={loading} style={{ width: "100%", marginTop: 8, padding: 12, color: "#1b1715", border: 0, background: "#d68656", cursor: "pointer" }}>{loading ? "Thinking..." : "Ask Copilot"}</button>{error && <p style={{ color: "#d99a91", fontSize: 11 }}>{error}</p>}{answer && <pre style={{ maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", color: "#d1cbc1", fontSize: 11, lineHeight: 1.5 }}>{answer}</pre>}</article>
        </section>
      </main>
    </div>
  );
}
