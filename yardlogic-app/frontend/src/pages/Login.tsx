import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  clearAuthSession,
  readStoredBusinesses,
  resolveBusinessForApplication,
  setApplicationPreference,
} from "../lib/appSelection";
import { initSync } from "../lib/syncManager";

function storeSession(data: any) {
  const preferredApplication = (localStorage.getItem("applicationPreference") as "IBIM" | "YARDLOGIC" | null) || "YARDLOGIC";
  localStorage.setItem("token", data.token);
  localStorage.setItem("businesses", JSON.stringify(data.businesses));
  const first = resolveBusinessForApplication(data.businesses || [], preferredApplication);
  if (!first) {
    localStorage.removeItem("businessId");
    throw new Error(`This account is not registered for ${preferredApplication}. Register a separate ${preferredApplication} account to continue.`);
  }
  localStorage.setItem("businessId", first);
}
export function Login() {
  const navigate = useNavigate();
  const [application] = useState<"IBIM" | "YARDLOGIC">(() => {
    const requested = new URLSearchParams(window.location.search).get("application");
    const selected = (requested === "IBIM" || requested === "YARDLOGIC"
      ? requested
      : localStorage.getItem("applicationPreference")
        || import.meta.env.VITE_APPLICATION_ID
        || "YARDLOGIC") as "IBIM" | "YARDLOGIC";

    if (requested === "IBIM" || requested === "YARDLOGIC") setApplicationPreference(requested);

    const savedBusinesses = readStoredBusinesses();

    const hasValidSavedBusiness = savedBusinesses.some((entry: any) => {
      const business = entry?.business ?? entry;
      return business?.id && business?.applicationId === selected;
    });

    if (localStorage.getItem("token") && !hasValidSavedBusiness) {
      clearAuthSession({ preserveApplicationPreference: true });
    }

    return selected;
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const savedBusinessId = localStorage.getItem("businessId");
    const validBusiness = readStoredBusinesses().some((entry: any) => {
      const business = entry?.business ?? entry;
      return business?.id === savedBusinessId && business?.applicationId === application;
    });

    if (!validBusiness) {
      clearAuthSession({ preserveApplicationPreference: true });
      return;
    }

    navigate(application === "IBIM" ? "/ibim" : "/", { replace: true });
  }, [application, navigate]);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      clearAuthSession({ preserveApplicationPreference: true });
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const body = mode === "login"
        ? { identifier: normalizedIdentifier, password, applicationId: application, ...(totpCode ? { totpCode } : {}) }
        : { identifier: normalizedIdentifier, password, name: name.trim(), businessName: businessName.trim(), applicationId: application };
      const data = await api<any>(path, { method: "POST", body: JSON.stringify(body) });
      storeSession(data);
      initSync();
      if (mode === "register") {
        void api("/auth/welcome-email", { method: "POST" }).catch(() => {});
      }
      navigate(application === "IBIM" ? "/ibim" : "/", { replace: true });
    } catch (err: any) {
      if (mode === "login" && err.message === "2FA code required") {
        setRequiresTotp(true);
      }
      if (mode === "login" && err.message === "Please verify your email before logging in") {
        setRequiresEmailVerification(true);
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

  async function resendVerification() {
    setError("");
    setForgotMessage("");
    try {
      await api("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: identifier.trim().toLowerCase() }) });
      setForgotMessage("If this account needs verification, a new verification email has been sent.");
    } catch (err: any) {
      setError(err.message || "Unable to resend verification email");
    }
  }

  return (
    <div className="auth-shell" style={{ minHeight: "100vh", padding: 20, display: "grid", placeItems: "center", background: "#142b2a url('https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=2200&q=85') center / cover fixed" }}>
      <div className="auth-frame" style={{ width: "min(1040px, 100%)", minHeight: 650, display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(340px, .9fr)", background: "rgba(12, 29, 28, .88)", border: "1px solid rgba(255,255,255,.22)", boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}>
        <section style={{ padding: "clamp(28px, 6vw, 72px)", color: "#f4f0e7", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "linear-gradient(145deg, rgba(17,61,58,.88), rgba(13,38,38,.68))" }}>
          <div>
            <p style={{ margin: 0, color: "#f0bf67", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase" }}>Operations, made visible</p>
            <h1 style={{ maxWidth: 500, margin: "24px 0 16px", fontSize: "clamp(36px, 5vw, 64px)", lineHeight: 1.02, letterSpacing: "-1px" }}>{import.meta.env.VITE_PRODUCT_NAME || "Buildwise"}<span style={{ color: "#f0bf67" }}>.</span></h1>
            <p style={{ maxWidth: 430, margin: 0, color: "rgba(244,240,231,.76)", fontSize: 16, lineHeight: 1.7 }}>A calmer command centre for the work that keeps your business moving.</p>
          </div>
          <div style={{ maxWidth: 420, paddingTop: 48 }}>
            <p style={{ margin: 0, color: "rgba(244,240,231,.58)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>One workspace</p>
            <p style={{ margin: "8px 0 0", color: "rgba(244,240,231,.84)", fontSize: 14, lineHeight: 1.6 }}>Keep decisions close to the data, teams aligned, and the next action clear.</p>
          </div>
        </section>
        <section className="auth-form-panel" style={{ padding: "clamp(26px, 5vw, 48px)", background: "rgba(250,249,244,.97)", color: "var(--ink)" }}>
        <div style={{ maxWidth: 380, margin: "0 auto" }}>
        <p style={{ margin: "0 0 8px", color: "var(--gold)", fontSize: 11, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase" }}>{mode === "login" ? "Welcome back" : "Start here"}</p>
        <h2 style={{ fontSize: 27, marginBottom: 6 }}>{mode === "login" ? "Sign in to continue" : "Create your workspace"}</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 12, marginBottom: 8 }}>Workspace: <strong>{application === "IBIM" ? "iBIM" : "YardLogic"}</strong> · <a href="/select-application">Change</a></p>
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
          <Field label="Email or mobile number" value={identifier} onChange={setIdentifier} />
          <Field label="Password" type="password" value={password} onChange={setPassword} />
          {mode === "login" && requiresTotp && <Field label="Authenticator code" value={totpCode} onChange={setTotpCode} />}
          {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
          {requiresEmailVerification && <button type="button" className="secondary" style={{ width: "100%", marginBottom: 8 }} onClick={resendVerification}>Resend verification email</button>}
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
        </section>
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
