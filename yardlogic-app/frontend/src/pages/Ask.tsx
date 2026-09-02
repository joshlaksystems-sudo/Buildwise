import { FormEvent, useState } from "react";
import { api } from "../lib/api";

export function Ask() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAnswer("");
    try {
      const res = await api<{ answer: string }>("/ai/ask", { method: "POST", body: JSON.stringify({ question }) });
      setAnswer(res.answer);
    } catch (err: any) {
      setAnswer(`Couldn't get an answer: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Ask your business</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 24 }}>
        Ask in plain language — "how much did I sell last week", "who owes me money".
      </p>

      <form onSubmit={submit} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          style={{ flex: 1 }}
          placeholder="Type a question about your business…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className="gold" type="submit" disabled={loading || !question}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {answer && (
        <div style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20 }}>
          {answer}
        </div>
      )}
    </div>
  );
}
