import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "../firebase";
import { useState } from "react";

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [resending, setResending]       = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendDone, setResendDone]     = useState(false);

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Block access until email is verified
  // Google Sign-In users are pre-verified (emailVerified = true from Google)
  if (!user.emailVerified) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--teal)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "32px 20px",
        fontFamily: "var(--font-body)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 64, marginBottom: 12 }} />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#fff", letterSpacing: "-0.01em" }}>Arizona Coalition</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#F5C842", marginTop: 4 }}>
            Comms Hub · 2026
          </div>
        </div>

        <div style={{
          background: "#fff", borderRadius: 16, padding: "40px 36px",
          width: "100%", maxWidth: 440,
          boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "#1D5C4A", marginBottom: 10, marginTop: 0 }}>
            Verify your email
          </h2>
          <p style={{ fontSize: 15, color: "#4A4558", lineHeight: 1.7, marginBottom: 8 }}>
            A verification link was sent to <strong>{user.email}</strong>.
          </p>
          <p style={{ fontSize: 14, color: "#888", lineHeight: 1.6, marginBottom: 24 }}>
            Click the link in that email to activate your account. Check your spam folder if you don't see it.
          </p>

          {resendDone && (
            <div style={{ background: "#f0faf5", border: "1px solid #a8dfc0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1a6640", marginBottom: 16 }}>
              ✓ Verification email resent!
            </div>
          )}

          <button
            onClick={async () => {
              if (resending || resendCooldown > 0) return;
              setResending(true);
              try {
                await sendEmailVerification(auth.currentUser);
                setResendDone(true);
                setResendCooldown(60);
                const t = setInterval(() => {
                  setResendCooldown(c => {
                    if (c <= 1) { clearInterval(t); return 0; }
                    return c - 1;
                  });
                }, 1000);
              } catch {}
              setResending(false);
            }}
            disabled={resending || resendCooldown > 0}
            style={{
              background: "none", border: "2px solid #1D5C4A", color: "#1D5C4A",
              borderRadius: 8, padding: "11px 24px", fontSize: 14, fontWeight: 700,
              fontFamily: "var(--font-body)",
              cursor: (resending || resendCooldown > 0) ? "not-allowed" : "pointer",
              opacity: (resending || resendCooldown > 0) ? 0.6 : 1,
              marginBottom: 20, width: "100%",
            }}
          >
            {resending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend verification email"}
          </button>

          <p style={{ fontSize: 13, color: "#aaa" }}>
            Once verified,{" "}
            <button
              onClick={() => window.location.reload()}
              style={{ background: "none", border: "none", color: "#1D5C4A", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
            >
              click here to continue
            </button>
            .
          </p>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #eee" }}>
            <button
              onClick={() => { auth.signOut(); }}
              style={{ background: "none", border: "none", color: "#aaa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
