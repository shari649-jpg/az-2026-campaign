// src/pages/PublicStormPage.jsx
//
// Fully public storm page — no login, no AppShell (no nav, no header
// ticker), view/copy/download only, never editable. Reached via
// /storm/:token (see App.jsx's public routes section).
//
// Fetches from public-storm.mjs, which independently re-verifies the
// storm is actually public, Active, and not expired at request time —
// this component just renders whatever that function decides to hand
// back, and shows one generic "not available" state for every failure
// case (bad token, private, expired, archived) rather than trying to
// distinguish them, matching the function's own intentionally vague
// response shape.

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import PostDisplayCard from "../tools/storms/PostDisplayCard";

const TEAL      = "#1D5C4A";
const TEAL_DARK = "#164437";
const GOLD      = "#F5C842";
const CHARCOAL  = "#4A4558";

export default function PublicStormPage() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // "loading" | "ready" | "unavailable"
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/.netlify/functions/public-storm?token=${encodeURIComponent(token || "")}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.available) {
          setData(json);
          setState("ready");
        } else {
          setState("unavailable");
        }
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div style={pageStyle}>
      <LogoBlock />

      {state === "loading" && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 36px" }}>
          <p style={{ color: "#888", fontSize: 15, margin: 0 }}>Loading…</p>
        </div>
      )}

      {state === "unavailable" && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 36px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: TEAL, marginTop: 0, marginBottom: 10 }}>
            This page isn't available
          </h1>
          <p style={{ fontSize: 14.5, color: "#777", lineHeight: 1.6, margin: 0 }}>
            The link may be expired, no longer public, or incorrect. Check with whoever shared it with you.
          </p>
        </div>
      )}

      {state === "ready" && data && (
        <>
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            {data.cardImage?.url ? (
              <img
                src={data.cardImage.url}
                alt=""
                style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 12, marginBottom: 18, display: "block" }}
              />
            ) : (
              <div style={{
                width: "100%", height: 160, borderRadius: 12, marginBottom: 18,
                background: `linear-gradient(135deg, ${TEAL}, ${TEAL_DARK})`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <img src="/azc-logo.png" alt="" style={{ height: 64, width: 64, objectFit: "contain" }} />
              </div>
            )}
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, color: TEAL, margin: "0 0 8px" }}>{data.title}</h1>
            {data.summary && <p style={{ fontSize: 15.5, color: CHARCOAL, lineHeight: 1.6, margin: 0 }}>{data.summary}</p>}
          </div>

          <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 14 }}>
            {data.posts.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.75)", textAlign: "center", fontSize: 14 }}>Nothing to show here yet.</p>
            ) : (
              data.posts.map(post => <PostDisplayCard key={post.id} post={post} hashtag={data.hashtag} isPublic publicToken={token} />)
            )}
          </div>
        </>
      )}
    </div>
  );
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
