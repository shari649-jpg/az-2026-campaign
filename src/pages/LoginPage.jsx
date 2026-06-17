import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, limit, getDocs, updateDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { auth, db } from "../firebase";

const googleProvider = new GoogleAuthProvider();

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Already has an approved account — let them through.
      const existingSnap = await getDoc(doc(db, "users", user.uid));
      if (existingSnap.exists()) {
        navigate("/");
        return;
      }

      // First-time Google sign-in: only allow if their email matches an
      // approved (invited) waitlist entry. This prevents anyone with a
      // Google account from skipping the waitlist entirely.
      const emailLower = (user.email || "").toLowerCase().trim();
      const waitlistQ = query(
        collection(db, "waitlist"),
        where("email", "==", emailLower),
        where("status", "==", "invited"),
        limit(1)
      );
      const waitlistSnap = await getDocs(waitlistQ);

      if (waitlistSnap.empty) {
        // Not an approved member — sign them back out and send to waitlist.
        await signOut(auth);
        setError("This Google account hasn't been approved yet. Please request access below — our team will review your application.");
        setGoogleLoading(false);
        return;
      }

      const waitlistDoc = waitlistSnap.docs[0];

      // Create the Firestore user doc now that approval is confirmed.
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        fullName: user.displayName || waitlistDoc.data().fullName || "",
        email: user.email,
        role: "user",
        primarySocial: { platform: "", handle: "" },
        createdAt: serverTimestamp(),
        googleSignIn: true,
      });

      // Mark the waitlist entry as registered so it isn't reused.
      try {
        await updateDoc(doc(db, "waitlist", waitlistDoc.id), { status: "registered", registeredAt: new Date() });
      } catch {}

      navigate("/");
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(friendlyError(err.code));
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
    } catch (err) {
      setError(friendlyError(err.code));
    }
  }

  if (showReset) {
    return (
      <div style={pageStyle}>
        <LogoBlock />
        <div style={cardStyle}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 6, marginTop: 0 }}>
            Reset Password
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-mute)", marginBottom: 28, marginTop: 0 }}>
            We'll send a reset link to your email.
          </p>

          {resetSent ? (
            <div style={{ background: "#f0faf5", border: "1px solid #a8dfc0", borderRadius: 8, padding: "14px 16px", fontSize: 14, color: "#1a6640", marginBottom: 20 }}>
              ✓ Reset email sent! Check your inbox and follow the link.
            </div>
          ) : (
            <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email" value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  required autoComplete="email"
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>
              {error && <div style={errorStyle}>{error}</div>}
              <button type="submit" style={primaryBtnStyle}>Send Reset Email</button>
            </form>
          )}

          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button onClick={() => { setShowReset(false); setResetSent(false); setError(""); }}
              style={{ background: "none", border: "none", color: "var(--teal)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              ← Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <LogoBlock />
      <div style={cardStyle}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 6, marginTop: 0 }}>
          Sign In
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-mute)", marginBottom: 24, marginTop: 0 }}>
          Coalition members only · Internal use
        </p>

        {/* Google button */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          style={{
            width: "100%", padding: "11px 16px", marginBottom: 16,
            background: "#fff", border: "2px solid var(--border)",
            borderRadius: 8, fontSize: 15, fontFamily: "var(--font-body)",
            fontWeight: 600, color: "var(--charcoal)",
            cursor: googleLoading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "border-color 0.15s, box-shadow 0.15s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--teal)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.08)"; }}
        >
          <GoogleIcon />
          {googleLoading ? "Signing in…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 12, color: "var(--text-mute)", fontWeight: 600, letterSpacing: "0.06em" }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <form onSubmit={handleSubmit} autoComplete="on" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoFocus autoComplete="email"
              placeholder="you@example.com" style={inputStyle}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
              <button type="button" onClick={() => setShowReset(true)}
                style={{ background: "none", border: "none", fontSize: 12, color: "var(--teal)", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                Forgot password?
              </button>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="current-password"
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                tabIndex={-1} style={eyeButtonStyle} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <button type="submit" disabled={loading} style={{ ...primaryBtnStyle, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "var(--text-mute)" }}>
          New to Comms Hub?{" "}
          <Link to="/waitlist" style={{ color: "var(--teal)", fontWeight: 700, textDecoration: "none" }}>Create account</Link>
        </div>
      </div>
    </div>
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
  width: "100%", maxWidth: 420, boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
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
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email or password is incorrect. Please try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your administrator.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/popup-blocked":
      return "Popup was blocked. Please allow popups for this site and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
