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
  const [step, setStep] = useState<"identifier" | "code" | "newAccount">("identifier");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState("");
  const navigate = useNavigate();

  const isEmail = identifier.includes("@");

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<any>("/auth/otp/request", { method: "POST", body: JSON.stringify({ identifier }) });
      if (res.devCode) setDevCode(res.devCode); // dev convenience only — backend omits this in production
      setStep("code");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: FormEvent, extra?: { name: string; businessName: string }) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api<any>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ identifier, code, ...extra }),
      });
      storeSession(data);
      initSync();
      navigate("/");
    } catch (err: any) {
      if (err.message.includes("First-time login")) {
        setStep("newAccount");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "var(--paper)" }}>
      <div style={{ width: 380, background: "var(--paper-raised)", padding: 32, border: "1px solid var(--rule)" }}>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>{import.meta.env.VITE_PRODUCT_NAME || "Buildwise"}</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 24 }}>
          Log in with your email or mobile number.
        </p>

        {step === "identifier" && (
          <form onSubmit={requestCode}>
            <Field label="Email or mobile number" value={identifier} onChange={setIdentifier} />
            {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
            <button type="submit" style={{ width: "100%" }} disabled={loading || !identifier}>
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={(e) => verifyCode(e)}>
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              Enter the 6-digit code sent to your {isEmail ? "email" : "phone"}.
            </p>
            {devCode && (
              <p style={{ fontSize: 12, color: "var(--gold)" }}>Dev mode — your code is {devCode}</p>
            )}
            <Field label="OTP code" value={code} onChange={setCode} />
            {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
            <button type="submit" style={{ width: "100%" }} disabled={loading || code.length !== 6}>
              {loading ? "Verifying…" : "Verify & continue"}
            </button>
            <button type="button" className="secondary" style={{ width: "100%", marginTop: 8 }} onClick={() => setStep("identifier")}>
              Use a different email/mobile
            </button>
          </form>
        )}

        {step === "newAccount" && (
          <form onSubmit={(e) => verifyCode(e, { name, businessName })}>
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              We don't recognize this {isEmail ? "email" : "number"} — set up your shop.
            </p>
            <Field label="Your name" value={name} onChange={setName} />
            <Field label="Business name" value={businessName} onChange={setBusinessName} />
            {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
            <button type="submit" style={{ width: "100%" }} disabled={loading || !name || !businessName}>
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block", marginBottom: 14, fontSize: 13, color: "var(--ink-soft)" }}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} required style={{ display: "block", width: "100%", marginTop: 4 }} />
    </label>
  );
}
