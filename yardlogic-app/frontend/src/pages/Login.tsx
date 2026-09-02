import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { initSync } from "../lib/syncManager";

function storeSession(data: any) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("businesses", JSON.stringify(data.businesses));
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
        : { identifier: normalizedIdentifier, password, name: name.trim(), businessName: businessName.trim() };
      const data = await api<any>(path, { method: "POST", body: JSON.stringify(body) });
      storeSession(data);
      initSync();
      if (mode === "register") {
        void api("/auth/welcome-email", { method: "POST" }).catch(() => {});
      }
      navigate("/");
    } catch (err: any) {
      if (mode === "login" && err.message === "2FA code required") {
        setRequiresTotp(true);
      }
      setError(err.message || "Unable to continue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "var(--paper)" }}>
      <div style={{ width: 380, background: "var(--paper-raised)", padding: 32, border: "1px solid var(--rule)" }}>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>{import.meta.env.VITE_PRODUCT_NAME || "Buildwise"}</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 24 }}>
          {mode === "login" ? "Log in with your email and password." : "Create your account with email and password."}
        </p>

        <form onSubmit={submit}>
          {mode === "register" && <Field label="Your name" value={name} onChange={setName} />}
          {mode === "register" && <Field label="Business name" value={businessName} onChange={setBusinessName} />}
          <Field label="Email or mobile number" value={identifier} onChange={setIdentifier} />
          <Field label="Password" type="password" value={password} onChange={setPassword} />
          {mode === "login" && requiresTotp && <Field label="Authenticator code" value={totpCode} onChange={setTotpCode} />}
          {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
          <button type="submit" style={{ width: "100%" }} disabled={loading || !identifier || password.length < 8 || (mode === "register" && (!name || !businessName))}>
            {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="secondary"
          style={{ width: "100%", marginTop: 8 }}
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        >
          {mode === "login" ? "Create a new account" : "Already have an account? Log in"}
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
