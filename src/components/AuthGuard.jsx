import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "../firebase";
import { useState } from "react";

export default function AuthGuard({ children }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [resending, setResending]       = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendDone, setResendDone]     = useState(false);
  const [resendError, setResendError]   = useState("");

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Shared account-age calculation — used by both grace periods below.
  const createdAt = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime)
    : new Date();

  // Defense-in-depth alongside the firestore.rules fix on users/{uid}'s
  // create rule: a signed-in Firebase Auth user with no Firestore profile
  // doc is exactly the shape a bypass attempt (or a broken registration
  // that failed partway through) would produce. Previously this component
  // never checked profile existence at all — it only checked `user` and
  // emailVerified — so a request that got this far would have reached
  // every non-role-gated tool with zero enforcement at this layer.
  //
  // Grace period, same pattern as the emailVerified check below: this app
  // has been through several account-creation eras (no login → simple
  // login → Google sign-in → full waitlist/invite registration), and
  // earlier eras didn't necessarily produce the same Firestore profile
  // shape this check now expects. Rather than assume every existing
  // account has a matching profile doc, accounts created before this fix
  // shipped are grandfathered through entirely — this check only applies
  // going forward, to accounts created from this date on, which is what
  // actually matters for closing the invite-bypass gap (a newly-created
  // rogue account necessarily has a creation time after today).
  const profileRequiredCutoff = new Date("2026-07-25T00:00:00Z");
  const predatesProfileRequirement = createdAt < profileRequiredCutoff;

  if (!profile && !predatesProfileRequirement) {
    return (
      <div style={{
        minHeight: "100vh", background: "var(--teal)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "32px 20px", fontFamily: "var(--font-body)", textAlign: "center",
      }}>
        <div style={{
          background: "#fff", borderRadius: 16, padding: "40px 36px",
          width: "100%", maxWidth: 440, boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 10, marginTop: 0 }}>
            Account setup incomplete
          </h2>
          <p style={{ fontSize: 15, color: "var(--charcoal)", lineHeight: 1.7, marginBottom: 24 }}>
            We couldn't find a profile for this account. If you just registered, contact{" "}
            <a href="mailto:info@arizonacoalition.net" style={{ color: "var(--teal)" }}>info@arizonacoalition.net</a>{" "}
            for help.
          </p>
          <button
            onClick={() => auth.signOut()}
            style={{
              background: "none", border: "2px solid var(--teal)", color: "var(--teal)",
              borderRadius: 8, padding: "11px 24px", fontSize: 14, fontWeight: 700,
              fontFamily: "var(--font-body)", cursor: "pointer", width: "100%",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Block access until email is verified.
  // Grace period: accounts created before June 14 2026 (existing members) are let through.
  // Google Sign-In users are always pre-verified by Google.
  const graceCutoff = new Date("2026-06-14T00:00:00Z");
  const isExistingUser = createdAt < graceCutoff;

  if (!user.emailVerified && !isExistingUser) {
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
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 10, marginTop: 0 }}>
            Verify your email
          </h2>
          <p style={{ fontSize: 15, color: "var(--charcoal)", lineHeight: 1.7, marginBottom: 8 }}>
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

          {resendError && (
            <div style={{ background: "#fdf2f2", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e", marginBottom: 16 }}>
              {resendError}
            </div>
          )}

          <button
            onClick={async () => {
              if (resending || resendCooldown > 0) return;
              setResending(true);
              setResendError("");
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
              } catch (err) {
                // Firebase itself rate-limits this call server-side, separate
                // from our own 60s client-side cooldown — clicking resend
                // several times in a row can trip Firebase's own throttle.
                // That used to fail silently here, leaving the button reset
                // with no feedback and no way to tell whether anything was
                // actually sent. Surface it instead.
                setResendError(
                  err?.code === "auth/too-many-requests"
                    ? "Too many requests — please wait a few minutes before trying again, or check spam for an earlier email."
                    : "Couldn't resend the email right now. Please try again in a moment, or contact info@arizonacoalition.net for help."
                );
              }
              setResending(false);
            }}
            disabled={resending || resendCooldown > 0}
            style={{
              background: "none", border: "2px solid var(--teal)", color: "var(--teal)",
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
              style={{ background: "none", border: "none", color: "var(--teal)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
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
