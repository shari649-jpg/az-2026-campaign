import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

const TEAL      = "#1D5C4A";
const TEAL_DARK = "#164437";
const GOLD      = "#F5C842";
const CHARCOAL  = "#4A4558";
const TURQUOISE = "#3ECFB2";
const BORDER    = "#C8C4BC";

const SOCIAL_PLATFORMS = ["Instagram","Facebook","TikTok","X / Twitter","Threads","Bluesky","Other"];

export default function WaitlistPage() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    organization: "",
    reason: "",
    primaryPlatform: "",
    primaryHandle: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.fullName.trim())     { setError("Please enter your full name."); return; }
    if (!form.email.trim())        { setError("Please enter your email address."); return; }
    if (!form.primaryPlatform)     { setError("Please select your primary social media platform."); return; }
    if (!form.primaryHandle.trim()){ setError("Please enter your primary social media handle."); return; }

    setLoading(true);
    try {
      // Check for duplicate email — routed through a server-side function
      // (check-waitlist-email.mjs) instead of a direct client-side
      // Firestore `list` query. A `limit(1)` list query is enumerable via
      // repeated cursored requests, so firestore.rules now locks the
      // waitlist collection's get/list down to admin-only. Fixed July
      // 2026 security pass.
      const dupRes = await fetch('/.netlify/functions/check-waitlist-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.toLowerCase().trim() }),
      });
      const dupData = await dupRes.json();
      if (dupData.exists) {
        setError("This email is already on the waitlist. We'll be in touch soon!");
        setLoading(false);
        return;
      }

      await addDoc(collection(db, "waitlist"), {
        fullName:        form.fullName.trim(),
        email:           form.email.toLowerCase().trim(),
        organization:    form.organization.trim(),
        reason:          form.reason.trim(),
        primarySocial:   { platform: form.primaryPlatform, handle: form.primaryHandle.trim() },
        status:          "pending",
        submittedAt:     serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error(err);
    }
    setLoading(false);
  }

  if (submitted) {
    return (
      <div style={pageStyle}>
        <LogoBlock />
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 36px" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, color: TEAL, marginBottom: 12, marginTop: 0 }}>
            You're on the list!
          </h1>
          <p style={{ fontSize: 16, color: CHARCOAL, lineHeight: 1.7, marginBottom: 8 }}>
            Thanks, <strong>{form.fullName.split(" ")[0]}</strong>! We've received your request and will review it shortly.
          </p>
          <p style={{ fontSize: 15, color: "#777", lineHeight: 1.6, marginBottom: 28 }}>
            Once approved, you'll receive an invite link at <strong>{form.email}</strong> with instructions to complete your registration.
          </p>
          <div style={{ width: 48, height: 3, background: GOLD, borderRadius: 2, margin: "0 auto" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <LogoBlock />

      {/* Video section */}
      <div style={{ width: "100%", maxWidth: 640, marginBottom: 32 }}>
        <div style={{
          position: "relative", paddingBottom: "177.78%", /* 9:16 for YouTube Shorts */
          height: 0, overflow: "hidden", borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
          background: "#000",
        }}>
          <iframe
            src="https://www.youtube.com/embed/7GDPnEWS3p0?rel=0&modestbranding=1"
            title="Arizona Coalition Comms Hub — Overview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: "absolute", top: 0, left: 0,
              width: "100%", height: "100%",
              border: "none",
            }}
          />
        </div>
        <p style={{
          textAlign: "center", color: "rgba(255,255,255,0.75)",
          fontSize: 13, marginTop: 10, fontFamily: "var(--font-body)",
        }}>
          See what the Comms Hub can do for your coalition work
        </p>
      </div>

      {/* Form card */}
      <div style={cardStyle}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: TEAL, marginBottom: 6, marginTop: 0 }}>
          Request Access
        </h2>
        <p style={{ fontSize: 14, color: "#666", marginBottom: 24, marginTop: 0, lineHeight: 1.6 }}>
          The Comms Hub is invite-only. Fill out the form below and our team will review your request.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div>
            <label style={labelStyle}>Full Name <Required /></label>
            <input type="text" value={form.fullName} onChange={set("fullName")}
              required autoComplete="name" placeholder="Jane Doe" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Email Address <Required /></label>
            <input type="email" value={form.email} onChange={set("email")}
              required autoComplete="email" placeholder="you@example.com" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>
              Organization{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#999", fontSize: 11 }}>(optional)</span>
            </label>
            <input type="text" value={form.organization} onChange={set("organization")}
              autoComplete="organization" placeholder="Campaign, PAC, union, advocacy org…" style={inputStyle} />
          </div>

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>
              Primary Social Media Account <Required />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <select value={form.primaryPlatform} onChange={set("primaryPlatform")} required
                style={{ ...inputStyle, width: 160, flexShrink: 0 }}>
                <option value="">Platform…</option>
                {SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="text" value={form.primaryHandle} onChange={set("primaryHandle")}
                placeholder="@handle or username" style={{ ...inputStyle, flex: 1 }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              Why do you want access?{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#999", fontSize: 11 }}>(optional)</span>
            </label>
            <textarea value={form.reason} onChange={set("reason")} rows={3}
              placeholder="Tell us briefly how you plan to use the Comms Hub…"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "var(--font-body)" }} />
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <p style={{ fontSize: 12.5, color: "#999", lineHeight: 1.5, margin: 0 }}>
            By submitting this form, you agree to our{" "}
            <Link to="/privacy" target="_blank" style={{ color: TEAL, fontWeight: 700 }}>Privacy Policy</Link>.
            We use the information you provide here to review your request and manage an invitation if approved.
          </p>

          <button type="submit" disabled={loading}
            style={{ ...primaryBtnStyle, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Submitting…" : "Request Access →"}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "#999" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: TEAL, fontWeight: 700, textDecoration: "none" }}>Sign in</Link>
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
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 64, marginBottom: 12 }} />
      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#fff", letterSpacing: "-0.01em" }}>Arizona Coalition</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, marginTop: 4 }}>
        Comms Hub · 2026
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: `linear-gradient(160deg, ${TEAL} 0%, ${TEAL_DARK} 100%)`,
  display: "flex", flexDirection: "column",
  alignItems: "center", padding: "32px 20px 48px",
};

const cardStyle = {
  background: "#fff", borderRadius: 16, padding: "36px 32px",
  width: "100%", maxWidth: 520,
  boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
};

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
  color: CHARCOAL, marginBottom: 6,
};

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "11px 14px",
  fontSize: 15, fontFamily: "var(--font-body)",
  border: `2px solid ${BORDER}`, borderRadius: 8,
  background: "#fff", color: CHARCOAL,
  outline: "none", transition: "border-color 0.15s",
};

const primaryBtnStyle = {
  marginTop: 4, background: TEAL, color: "#fff",
  border: "none", borderRadius: 8, padding: "13px 0",
  fontSize: 16, fontWeight: 700, fontFamily: "var(--font-body)",
  letterSpacing: "0.04em", transition: "background 0.15s", width: "100%",
};

const errorStyle = {
  background: "#fdf2f2", border: "1px solid #f5c6c6",
  borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e",
};
