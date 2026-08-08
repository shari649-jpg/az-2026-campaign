// src/pages/VoterLookupPage.jsx
//
// Fully public — no login, no AppShell. Reached via /voter-lookup (see
// App.jsx's public routes section). A voter types their address, this
// page calls public-voter-lookup.mjs (which resolves the address to a
// congressional + state legislative district via Google's Civic
// Information API, then returns only an allowlisted subset of matching
// candidates — see that function's header comment for the full field
// list and why it's an allowlist, not a blocklist).
//
// Mobile-first by design intent (per conversation, Aug 4 2026) — this is
// expected to be used mostly on phones, so layout is single-column,
// touch targets are generous, and headshots load lazily per-card rather
// than blocking the whole results render.

import { useState } from "react";
import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

const TEAL      = "var(--teal)";
const TEAL_DARK = "var(--teal-mid)";
const GOLD      = "var(--gold)";
const CHARCOAL  = "var(--charcoal)";
const TURQUOISE = "var(--turquoise)";

const RACE_SECTIONS = [
  { key: "stateExecutive", title: "State Executive", sub: () => "Governor · Attorney General · Secretary of State" },
  { key: "congress",    title: "U.S. House",  sub: d => `Congressional District ${d.congressional}` },
  { key: "stateSenate", title: "State Senate", sub: d => `Legislative District ${d.stateSenate}` },
  { key: "stateHouse",  title: "State House",  sub: d => `Legislative District ${d.stateHouse}` },
];

export default function VoterLookupPage() {
  const [address, setAddress] = useState("");
  const [demOnly, setDemOnly] = useState(false);
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!address.trim()) return;
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/public-voter-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim(), demOnly }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Couldn't look that up.");
      setData(json);
      setState("ready");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setState("error");
    }
  }

  function handleChange() {
    if (state === "ready" || state === "error") {
      setState("idle");
      setData(null);
      setError(null);
    }
  }

  return (
    <div style={pageStyle}>
      <LogoBlock />

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: TEAL, margin: "0 0 8px" }}>
          Find your candidates
        </h1>
        <p style={{ fontSize: 14, color: CHARCOAL, lineHeight: 1.6, margin: "0 0 18px" }}>
          Enter your home address to see who's running for Governor, Attorney General, Secretary of State, Congress, State Senate, and State House in your district.
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="text"
            inputMode="text"
            placeholder="123 Main St, Tucson, AZ 85701"
            value={address}
            onChange={e => { setAddress(e.target.value); handleChange(); }}
            style={{
              width: "100%", boxSizing: "border-box", padding: "14px 16px", fontSize: 16,
              border: "2px solid #ddd", borderRadius: 10, fontFamily: "inherit", color: CHARCOAL,
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: CHARCOAL, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={demOnly}
              onChange={e => { setDemOnly(e.target.checked); handleChange(); }}
              style={{ width: 18, height: 18, accentColor: TEAL, cursor: "pointer" }}
            />
            Show Democratic candidates only
          </label>
          <button
            type="submit"
            disabled={state === "loading" || !address.trim()}
            style={{
              width: "100%", padding: "14px 16px", fontSize: 16, fontWeight: 700, fontFamily: "inherit",
              background: state === "loading" ? "#ccc" : TEAL, color: "#fff", border: "none", borderRadius: 10,
              cursor: state === "loading" ? "not-allowed" : "pointer",
            }}
          >
            {state === "loading" ? "Looking up your district…" : "Find my candidates"}
          </button>
        </form>
        <p style={{ fontSize: 11.5, color: "#999", margin: "12px 0 0", lineHeight: 1.5 }}>
          Your address is used only to determine your districts and is not stored.
        </p>
      </div>

      {state === "error" && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "28px" }}>
          <p style={{ fontSize: 14.5, color: "#991b1b", lineHeight: 1.6, margin: 0 }}>{error}</p>
        </div>
      )}

      {state === "ready" && data && (
        <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 20 }}>
          {RACE_SECTIONS.map(section => {
            const candidates = data.results[section.key] || [];
            return (
              <div key={section.key}>
                <div style={{
                  background: `linear-gradient(135deg, ${TEAL}, ${TEAL_DARK})`,
                  borderRadius: "12px 12px 0 0", padding: "16px 20px",
                }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "#fff", marginBottom: 4 }}>
                    {section.title}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD }}>
                    {section.sub(data.districts)}
                  </div>
                </div>
                <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", boxShadow: "0 16px 48px rgba(0,0,0,0.15)" }}>
                  {candidates.length === 0 ? (
                    <p style={{ padding: "20px", fontSize: 14, color: "#999", margin: 0 }}>No candidates found for this race yet.</p>
                  ) : (
                    candidates.map((c, i) => (
                      <CandidateRow key={i} candidate={c} isLast={i === candidates.length - 1} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CandidateRow({ candidate, isLast }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoTried, setPhotoTried] = useState(false);

  if (!photoTried && candidate.photoFilename) {
    setPhotoTried(true);
    getDownloadURL(ref(storage, `candidate-headshots/${candidate.photoFilename}`))
      .then(url => setPhotoUrl(url))
      .catch(() => {});
  }

  const partyColors = {
    D: { bg: "#eff6ff", text: "#1a56b0" },
    R: { bg: "#fff1f1", text: "#b91c1c" },
  };
  const pc = partyColors[(candidate.party || "").toUpperCase()] || { bg: "#f3f4f6", text: CHARCOAL };

  // Colored-initial fallback avatar for a missing headshot — better than
  // a blank gray box, and it's genuinely informative (party at a glance)
  // rather than purely decorative. Red for R, blue for D, pink for
  // anything else (Independent, Libertarian, Green, no party listed,
  // etc.) — matching the same red/blue as the party pill above, so the
  // two never visually contradict each other.
  const avatarColors = {
    D: { bg: "#1a56b0", text: "#fff" },
    R: { bg: "#b91c1c", text: "#fff" },
  };
  const ac = avatarColors[(candidate.party || "").toUpperCase()] || { bg: "#db2777", text: "#fff" }; // pink
  const initial = (candidate.name || "?").trim().charAt(0).toUpperCase();

  return (
    <div style={{ padding: "18px 20px", borderBottom: isLast ? "none" : "1px solid #eee" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, color: TEAL, margin: 0 }}>{candidate.name}</h3>
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: pc.bg, color: pc.text }}>
          {candidate.party}
        </span>
      </div>
      {candidate.incumbentStatus && (
        <div style={{ fontSize: 11, fontWeight: 700, color: TURQUOISE, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          {candidate.incumbentStatus}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {photoUrl ? (
          <img src={photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 64, height: 64, borderRadius: 10, flexShrink: 0,
            background: ac.bg, color: ac.text,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700,
          }}>
            {initial}
          </div>
        )}
        {candidate.recordAccomplishments && (
          <p style={{ fontSize: 13.5, color: CHARCOAL, lineHeight: 1.6, margin: 0 }}>
            {candidate.recordAccomplishments}
          </p>
        )}
      </div>
    </div>
  );
}

function LogoBlock() {
  return (
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 64, marginBottom: 12 }} />
      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#fff", letterSpacing: "-0.01em" }}>Arizona Coalition</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, marginTop: 4 }}>
        Voter Guide · 2026
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: `linear-gradient(160deg, ${TEAL} 0%, ${TEAL_DARK} 100%)`,
  display: "flex", flexDirection: "column",
  alignItems: "center", padding: "32px 16px 48px",
};

const cardStyle = {
  background: "#fff", borderRadius: 16, padding: "24px 22px",
  width: "100%", maxWidth: 520,
  boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
};
