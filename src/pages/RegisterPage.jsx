import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { auth, db } from "../firebase";

const SOCIAL_PLATFORMS = ["Instagram", "Facebook", "TikTok", "X / Twitter", "Threads", "Other"];

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: "", email: "", password: "", confirmPassword: "",
    primaryPlatform: "", primaryHandle: "",
    secondaryPlatform: "", secondaryHandle: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!form.primaryPlatform || !form.primaryHandle.trim()) {
      setError("Please enter your primary social media platform and handle.");
      return;
    }

    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(user, { displayName: form.fullName.trim() });

      const userDoc = {
        uid: user.uid,
        fullName: form.fullName.trim(),
        email: form.email.toLowerCase().trim(),
        role: "user",
        primarySocial: { platform: form.primaryPlatform, handle: form.primaryHandle.trim() },
        createdAt: serverTimestamp(),
      };

      if (form.secondaryPlatform && form.secondaryHandle.trim()) {
        userDoc.secondarySocial = { platform: form.secondaryPlatform, handle: form.secondaryHandle.trim() };
      }

      await setDoc(doc(db, "users", user.uid), userDoc);
      navigate("/");
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--teal)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "24px",
    }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 64, marginBottom: 12, filter: "brightness(0) invert(1)" }} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#fff", letterSpacing: "-0.01em" }}>Arizona Coalition</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--gold)", marginTop: 4 }}>
          Comms Hub · 2026
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: "var(--bg)", borderRadius: 16, padding: "40px 36px",
        width: "100%", maxWidth: 460, boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
      }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 6, marginTop: 0 }}>
          Create Account
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-mute)", marginBottom: 28, marginTop: 0 }}>
          Coalition members only · Internal use
        </p>

        <form onSubmit={handleSubmit} autoComplete="on" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Full name */}
          <div>
            <label style={labelStyle}>Full Name <Required /></label>
            <input
              type="text" value={form.fullName} onChange={set("fullName")}
              required autoComplete="name" placeholder="Jane Doe" style={inputStyle}
            />
          </div>

          {/* Email */}
          <div>
            <label style={labelStyle}>Email <Required /></label>
            <input
              type="email" value={form.email} onChange={set("email")}
              required autoComplete="email" placeholder="you@example.com" style={inputStyle}
            />
          </div>

          {/* Password */}
          <div>
            <label style={labelStyle}>Password <Required /></label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={form.password} onChange={set("password")}
                required autoComplete="new-password"
                placeholder="Min. 8 characters"
                style={{ ...inputStyle, paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                tabIndex={-1} style={eyeButtonStyle} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label style={labelStyle}>Confirm Password <Required /></label>
            <div style={{ position: "relative" }}>
              <input
                type={showConfirm ? "text" : "password"}
                value={form.confirmPassword} onChange={set("confirmPassword")}
                required autoComplete="new-password"
                placeholder="Re-enter password"
                style={{ ...inputStyle, paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                tabIndex={-1} style={eyeButtonStyle} aria-label={showConfirm ? "Hide password" : "Show password"}>
                {showConfirm ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          {/* Social media section */}
          <div style={{ borderTop: "1px solid var(--surface-alt)", paddingTop: 8, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--teal)", marginBottom: 14 }}>
              Social Media Accounts
            </div>

            <label style={labelStyle}>Primary Account <Required /></label>
            <div style={{ display: "flex", gap: 10 }}>
              <select
                value={form.primaryPlatform} onChange={set("primaryPlatform")}
                required autoComplete="off"
                style={{ ...inputStyle, width: 160, flexShrink: 0 }}
              >
                <option value="">Platform…</option>
                {SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input
                type="text" value={form.primaryHandle} onChange={set("primaryHandle")}
                autoComplete="off" placeholder="@handle or username"
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>

          {/* Secondary social */}
          <div>
            <label style={labelStyle}>
              Secondary Account{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-mute)", fontSize: 11 }}>(optional)</span>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <select
                value={form.secondaryPlatform} onChange={set("secondaryPlatform")}
                autoComplete="off"
                style={{ ...inputStyle, width: 160, flexShrink: 0 }}
              >
                <option value="">Platform…</option>
                {SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input
                type="text" value={form.secondaryHandle} onChange={set("secondaryHandle")}
                autoComplete="off" placeholder="@handle or username"
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>

          {error && (
            <div style={{ background: "#fdf2f2", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e" }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: 4, background: loading ? "var(--teal-mid)" : "var(--teal)",
              color: "#fff", border: "none", borderRadius: 8, padding: "13px 0",
              fontSize: 15, fontWeight: 700, fontFamily: "var(--font-body)",
              letterSpacing: "0.04em", cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "var(--text-mute)" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--teal)", fontWeight: 700, textDecoration: "none" }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}

function Required() {
  return <span style={{ color: "var(--terracotta)", marginLeft: 2 }}>*</span>;
}

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

const eyeButtonStyle = {
  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", cursor: "pointer",
  color: "var(--text-mute)", padding: 2, display: "flex", alignItems: "center",
};

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

function friendlyError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
