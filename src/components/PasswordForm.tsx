"use client";

import { useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = "idle" | "loading" | "success" | "error";

interface PasswordStrength {
  score: number;   // 0-4
  label: string;
  color: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: "", color: "transparent" };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  score = Math.min(score, 4);

  const map: Record<number, [string, string]> = {
    0: ["Very weak", "#ef4444"],
    1: ["Weak",      "#f97316"],
    2: ["Fair",      "#f59e0b"],
    3: ["Good",      "#84cc16"],
    4: ["Strong",    "#22c55e"],
  };
  return { score, label: map[score][0], color: map[score][1] };
}

// ── Eye Icon ──────────────────────────────────────────────────────────────────
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

// ── Input Field ───────────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  disabled?: boolean;
}

function Field({
  label, id, value, onChange, type = "text",
  placeholder, autoComplete, hint, disabled,
}: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: "13px", color: "var(--navy)", fontWeight: 500 }}>
        {label}
      </label>
      <div className="form-field-wrap">
        <input
          id={id}
          type={isPassword && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`form-input${isPassword ? " form-input--password" : ""}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            disabled={disabled}
            className="form-toggle-btn"
            aria-label={show ? "Hide password" : "Show password"}
          >
            <EyeIcon open={show} />
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize: "12px", color: "var(--muted)" }}>{hint}</p>}
    </div>
  );
}

// ── Password Strength Bar ─────────────────────────────────────────────────────
function StrengthBar({ password }: { password: string }) {
  const { score, label, color } = getStrength(password);
  if (!password) return null;

  return (
    <div style={{ marginTop: "-4px" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            style={{
              height: "3px",
              flex: 1,
              borderRadius: "2px",
              background: n <= score ? color : "var(--border)",
              transition: "background .3s",
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: "11px", color }}>{label}</p>
    </div>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────────────
export default function PasswordForm() {
  const [username,        setUsername]        = useState("");
  const [oldPassword,     setOldPassword]     = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status,          setStatus]          = useState<Status>("idle");
  const [message,         setMessage]         = useState("");

  const handleSubmit = useCallback(async () => {
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, oldPassword, newPassword, confirmPassword }),
      });

      const data: { success: boolean; message: string } = await res.json();
      setStatus(data.success ? "success" : "error");
      setMessage(data.message);

      if (data.success) {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Check your network connection.");
    }
  }, [username, oldPassword, newPassword, confirmPassword, status]);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    username && oldPassword && newPassword && confirmPassword &&
    !mismatch && status !== "loading";

  return (
    <div className="form-card">
      {/* Header */}
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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
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
          Change your password
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "14px", lineHeight: 1.6 }}>
          Sign in with your Active Directory account to update your password.
        </p>
      </div>

      {/* Form */}
      <div className="form-body">
        <Field
          label="Username"
          id="username"
          value={username}
          onChange={setUsername}
          placeholder="john.doe or DOMAIN\john"
          autoComplete="username"
          hint="Enter your username without @domain"
          disabled={status === "loading"}
        />

        <Field
          label="Current password"
          id="oldPassword"
          value={oldPassword}
          onChange={setOldPassword}
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          disabled={status === "loading"}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Field
            label="New password"
            id="newPassword"
            value={newPassword}
            onChange={setNewPassword}
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={status === "loading"}
          />
          <StrengthBar password={newPassword} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Field
            label="Confirm new password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={setConfirmPassword}
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={status === "loading"}
          />
          {mismatch && (
            <p style={{ fontSize: "12px", color: "var(--danger)" }}>
              Passwords do not match
            </p>
          )}
        </div>

        {/* Password policy hint */}
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(0,180,216,.06)",
            border: "1px solid rgba(0,180,216,.15)",
            borderRadius: "8px",
            fontSize: "12px",
            color: "var(--muted)",
            lineHeight: "1.8",
          }}
        >
          <strong style={{ color: "var(--primary-hi)", display: "block", marginBottom: "4px" }}>
            Password requirements:
          </strong>
          At least 8 characters · uppercase &amp; lowercase · numbers · special characters
        </div>

        {/* Result message */}
        {message && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              background: status === "success"
                ? "rgba(34,197,94,.08)"
                : "rgba(239,68,68,.08)",
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

        {/* Submit */}
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
          onMouseEnter={(e) => {
            if (canSubmit) {
              e.currentTarget.style.opacity = ".92";
              e.currentTarget.style.background = "#00A8C5";
            }
          }}
          onMouseLeave={(e) => {
            if (canSubmit) {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.background = "#00B4D8";
            }
          }}
        >
          {status === "loading" ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              <Spinner /> Changing password...
            </span>
          ) : (
            "Change password"
          )}
        </button>
      </div>

      {/* Footer */}
      <p style={{ textAlign: "center", marginTop: "24px", fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>
        This page is only available on the corporate internal network.
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16"
      style={{ animation: "spin 1s linear infinite" }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2"/>
      <path d="M8 2a6 6 0 016 6" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
