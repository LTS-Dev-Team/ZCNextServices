import { Suspense } from "react";
import ResetPasswordForm from "@/components/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        background: "linear-gradient(160deg, #f0fbfd 0%, #e8f4f6 50%, #f5f5f5 100%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <Suspense fallback={<div className="form-card">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
