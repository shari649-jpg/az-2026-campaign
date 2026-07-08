import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { EmailAuthProvider, linkWithCredential } from "firebase/auth";
import { db, auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

const TEAL       = "#1D5C4A";
const GOLD       = "#F5C842";
const TURQUOISE  = "#3ECFB2";
const CHARCOAL   = "#4A4558";
const TERRACOTTA = "#C1673A";
const RED        = "#c41e1e";
const BG         = "#ffffff";

const SOCIAL_PLATFORMS = ["Instagram","Facebook","TikTok","X / Twitter","Threads","Bluesky","Other"];
const MAX_SOCIALS = 6;

const ROLE_COLORS = {
  administrator: { bg: "#FFF8DC", color: TEAL,     border: GOLD },
  manager:       { bg: "#E6FAF7", color: TEAL,     border: TURQUOISE },
  user:          { bg: "#f5f5f5", color: CHARCOAL, border: "#ccc" },
};

export default function ProfilePage() {
  const { user, profile, role, refreshProfile } = useAuth();

  // ── Editable profile fields (name / org / social handles) ──
  const seedSocials = (() => {
    const existing = (profile?.socialAccounts?.length
      ? profile.socialAccounts
      : [profile?.primarySocial, profile?.secondarySocial].filter(Boolean)
    ).filter(s => s && (s.platform || s.handle));
    return existing.length
      ? existing.map(s => ({ platform: s.platform || "", handle: s.handle || "" }))
      : [{ platform: "", handle: "" }];
  })();

  const [fullName, setFullName]     = useState(profile?.fullName || "");
  const [organization, setOrganization] = useState(profile?.organization || "");
  const [socials, setSocials]       = useState(seedSocials);
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState(null); // { type: "ok"|"err", text }

  function updateSocialField(i, field, value) {
    setSocials(s => s.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }
  function addSocialField() {
    if (socials.length < MAX_SOCIALS) setSocials(s => [...s, { platform: "", handle: "" }]);
  }
  function removeSocialField(i) {
    if (socials.length <= 1) return;
    setSocials(s => s.filter((_, idx) => idx !== i));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const cleaned = socials
        .map(s => ({ platform: s.platform.trim(), handle: s.handle.trim() }))
        .filter(s => s.platform || s.handle);
      const socialAccounts = cleaned.length ? cleaned : [];
      const payload = {
        fullName: fullName.trim(),
        organization: organization.trim(),
        socialAccounts,
        primarySocial: socialAccounts[0] || { platform: "", handle: "" },
      };
      // Keep legacy secondarySocial in sync for any older display code that still reads it
      // (mirrors AdminPage's own self-edit save — same schema, same convention).
      if (socialAccounts[1]) payload.secondarySocial = socialAccounts[1];

      await updateDoc(doc(db, "users", user.uid), payload);
      await refreshProfile(); // so the nav bar's name/initials update immediately
      setSaveMsg({ type: "ok", text: "Profile updated." });
    } catch (err) {
      setSaveMsg({ type: "err", text: "Couldn't save your changes. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  // ── Add-a-password flow (Google-only accounts) ──
  const providerIds  = user?.providerData?.map(p => p.providerId) || [];
  const hasGoogle     = providerIds.includes("google.com");
  const hasPassword   = providerIds.includes("password");
  const showAddPassword = hasGoogle && !hasPassword;

  const [pwForm, setPwForm]       = useState({ password: "", confirmPassword: "" });
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwError, setPwError]     = useState("");
  const [pwDone, setPwDone]       = useState(false);

  async function handleAddPassword(e) {
    e.preventDefault();
    setPwError("");
    if (pwForm.password.length < 8) { setPwError("Password must be at least 8 characters."); return; }
    if (pwForm.password !== pwForm.confirmPassword) { setPwError("Passwords don't match."); return; }

    setPwSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, pwForm.password);
      await linkWithCredential(auth.currentUser, credential);
      setPwDone(true);
      setPwForm({ password: "", confirmPassword: "" });
    } catch (err) {
      setPwError(friendlyLinkError(err.code));
    } finally {
      setPwSaving(false);
    }
  }

  const rc = ROLE_COLORS[role] || ROLE_COLORS.user;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "var(--font-body)", color: CHARCOAL }}>
      {/* Header */}
      <div style={{ background: TEAL, borderBottom: `4px solid ${GOLD}`, padding: "32px 24px 28px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, marginBottom: 8 }}>
            Coalition Comms Hub
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, color: "#fff", marginBottom: 8 }}>
            My Profile
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.8)" }}>
            Manage your name, organization, and social handles. Email and role are managed by your administrator.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 24px 60px" }}>

        {/* ── Account info (read-only) ── */}
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Account</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email</label>
            <input type="text" value={user?.email || ""} disabled style={{ ...inputStyle, background: "#f2f0eb", color: "#888", cursor: "not-allowed" }} />
            <p style={hintStyle}>
              Contact <a href="mailto:info@arizonacoalition.net" style={{ color: TEAL, fontWeight: 700 }}>info@arizonacoalition.net</a> to change your email.
            </p>
          </div>

          <div>
            <label style={labelStyle}>Role</label>
            <div>
              <span style={{
                display: "inline-block",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "capitalize",
                background: rc.bg, color: rc.color, border: `1.5px solid ${rc.border}`,
                borderRadius: 6, padding: "6px 14px",
              }}>
                {role}
              </span>
            </div>
            <p style={hintStyle}>Roles are set by administrators and can't be changed here.</p>
          </div>
        </section>

        {/* ── Editable fields ── */}
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Your Info</h2>

          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                autoComplete="name" placeholder="Jane Doe" style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Organization</label>
              <input type="text" value={organization} onChange={e => setOrganization(e.target.value)}
                autoComplete="organization" placeholder="Campaign, PAC, union, advocacy org…" style={inputStyle} />
            </div>

            <div style={{ borderTop: "1px solid #e8e8e4", paddingTop: 16, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>
                Social Media Accounts
              </div>

              {socials.map((social, index) => (
                <div key={index} style={{ marginBottom: 12 }}>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>
                    {index === 0 ? "Primary Account" : `Account ${index + 1}`}
                  </label>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <select
                      value={social.platform}
                      onChange={e => updateSocialField(index, "platform", e.target.value)}
                      style={{ ...inputStyle, width: 155, flexShrink: 0 }}
                    >
                      <option value="">Platform…</option>
                      {SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                      type="text"
                      value={social.handle}
                      onChange={e => updateSocialField(index, "handle", e.target.value)}
                      placeholder="@handle or username"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    {socials.length > 1 && (
                      <button type="button" onClick={() => removeSocialField(index)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: RED, fontSize: 20, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                        aria-label="Remove this account">
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {socials.length < MAX_SOCIALS && (
                <button type="button" onClick={addSocialField}
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

            {saveMsg && (
              <div style={saveMsg.type === "ok" ? okBoxStyle : errBoxStyle}>
                {saveMsg.type === "ok" ? "✓ " : ""}{saveMsg.text}
              </div>
            )}

            <button type="submit" disabled={saving}
              style={{ ...primaryBtnStyle, opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </section>

        {/* ── Security: add a password for Google-only accounts ── */}
        {showAddPassword && (
          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>Sign-In & Security</h2>
            <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginTop: 0, marginBottom: 16 }}>
              Your account currently signs in with Google only. Add a password so you can also sign in with your email address directly.
            </p>

            {pwDone ? (
              <div style={okBoxStyle}>
                ✓ Password added. You can now sign in with either Google or your email and password.
              </div>
            ) : (
              <form onSubmit={handleAddPassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={labelStyle}>New Password</label>
                  <input type="password" value={pwForm.password}
                    onChange={e => setPwForm(f => ({ ...f, password: e.target.value }))}
                    autoComplete="new-password" placeholder="Min. 8 characters" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Confirm Password</label>
                  <input type="password" value={pwForm.confirmPassword}
                    onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    autoComplete="new-password" placeholder="Re-enter password" style={inputStyle} />
                </div>
                {pwError && <div style={errBoxStyle}>{pwError}</div>}
                <button type="submit" disabled={pwSaving}
                  style={{ ...secondaryBtnStyle, opacity: pwSaving ? 0.7 : 1, cursor: pwSaving ? "not-allowed" : "pointer" }}>
                  {pwSaving ? "Adding…" : "Add Password"}
                </button>
              </form>
            )}
          </section>
        )}

      </div>
    </div>
  );
}

function friendlyLinkError(code) {
  switch (code) {
    case "auth/requires-recent-login":
      return "For security, please sign out and back in with Google, then try this again right away.";
    case "auth/credential-already-in-use":
    case "auth/email-already-in-use":
      return "This email is already linked to a different sign-in method.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters.";
    default:
      return "Couldn't add a password right now. Please try again, or contact info@arizonacoalition.net for help.";
  }
}

const cardStyle = {
  background: BG, border: "2px solid #e8e8e4", borderRadius: 12,
  padding: "24px 28px", marginBottom: 20,
};

const sectionTitleStyle = {
  fontFamily: "var(--font-display)", fontSize: 19, color: TEAL,
  marginTop: 0, marginBottom: 18,
};

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
  color: CHARCOAL, marginBottom: 6,
};

const hintStyle = { fontSize: 12, color: "#888", marginTop: 6, marginBottom: 0 };

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "11px 14px",
  fontSize: 15, fontFamily: "var(--font-body)",
  border: "2px solid #c8c4b8", borderRadius: 8,
  background: BG, color: CHARCOAL,
  outline: "none", transition: "border-color 0.15s",
};

const primaryBtnStyle = {
  marginTop: 4, background: TEAL, color: "#fff",
  border: "none", borderRadius: 8, padding: "13px 0",
  fontSize: 15, fontWeight: 700, fontFamily: "var(--font-body)",
  letterSpacing: "0.04em", width: "100%",
};

const secondaryBtnStyle = {
  marginTop: 4, background: "#fff", color: TERRACOTTA,
  border: `2px solid ${TERRACOTTA}`, borderRadius: 8, padding: "12px 0",
  fontSize: 15, fontWeight: 700, fontFamily: "var(--font-body)",
  letterSpacing: "0.04em", width: "100%",
};

const okBoxStyle = {
  background: "#f0faf5", border: "1px solid #a8dfc0",
  borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1a6640",
};

const errBoxStyle = {
  background: "#fdf2f2", border: "1px solid #f5c6c6",
  borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e",
};
