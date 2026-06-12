import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { auth, db } from "../firebase";

const SOCIAL_PLATFORMS = ["Instagram", "Facebook", "TikTok", "X / Twitter", "Threads", "Bluesky", "Other"];
const googleProvider = new GoogleAuthProvider();

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
  const [googleLoading, setGoogleLoading] = useState(false);

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          fullName: user.displayName || "",
          email: user.email,
          role: "user",
          primarySocial: { platform: "", handle: "" },
          createdAt: serverTimestamp(),
          googleSignIn: true,
        });
      }
      navigate("/");
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(friendlyError(err.code));
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) { setError("Passwords don't match."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!form.primaryPlatform || !form.primaryHandle.trim()) {
      setError("Please enter your primary social media platform and handle."); return;
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
    <div style={pageStyle}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 64, marginBottom: 12 }} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#fff", letterSpacing: "-0.01em" }}>Arizona Coalition</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--gold)", marginTop: 4 }}>
          Comms Hub · 2026
        </div>
      </div>

      <div style={cardStyle}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 6, marginTop: 0 }}>
          Create Account
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-mute)", marginBottom: 24, marginTop: 0 }}>
          Coalition members only · Internal use
        </p>

        {/* Google button */}
        <button
          onClick={handleGoogle} disabled={googleLoading}
          style={{
            width: "100%", padding: "11px 16px", marginBottom: 16,
            background: "#fff", border: "2px solid var(--border)", borderRadius: 8,
            fontSize: 15, fontFamily: "var(--font-body)", fontWeight: 600, color: "var(--charcoal)",
            cursor: googleLoading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "border-color 0.15s, box-shadow 0.15s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--teal)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.08)"; }}
        >
          <GoogleIcon />
          {googleLoading ? "Signing up…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 12, color: "var(--text-mute)", fontWeight: 600, letterSpacing: "0.06em" }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <form onSubmit={handleSubmit} autoComplete="on" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div>
            <label style={labelStyle}>Full Name <Required /></label>
            <input type="text" value={form.fullName} onChange={set("fullName")} required autoComplete="name" placeholder="Jane Doe" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Email <Required /></label>
            <input type="email" value={form.email} onChange={set("email")} required autoComplete="email" placeholder="you@example.com" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Password <Required /></label>
            <div style={{ position: "relative" }}>
              <input type={showPassword ? "text" : "password"} value={form.password} onChange={set("password")}
                required autoComplete="new-password" placeholder="Min. 8 characters" style={{ ...inputStyle, paddingRight: 44 }} />
              <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1} style={eyeButtonStyle}>
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Confirm Password <Required /></label>
            <div style={{ position: "relative" }}>
              <input type={showConfirm ? "text" : "password"} value={form.confirmPassword} onChange={set("confirmPassword")}
                required autoComplete="new-password" placeholder="Re-enter password" style={{ ...inputStyle, paddingRight: 44 }} />
              <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1} style={eyeButtonStyle}>
                {showConfirm ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--surface-alt)", paddingTop: 8, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--teal)", marginBottom: 14 }}>
              Social Media Accounts
            </div>
            <label style={labelStyle}>Primary Account <Required /></label>
            <div style={{ display: "flex", gap: 10 }}>
              <select value={form.primaryPlatform} onChange={set("primaryPlatform")} required autoComplete="off"
                style={{ ...inputStyle, width: 160, flexShrink: 0 }}>
                <option value="">Platform…</option>
                {SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="text" value={form.primaryHandle} onChange={set("primaryHandle")}
                autoComplete="off" placeholder="@handle or username" style={{ ...inputStyle, flex: 1 }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              Secondary Account{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-mute)", fontSize: 11 }}>(optional)</span>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <select value={form.secondaryPlatform} onChange={set("secondaryPlatform")} autoComplete="off"
                style={{ ...inputStyle, width: 160, flexShrink: 0 }}>
                <option value="">Platform…</option>
                {SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="text" value={form.secondaryHandle} onChange={set("secondaryHandle")}
                autoComplete="off" placeholder="@handle or username" style={{ ...inputStyle, flex: 1 }} />
            </div>
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <button type="submit" disabled={loading}
            style={{ ...primaryBtnStyle, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

const pageStyle = {
  minHeight: "100vh", background: "var(--teal)",
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", padding: "24px",
};

const cardStyle = {
  background: "var(--bg)", borderRadius: 16, padding: "40px 36px",
  width: "100%", maxWidth: 460, boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
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
  letterSpacing: "0.04em", transition: "background 0.15s", width: "100%",
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
    case "auth/popup-blocked":
      return "Popup was blocked. Please allow popups for this site and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
