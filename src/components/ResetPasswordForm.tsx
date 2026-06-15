"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "idle" | "loading" | "success" | "error";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = useMemo(
    () => searchParams.get("token")?.replace(/ /g, "+").trim() ?? "",
    [searchParams]
  );
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = useCallback(async () => {
    if (status === "loading" || !token) return;
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data: { success: boolean; message: string } = await res.json();
      setStatus(data.success ? "success" : "error");
      setMessage(data.message);
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Check your network connection.");
    }
  }, [token, status]);

  const canSubmit = Boolean(token) && status !== "loading";

  return (
    <div className="form-card">
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            margin: "0 auto 20px",
            background: "linear-gradient(135deg, #00B4D8 0%, #003B46 100%)",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 24px rgba(0,180,216,.25)",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            marginBottom: "8px",
            letterSpacing: "-.02em",
            color: "var(--navy)",
          }}
        >
          Reset your password
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "14px", lineHeight: 1.6 }}>
          Click the button below to reset your Active Directory password. A new temporary password
          will be emailed to the address linked to your portal account.
        </p>
      </div>

      <div className="form-body">
        {!token && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              background: "rgba(239,68,68,.08)",
              border: "1px solid rgba(239,68,68,.2)",
              color: "var(--danger)",
            }}
          >
            This reset link is invalid or missing. Open reset password from the portal again.
          </div>
        )}

        {message && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              background:
                status === "success" ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)",
              border: `1px solid ${status === "success" ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`,
              color: status === "success" ? "var(--success)" : "var(--danger)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>{status === "success" ? "✓" : "✕"}</span>
            {message}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: "14px",
            background: canSubmit ? "#00B4D8" : "var(--border)",
            border: "none",
            borderRadius: "10px",
            color: canSubmit ? "white" : "var(--muted)",
            fontSize: "15px",
            fontWeight: 600,
            fontFamily: "var(--sans)",
            cursor: canSubmit ? "pointer" : "not-allowed",
            transition: "opacity .2s, transform .15s, background .2s",
            letterSpacing: ".01em",
            boxShadow: canSubmit ? "0 4px 20px rgba(0,180,216,.4)" : "none",
          }}
        >
          {status === "loading" ? "Resetting password..." : "Reset password"}
        </button>
      </div>
    </div>
  );
}
