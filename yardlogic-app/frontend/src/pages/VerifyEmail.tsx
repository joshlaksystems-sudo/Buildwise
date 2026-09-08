import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Verifying your email...");
  useEffect(() => {
    api("/auth/verify-email", { method: "POST", body: JSON.stringify({ token: params.get("token") || "" }) })
      .then(() => setMessage("Email verified. You can now log in."))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Verification failed"));
  }, [params]);
  return <div className="auth-page"><div className="auth-card"><h1>YardLogic</h1><h2>Email verification</h2><p>{message}</p><button onClick={() => navigate("/login")}>Continue to login</button></div></div>;
}
