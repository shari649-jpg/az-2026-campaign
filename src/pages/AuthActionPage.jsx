// src/pages/AuthActionPage.jsx
//
// Owned replacement for Firebase's default hosted auth-action page
// (previously the confirmed-broken /__/auth/action — no branding, no link
// back to arizonacoalition.net, generic Firebase UI). Aug 2026, TODO #1.
//
// Firebase sends the SAME family of query params for password reset,
// email verification, and email-change-revert links — mode + oobCode
// (+ an optional continueUrl). This single page handles all three, since
// they're "the same underlying page family" per the TODO that flagged
// this. Only resetPassword and verifyEmail were explicitly asked for;
// recoverEmail is included too since it's the same mechanism and nearly
// free to cover, but flag it back to the person if that wasn't wanted —
// easy to strip out.
//
// IMPORTANT — this page does nothing on its own until a Firebase Console
// setting is changed. For each of the "Password reset" and "Email address
// verification" templates (Authentication → Templates → pencil icon →
// "Customize action URL"), set the URL to this page's live address, e.g.
// https://arizonacoalition.net/auth-action — otherwise Firebase's emailed
// links keep pointing at its own default hosted page and this page is
// never reached. No Firestore involved anywhere in this file — this is
// entirely a Firebase Auth (client SDK) flow, the same SDK already used
// throughout LoginPage.jsx/RegisterPage.jsx.

import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  verifyPasswordResetCode, confirmPasswordReset,
  applyActionCode, checkActionCode,
} from "firebase/auth";
import { auth } from "../firebase";

export default function AuthActionPage() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");
  // Firebase appends this automatically when actionCodeSettings.url was
  // set on the link's generating call — not currently set anywhere in
  // this codebase (sendPasswordResetEmail/sendEmailVerification are both
  // called with no actionCodeSettings, see LoginPage.jsx/RegisterPage.jsx),
  // so this will normally be absent. Handled anyway in case that changes
  // later, or an admin-generated link (Admin SDK) sets one.
  const continueUrl = searchParams.get("continueUrl");

  if (mode === "resetPassword") return <ResetPasswordFlow oobCode={oobCode} continueUrl={continueUrl} />;
  if (mode === "verifyEmail")   return <VerifyEmailFlow oobCode={oobCode} continueUrl={continueUrl} />;
  if (mode === "recoverEmail")  return <RecoverEmailFlow oobCode={oobCode} />;

  return (
    <Shell>
      <ErrorState
        title="Invalid link"
        message="This link is missing required information, or the mode isn't one this page recognizes. Request a new link and try again."
      />
    </Shell>
  );
}

// ── Password reset ──────────────────────────────────────────────────────
function ResetPasswordFlow({ oobCode, continueUrl }) {
  const [status, setStatus] = useState("checking"); // checking | ready | success | error
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!oobCode) { setStatus("error"); return; }
    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => { setEmail(verifiedEmail); setStatus("ready"); })
      .catch((err) => { setError(friendlyActionError(err.code)); setStatus("error"); });
  }, [oobCode]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPw) { setError("Passwords don't match."); return; }
    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus("success");
    } catch (err) {
      setError(friendlyActionError(err.code));
    }
    setSubmitting(false);
  }

  if (status === "checking") {
    return <Shell><LoadingState text="Checking your reset link…" /></Shell>;
  }

  if (status === "error") {
    return <Shell><ErrorState title="This link isn't valid" message={error || "It may have expired or already been used."} /></Shell>;
  }

  if (status === "success") {
    return (
      <Shell>
        <SuccessState
          title="Password updated"
          message="Your password has been changed. You can sign in with it now."
          ctaText="Go to Sign In"
          ctaHref={continueUrl || "/login"}
        />
      </Shell>
    );
  }

  // status === "ready"
  return (
    <Shell>
      <h1 style={titleStyle}>Reset your password</h1>
      <p style={subtitleStyle}>for {email}</p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
        <div>
          <label style={labelStyle}>New password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password} onChange={e => setPassword(e.target.value)}
              required autoFocus autoComplete="new-password"
              placeholder="Min. 8 characters" style={{ ...inputStyle, paddingRight: 44 }}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              tabIndex={-1} style={eyeButtonStyle} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff /> : <EyeOn />}
            </button>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Confirm new password</label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
            required autoComplete="new-password"
            placeholder="Re-enter password" style={inputStyle}
          />
        </div>
        {error && <div style={errorStyle}>{error}</div>}
        <button type="submit" disabled={submitting} style={{ ...primaryBtnStyle, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </Shell>
  );
}

// ── Email verification ──────────────────────────────────────────────────
function VerifyEmailFlow({ oobCode, continueUrl }) {
  const [status, setStatus] = useState("checking"); // checking | success | error
  const [error, setError] = useState("");

  useEffect(() => {
    if (!oobCode) { setStatus("error"); return; }
    applyActionCode(auth, oobCode)
      .then(() => setStatus("success"))
      .catch((err) => { setError(friendlyActionError(err.code)); setStatus("error"); });
  }, [oobCode]);

  if (status === "checking") {
    return <Shell><LoadingState text="Verifying your email…" /></Shell>;
  }
  if (status === "error") {
    return <Shell><ErrorState title="This link isn't valid" message={error || "It may have expired or already been used."} /></Shell>;
  }
  return (
    <Shell>
      <SuccessState
        title="Email verified"
        message="Your email address has been confirmed."
        ctaText="Continue to Comms Hub"
        ctaHref={continueUrl || "/"}
      />
    </Shell>
  );
}

// ── Email change revert (bonus — same page family, see file header) ─────
function RecoverEmailFlow({ oobCode }) {
  const [status, setStatus] = useState("checking"); // checking | success | error
  const [error, setError] = useState("");
  const [restoredEmail, setRestoredEmail] = useState("");

  useEffect(() => {
    if (!oobCode) { setStatus("error"); return; }
    checkActionCode(auth, oobCode)
      .then((info) => {
        setRestoredEmail(info?.data?.email || "");
        return applyActionCode(auth, oobCode);
      })
      .then(() => setStatus("success"))
      .catch((err) => { setError(friendlyActionError(err.code)); setStatus("error"); });
  }, [oobCode]);

  if (status === "checking") {
    return <Shell><LoadingState text="Reverting your email change…" /></Shell>;
  }
  if (status === "error") {
    return <Shell><ErrorState title="This link isn't valid" message={error || "It may have expired or already been used."} /></Shell>;
  }
  return (
    <Shell>
      <SuccessState
        title="Email change reverted"
        message={restoredEmail ? `Your account email has been restored to ${restoredEmail}.` : "Your account email has been restored."}
        ctaText="Go to Sign In"
        ctaHref="/login"
      />
    </Shell>
  );
}

// ── Shared shell / states — matches LoginPage.jsx's visual language ─────
function Shell({ children }) {
  return (
    <div style={pageStyle}>
      <LogoBlock />
      <div style={cardStyle}>
        {children}
        <div style={{ textAlign: "center", marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
          <a href="https://www.arizonacoalition.net" style={backLinkStyle}>
            ← Back to arizonacoalition.net
          </a>
        </div>
      </div>
    </div>
  );
}

function LoadingState({ text }) {
  return <p style={{ fontSize: 15, color: "var(--text-mute)", textAlign: "center", padding: "20px 0" }}>{text}</p>;
}

function ErrorState({ title, message }) {
  return (
    <>
      <h1 style={titleStyle}>{title}</h1>
      <p style={{ ...subtitleStyle, marginBottom: 20 }}>{message}</p>
      <Link to="/login" style={{ ...primaryBtnStyle, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
        Go to Sign In
      </Link>
    </>
  );
}

function SuccessState({ title, message, ctaText, ctaHref }) {
  const isExternalOrRelative = ctaHref.startsWith("http");
  return (
    <>
      <h1 style={titleStyle}>✓ {title}</h1>
      <p style={{ ...subtitleStyle, marginBottom: 20 }}>{message}</p>
      {isExternalOrRelative ? (
        <a href={ctaHref} style={{ ...primaryBtnStyle, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
          {ctaText}
        </a>
      ) : (
        <Link to={ctaHref} style={{ ...primaryBtnStyle, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
          {ctaText}
        </Link>
      )}
    </>
  );
}

function LogoBlock() {
  return (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 64, marginBottom: 12 }} />
      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#fff", letterSpacing: "-0.01em" }}>Arizona Coalition</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--gold)", marginTop: 4 }}>
        Comms Hub · 2026
      </div>
    </div>
  );
}

function EyeOn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

// Extends LoginPage.jsx's friendlyError with the action-link-specific
// codes that only ever occur on this page (expired/invalid/already-used
// oobCode, weak new password) — LoginPage's own version doesn't cover
// these since sign-in never encounters them.
function friendlyActionError(code) {
  switch (code) {
    case "auth/expired-action-code":
      return "This link has expired. Request a new one and try again.";
    case "auth/invalid-action-code":
      return "This link has already been used or is invalid. Request a new one and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your administrator.";
    case "auth/user-not-found":
      return "We couldn't find an account for this link.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Something went wrong. Please request a new link and try again.";
  }
}

const pageStyle = {
  minHeight: "100vh", background: "var(--teal)",
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", padding: "24px",
};

const cardStyle = {
  background: "var(--bg)", borderRadius: 16, padding: "40px 36px",
  width: "100%", maxWidth: 420, boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
};

const titleStyle = {
  fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)",
  marginBottom: 6, marginTop: 0,
};

const subtitleStyle = {
  fontSize: 14, color: "var(--text-mute)", marginBottom: 24, marginTop: 0,
};

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--charcoal)", marginBottom: 6,
};

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "11px 14px",
  fontSize: 15, fontFamily: "var(--font-body)",
  border: "2px solid var(--border)", borderRadius: 8,
  background: "var(--bg)", color: "var(--charcoal)",
  outline: "none", transition: "border-color 0.15s",
};

const primaryBtnStyle = {
  marginTop: 4, background: "var(--teal)", color: "#fff",
  border: "none", borderRadius: 8, padding: "13px 0",
  fontSize: 15, fontWeight: 700, fontFamily: "var(--font-body)",
  letterSpacing: "0.04em", cursor: "pointer", transition: "background 0.15s",
  width: "100%",
};

const eyeButtonStyle = {
  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", cursor: "pointer",
  color: "var(--text-mute)", padding: 2, display: "flex", alignItems: "center",
};

const errorStyle = {
  background: "#fdf2f2", border: "1px solid #f5c6c6",
  borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e",
};

const backLinkStyle = {
  fontSize: 13, color: "var(--text-mute)", fontWeight: 600, textDecoration: "none",
};
