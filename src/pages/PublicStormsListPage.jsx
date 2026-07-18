// src/pages/PublicStormsListPage.jsx
//
// Fully public storm directory — no login, no AppShell, view-only. Reached
// via /storms/public (see App.jsx's public routes section). Lists every
// currently public, active, non-expired storm in one place, so volunteers
// don't have to be handed individual /storm/:token links one at a time —
// they can bookmark this one URL and check back on it.
//
// Fetches from public-storms-list.mjs, which independently re-verifies
// each storm's isPublic/status/expiresAt at request time, same posture as
// PublicStormPage.jsx's single-storm fetch.

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const TEAL      = "var(--teal)";
const TEAL_DARK = "var(--teal-mid)";
const GOLD      = "var(--gold)";
const CHARCOAL  = "var(--charcoal)";

export default function PublicStormsListPage() {
  const [state, setState] = useState("loading"); // "loading" | "ready" | "unavailable"
  const [storms, setStorms] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/.netlify/functions/public-storms-list");
        const json = await res.json();
        if (cancelled) return;
        if (json.available) {
          setStorms(json.storms || []);
          setState("ready");
        } else {
          setState("unavailable");
        }
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={pageStyle}>
      <LogoBlock />

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: TEAL, margin: "0 0 8px" }}>
          Active Public Storms
        </h1>
        <p style={{ fontSize: 14.5, color: CHARCOAL, lineHeight: 1.6, margin: 0 }}>
          Everything here is open for volunteers to view, download, and share right now.
        </p>
      </div>

      {state === "loading" && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "40px 32px" }}>
          <p style={{ color: "#888", fontSize: 15, margin: 0 }}>Loading…</p>
        </div>
      )}

      {state === "unavailable" && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "40px 32px" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
          <p style={{ fontSize: 14.5, color: "#777", lineHeight: 1.6, margin: 0 }}>
            This list isn't available right now. Try again in a moment.
          </p>
        </div>
      )}

      {state === "ready" && (
        <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 14 }}>
          {storms.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center", padding: "40px 32px" }}>
              <p style={{ color: "#888", fontSize: 15, margin: 0 }}>Nothing public right now — check back soon.</p>
            </div>
          ) : (
            storms.map(storm => <StormListCard key={storm.token} storm={storm} />)
          )}
        </div>
      )}
    </div>
  );
}

function StormListCard({ storm }) {
  return (
    <Link
      to={`/storm/${storm.token}`}
      style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {storm.cardImage?.url ? (
          <img
            src={storm.cardImage.url}
            alt=""
            style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 84, height: 84, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${TEAL}, ${TEAL_DARK})`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img src="/azc-logo.png" alt="" style={{ height: 40, width: 40, objectFit: "contain" }} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: TEAL, margin: "0 0 4px" }}>
            {storm.title}
          </h2>
          {storm.summary && (
            <p style={{ fontSize: 13.5, color: CHARCOAL, lineHeight: 1.5, margin: 0 }}>
              {storm.summary}
            </p>
          )}
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: TEAL }}>
        View storm →
      </div>
    </Link>
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
  background: "#fff", borderRadius: 16, padding: "28px 28px",
  width: "100%", maxWidth: 520,
  boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
};
