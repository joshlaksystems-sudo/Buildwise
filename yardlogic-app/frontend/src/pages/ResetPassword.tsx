import { FormEvent, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8 || password !== confirmation) {
      setError(password.length < 8 ? "Password must be at least 8 characters." : "Passwords do not match.");
      return;
    }
    try {
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token: params.get("token") || "", password }) });
      setMessage("Password reset successfully. You can now log in.");
      setTimeout(() => navigate("/login"), 900);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reset password");
    }
  }

  return <AuthCard title="Reset your password" subtitle="Choose a new password for your YardLogic account."><form onSubmit={submit}><Field label="New password" type="password" value={password} onChange={setPassword} /><Field label="Confirm password" type="password" value={confirmation} onChange={setConfirmation} />{error && <p className="auth-error">{error}</p>}{message && <p className="auth-success">{message}</p>}<button type="submit">Reset password</button></form><button className="secondary auth-link" onClick={() => navigate("/login")}>Back to login</button></AuthCard>;
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) { return <div className="auth-page"><div className="auth-card"><h1>YardLogic</h1><h2>{title}</h2><p>{subtitle}</p>{children}</div></div>; }
function Field({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (value: string) => void }) { return <label className="auth-field">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} required /></label>; }
