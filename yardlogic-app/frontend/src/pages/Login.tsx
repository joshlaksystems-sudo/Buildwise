import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { initSync } from "../lib/syncManager";

function storeSession(data: any) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("businesses", JSON.stringify(data.businesses));
  localStorage.setItem("applicationPreference", data.applicationPreference || data.user?.applicationPreference || "YARDLOGIC");
  const first = data.businesses?.[0]?.business?.id ?? data.businesses?.[0]?.businessId;
  if (first) localStorage.setItem("businessId", first);
}

export function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [applicationPreference, setApplicationPreference] = useState<"YARDLOGIC" | "IBIM">("YARDLOGIC");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (mode !== "login") setRequiresTotp(false);
    const normalizedIdentifier = identifier.trim().toLowerCase();
    if (!normalizedIdentifier || (!/^\S+@\S+\.\S+$/.test(normalizedIdentifier) && !/^\+?[0-9][0-9\s-]{7,19}$/.test(normalizedIdentifier))) {
      setError("Enter a valid email address or mobile number.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (mode === "register" && name.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (mode === "register" && businessName.trim().length < 2) {
      setError("Enter your business name.");
      return;
    }
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const body = mode === "login"
        ? { identifier: normalizedIdentifier, password, ...(totpCode ? { totpCode } : {}) }
        : { identifier: normalizedIdentifier, password, name: name.trim(), businessName: businessName.trim(), applicationPreference };
      const data = await api<any>(path, { method: "POST", body: JSON.stringify(body) });
      storeSession(data);
      initSync();
      if (mode === "register") {
        void api("/auth/welcome-email", { method: "POST" }).catch(() => {});
      }
      const selectedApplication = mode === "register" ? applicationPreference : data.applicationPreference;
      navigate(selectedApplication === "IBIM" ? "/ibim" : "/");
    } catch (err: any) {
      if (mode === "login" && err.message === "2FA code required") {
        setRequiresTotp(true);
      }
      setError(err.message || "Unable to continue");
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset() {
    setError("");
    setForgotMessage("");
    try {
      await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: identifier.trim().toLowerCase() }) });
      setForgotMessage("If an account exists for that email, a reset link has been sent.");
    } catch (err: any) {
      setError(err.message || "Unable to request a reset link");
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "var(--paper)" }}>
      <div style={{ width: 380, background: "var(--paper-raised)", padding: 32, border: "1px solid var(--rule)" }}>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>{import.meta.env.VITE_PRODUCT_NAME || "Buildwise"}</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 24 }}>
          {mode === "login" ? "Log in with your email and password." : "Create your account with email and password."}
        </p>

        {forgotMode ? <div>
          <Field label="Account email" value={identifier} onChange={setIdentifier} />
          {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
          {forgotMessage && <p style={{ color: "var(--green)", fontSize: 13 }}>{forgotMessage}</p>}
          <button type="button" style={{ width: "100%" }} disabled={!/^\S+@\S+\.\S+$/.test(identifier)} onClick={requestPasswordReset}>Send reset link</button>
        </div> : <form onSubmit={submit}>
          {mode === "register" && <Field label="Your name" value={name} onChange={setName} />}
          {mode === "register" && <Field label="Business name" value={businessName} onChange={setBusinessName} />}
          {mode === "register" && <PreferenceChoice value={applicationPreference} onChange={setApplicationPreference} />}
          <Field label="Email or mobile number" value={identifier} onChange={setIdentifier} />
          <Field label="Password" type="password" value={password} onChange={setPassword} />
          {mode === "login" && requiresTotp && <Field label="Authenticator code" value={totpCode} onChange={setTotpCode} />}
          {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
          <button type="submit" style={{ width: "100%" }} disabled={loading || !identifier || password.length < 8 || (mode === "register" && (!name || !businessName))}>
            {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>}

        {mode === "login" && !forgotMode && <button type="button" className="secondary" style={{ width: "100%", marginTop: 8 }} onClick={() => { setForgotMode(true); setError(""); }}>Forgot password?</button>}

        <button
          type="button"
          className="secondary"
          style={{ width: "100%", marginTop: 8 }}
          onClick={() => { if (forgotMode) { setForgotMode(false); setForgotMessage(""); return; } setMode(mode === "login" ? "register" : "login"); setError(""); }}
        >
          {forgotMode ? "Back to login" : mode === "login" ? "Create a new account" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block", marginBottom: 14, fontSize: 13, color: "var(--ink-soft)" }}>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required minLength={type === "password" ? 8 : undefined} style={{ display: "block", width: "100%", marginTop: 4 }} />
    </label>
  );
}

function PreferenceChoice({ value, onChange }: { value: "YARDLOGIC" | "IBIM"; onChange: (value: "YARDLOGIC" | "IBIM") => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
      <legend style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>Choose your workspace</legend>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(["YARDLOGIC", "IBIM"] as const).map((option) => (
          <button key={option} type="button" onClick={() => onChange(option)} style={{ padding: "12px 8px", textAlign: "left", border: `1px solid ${value === option ? "var(--ink)" : "var(--rule)"}`, background: value === option ? "var(--paper)" : "var(--paper-raised)" }}>
            <strong style={{ display: "block", fontSize: 12 }}>{option === "IBIM" ? "IBim Consulting" : "YardLogic ERP"}</strong>
            <span style={{ display: "block", marginTop: 4, color: "var(--ink-soft)", fontSize: 10 }}>{option === "IBIM" ? "Tekla, projects & training" : "Billing, stock & finance"}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
