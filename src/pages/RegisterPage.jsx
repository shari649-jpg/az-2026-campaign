import { useState, useEffect } from "react";
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from "firebase/auth";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { auth, db } from "../firebase";

const SOCIAL_PLATFORMS = ["Instagram","Facebook","TikTok","X / Twitter","Threads","Bluesky","Other"];
const MAX_SOCIALS = 6;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  // Token validation state
  const [tokenStatus, setTokenStatus]   = useState("checking"); // checking | valid | invalid | expired | used
  const [inviteData, setInviteData]     = useState(null);

  // Form state
  const [form, setForm] = useState({
    fullName: "", email: "", password: "", confirmPassword: "",
  });
  const [socials, setSocials] = useState([{ platform: "", handle: "" }]);
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [error, setError]                 = useState("");
  const [loading, setLoading]             = useState(false);

  // Post-registration state
  const [registered, setRegistered]       = useState(false);
  const [resending, setResending]         = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendError, setResendError]     = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Validate invite token on mount via Netlify function
  useEffect(() => {
    if (!token) { setTokenStatus("invalid"); return; }

    async function validateToken() {
      try {
        const res = await fetch("/.netlify/functions/validate-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!data.valid) {
          setTokenStatus(data.reason || "invalid");
          return;
        }
        setInviteData(data);
        setForm(f => ({ ...f, fullName: data.fullName || "", email: data.email || "" }));
        setTokenStatus("valid");
      } catch (err) {
        console.error("Token validation error:", err);
        setTokenStatus("invalid");
      }
    }
    validateToken();
  }, [token]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  function setField(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  // Social media row handlers
  function setSocialField(index, field, value) {
    setSocials(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }
  function addSocial() {
    if (socials.length < MAX_SOCIALS) setSocials(prev => [...prev, { platform: "", handle: "" }]);
  }
  function removeSocial(index) {
    if (socials.length <= 1) return;
    setSocials(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) { setError("Passwords don't match."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!socials[0].platform || !socials[0].handle.trim()) {
      setError("Please enter your primary social media platform and handle."); return;
    }
    if (!agreedToTerms) {
      setError("You must agree to the Terms, Privacy Policy, and Ethical Use of AI Policy to create an account."); return;
    }

    setLoading(true);
    try {
      // Create Firebase Auth account
      const { user } = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(user, { displayName: form.fullName.trim() });

      // Send Firebase email verification
      await sendEmailVerification(user);

      // Build social media array (filter out incomplete rows)
      const socialAccounts = socials
        .filter(s => s.platform && s.handle.trim())
        .map(s => ({ platform: s.platform, handle: s.handle.trim() }));

      // Write Firestore user doc
      await setDoc(doc(db, "users", user.uid), {
        uid:             user.uid,
        fullName:        form.fullName.trim(),
        email:           form.email.toLowerCase().trim(),
        role:            "user",
        emailVerified:   false,
        socialAccounts,
        // Keep legacy fields for backward compat with AdminPage display
        primarySocial:   socialAccounts[0] || { platform: "", handle: "" },
        ...(socialAccounts[1] ? { secondarySocial: socialAccounts[1] } : {}),
        createdAt:       serverTimestamp(),
        policyAcceptance: { version: "2026-07-04", acceptedAt: serverTimestamp() },
      });

      // Mark invite token as used via Netlify function
      try {
        await fetch("/.netlify/functions/validate-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, action: "consume" }),
        });
      } catch {}

      // Mark the originating waitlist entry as registered so it no longer
      // shows as outstanding/unresolved in the Admin panel's Waitlist tab.
      if (inviteData?.waitlistId) {
        try {
          await updateDoc(doc(db, "waitlist", inviteData.waitlistId), {
            status: "registered",
            registeredAt: serverTimestamp(),
          });
        } catch {}
      }

      // The welcome email used to be sent here, immediately at registration.
      // That was wrong: it told the person "you're in, open the hub" before
      // they'd verified their email, while AuthGuard was simultaneously
      // blocking every route until verification succeeded — two contradictory
      // messages arriving minutes apart. The welcome email now fires from
      // AuthContext, triggered by the actual moment Firebase reports
      // emailVerified: true, so it only ever goes out once that's actually true.

      setRegistered(true);
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setResending(true);
    setResendError("");
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        setResendCooldown(60);
      }
    } catch (err) {
      // Firebase rate-limits this call server-side, separate from our own
      // 60s client-side cooldown — clicking resend repeatedly can trip
      // Firebase's own throttle. That used to fail silently, leaving the
      // button reset with no feedback. Surface it instead.
      setResendError(
        err?.code === "auth/too-many-requests"
          ? "Too many requests — please wait a few minutes before trying again, or check spam for an earlier email."
          : "Couldn't resend the email right now. Please try again in a moment, or contact info@arizonacoalition.net for help."
      );
    }
    setResending(false);
  }

  // ── LOADING STATE ──
  if (tokenStatus === "checking") {
    return (
      <div style={pageStyle}>
        <LogoBlock />
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 36px" }}>
          <div style={{ fontSize: 14, color: "#888" }}>Validating your invite link…</div>
        </div>
      </div>
    );
  }

  // ── INVALID / NO TOKEN — send to waitlist ──
  if (tokenStatus === "invalid" || !token) {
    return (
      <div style={pageStyle}>
        <LogoBlock />
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 36px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "#1D5C4A", marginBottom: 12, marginTop: 0 }}>
            Registration is invite-only
          </h2>
          <p style={{ fontSize: 15, color: "#666", lineHeight: 1.7, marginBottom: 24 }}>
            The Comms Hub is available to approved coalition members only. Request access and our team will review your application.
          </p>
          <Link to="/waitlist" style={{
            display: "inline-block", background: "#1D5C4A", color: "#fff",
            textDecoration: "none", fontWeight: 700, fontSize: 15,
            padding: "13px 32px", borderRadius: 8, letterSpacing: "0.04em",
          }}>
            Request Access →
          </Link>
          <div style={{ marginTop: 20, fontSize: 13, color: "#aaa" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "#1D5C4A", fontWeight: 700, textDecoration: "none" }}>Sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── EXPIRED TOKEN ──
  if (tokenStatus === "expired") {
    return (
      <div style={pageStyle}>
        <LogoBlock />
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 36px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏱️</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "#1D5C4A", marginBottom: 12, marginTop: 0 }}>
            This invite has expired
          </h2>
          <p style={{ fontSize: 15, color: "#666", lineHeight: 1.7, marginBottom: 24 }}>
            Invite links are valid for 72 hours. Please{" "}
            <a href="mailto:info@arizonacoalition.net?subject=Invite%20link%20expired" style={{ color: "#1D5C4A", fontWeight: 700, textDecoration: "none" }}>
              contact your coalition administrator
            </a>{" "}
            to request a new invite.
          </p>
          <Link to="/waitlist" style={{
            display: "inline-block", background: "#1D5C4A", color: "#fff",
            textDecoration: "none", fontWeight: 700, fontSize: 15,
            padding: "13px 32px", borderRadius: 8, letterSpacing: "0.04em",
          }}>
            Back to Waitlist →
          </Link>
        </div>
      </div>
    );
  }

  // ── ALREADY USED TOKEN ──
  if (tokenStatus === "used") {
    return (
      <div style={pageStyle}>
        <LogoBlock />
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 36px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "#1D5C4A", marginBottom: 12, marginTop: 0 }}>
            This invite has already been used
          </h2>
          <p style={{ fontSize: 15, color: "#666", lineHeight: 1.7, marginBottom: 24 }}>
            If you already registered, sign in below. If something went wrong,{" "}
            <a href="mailto:info@arizonacoalition.net?subject=Invite%20link%20issue" style={{ color: "#1D5C4A", fontWeight: 700, textDecoration: "none" }}>
              contact your administrator
            </a>.
          </p>
          <Link to="/login" style={{
            display: "inline-block", background: "#1D5C4A", color: "#fff",
            textDecoration: "none", fontWeight: 700, fontSize: 15,
            padding: "13px 32px", borderRadius: 8, letterSpacing: "0.04em",
          }}>
            Sign In →
          </Link>
        </div>
      </div>
    );
  }

  // ── POST-REGISTRATION: EMAIL VERIFICATION SCREEN ──
  if (registered) {
    return (
      <div style={pageStyle}>
        <LogoBlock />
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 36px" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📬</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "#1D5C4A", marginBottom: 12, marginTop: 0 }}>
            Check your email
          </h2>
          <p style={{ fontSize: 16, color: "#4A4558", lineHeight: 1.7, marginBottom: 8 }}>
            We've sent a verification link to <strong>{form.email}</strong>.
          </p>
          <p style={{ fontSize: 14, color: "#888", lineHeight: 1.6, marginBottom: 28 }}>
            Click the link in the email to verify your address, then come back here to sign in. Check your spam folder if you don't see it.
          </p>
          <button
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            style={{
              background: "none", border: "2px solid #1D5C4A", color: "#1D5C4A",
              borderRadius: 8, padding: "11px 24px", fontSize: 14, fontWeight: 700,
              fontFamily: "var(--font-body)", cursor: (resending || resendCooldown > 0) ? "not-allowed" : "pointer",
              opacity: (resending || resendCooldown > 0) ? 0.6 : 1,
              marginBottom: 20,
            }}
          >
            {resending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend verification email"}
          </button>
          {resendError && (
            <div style={{ background: "#fdf2f2", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e", marginBottom: 20, textAlign: "left" }}>
              {resendError}
            </div>
          )}
          <div style={{ fontSize: 13, color: "#aaa" }}>
            <Link to="/login" style={{ color: "#1D5C4A", fontWeight: 700, textDecoration: "none" }}>
              Go to Sign In →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN REGISTRATION FORM (valid token) ──
  return (
    <div style={pageStyle}>
      <LogoBlock />
      <div style={cardStyle}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "#1D5C4A", marginBottom: 6, marginTop: 0 }}>
          Create Your Account
        </h1>
        <p style={{ fontSize: 14, color: "#888", marginBottom: 24, marginTop: 0, lineHeight: 1.6 }}>
          Coalition members only · Internal use
        </p>

        <form onSubmit={handleSubmit} autoComplete="on" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div>
            <label style={labelStyle}>Full Name <Required /></label>
            <input type="text" value={form.fullName} onChange={setField("fullName")}
              required autoComplete="name" placeholder="Jane Doe" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Email <Required /></label>
            <input type="email" value={form.email} onChange={setField("email")}
              required autoComplete="email" placeholder="you@example.com"
              style={{ ...inputStyle, background: inviteData?.email ? "#f8f8f6" : "#fff" }}
              readOnly={!!inviteData?.email}
            />
            {inviteData?.email && (
              <p style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Email locked to your invite address.</p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Password <Required /></label>
            <div style={{ position: "relative" }}>
              <input type={showPassword ? "text" : "password"} value={form.password}
                onChange={setField("password")} required autoComplete="new-password"
                placeholder="Min. 8 characters" style={{ ...inputStyle, paddingRight: 44 }} />
              <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1} style={eyeButtonStyle}
                aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Confirm Password <Required /></label>
            <div style={{ position: "relative" }}>
              <input type={showConfirm ? "text" : "password"} value={form.confirmPassword}
                onChange={setField("confirmPassword")} required autoComplete="new-password"
                placeholder="Re-enter password" style={{ ...inputStyle, paddingRight: 44 }} />
              <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1} style={eyeButtonStyle}
                aria-label={showConfirm ? "Hide password" : "Show password"}>
                {showConfirm ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          {/* Social Media — up to 6 */}
          <div style={{ borderTop: "1px solid #e8e8e4", paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#1D5C4A", marginBottom: 14 }}>
              Social Media Accounts
            </div>

            {socials.map((social, index) => (
              <div key={index} style={{ marginBottom: 12 }}>
                <label style={{ ...labelStyle, marginBottom: 6 }}>
                  {index === 0 ? <>Primary Account <Required /></> : `Account ${index + 1}`}
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select
                    value={social.platform}
                    onChange={e => setSocialField(index, "platform", e.target.value)}
                    required={index === 0}
                    style={{ ...inputStyle, width: 155, flexShrink: 0 }}
                  >
                    <option value="">Platform…</option>
                    {SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input
                    type="text"
                    value={social.handle}
                    onChange={e => setSocialField(index, "handle", e.target.value)}
                    placeholder="@handle or username"
                    required={index === 0}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  {index > 0 && (
                    <button type="button" onClick={() => removeSocial(index)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#c41e1e", fontSize: 20, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                      aria-label="Remove this account">
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}

            {socials.length < MAX_SOCIALS && (
              <button type="button" onClick={addSocial}
                style={{
                  background: "none", border: "2px dashed #C8C4BC", borderRadius: 8,
                  color: "#888", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-body)",
                  padding: "8px 16px", cursor: "pointer", width: "100%", marginTop: 4,
                  letterSpacing: "0.04em",
                }}>
                + Add another account ({socials.length}/{MAX_SOCIALS})
              </button>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#666", lineHeight: 1.5, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16, accentColor: "#1D5C4A", cursor: "pointer" }}
              required
            />
            <span>
              I agree to the{" "}
              <Link to="/terms" target="_blank" style={{ color: "#1D5C4A", fontWeight: 700 }}>Terms and Conditions</Link>,{" "}
              <Link to="/privacy" target="_blank" style={{ color: "#1D5C4A", fontWeight: 700 }}>Privacy Policy</Link>, and{" "}
              <Link to="/ai-policy" target="_blank" style={{ color: "#1D5C4A", fontWeight: 700 }}>Ethical Use of AI Policy</Link>. <Required />
            </span>
          </label>

          {error && <div style={errorStyle}>{error}</div>}

          <button type="submit" disabled={loading}
            style={{ ...primaryBtnStyle, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Creating account…" : "Create Account →"}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 14, color: "#aaa" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "#1D5C4A", fontWeight: 700, textDecoration: "none" }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}

function Required() {
  return <span style={{ color: "#C1673A", marginLeft: 2 }}>*</span>;
}

function LogoBlock() {
  return (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 64, marginBottom: 12 }} />
      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#fff", letterSpacing: "-0.01em" }}>Arizona Coalition</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#F5C842", marginTop: 4 }}>
        Comms Hub · 2026
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh", background: "var(--teal)",
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", padding: "32px 20px",
};

const cardStyle = {
  background: "var(--bg)", borderRadius: 16, padding: "40px 36px",
  width: "100%", maxWidth: 480, boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
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
    default:
      return "Something went wrong. Please try again.";
  }
}
