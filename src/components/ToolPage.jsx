import { useNavigate } from "react-router-dom";

// Rebuilt July 2026 — was a plain cream/white header with a small colored
// eyebrow label, which read as bland next to Media/Shared Library's bold
// filled-teal header. Purple was tried here first (a distinct accent per
// tool), but the person decided consistency across all tool headers won
// out over having a unique purple accent in this one spot — so this now
// matches Media/Library's teal-panel treatment exactly instead. The
// `accentColor` prop some pages used to pass is gone; the eyebrow is
// always gold now, same as Media's icon square, so every tool page reads
// as one consistent family rather than each having its own accent color.
// premium (Aug 25 2026): a quiet, non-interruptive call-out for Rebuttal
// and Rapid Response — the two tools priced at the 3x value premium (see
// creditHelper.mjs's ORIGIN_MULTIPLIERS). Explicit decision: no in-app
// warning or confirmation before generating (would get annoying fast on
// tools people use repeatedly) — this is just a small, always-visible
// label next to the title so it's discoverable without being in the way.
export default function ToolPage({ eyebrow, title, desc, chainTo, premium, children }) {
  const navigate = useNavigate();

  return (
    <div>
      <div style={{
        borderBottom: "4px solid var(--gold)",
        background: "var(--teal)",
        padding: "28px 24px 26px",
      }}>
        <div style={{ maxWidth: "var(--max-width)", margin: "0 auto" }}>
          {eyebrow && (
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--gold)",
              marginBottom: 6,
            }}>
              {eyebrow}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: desc ? 8 : 0 }}>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(24px, 4vw, 34px)",
              color: "#fff",
              lineHeight: 1.15,
            }}>
              {title}
            </h1>
            {premium && (
              <span title="Priced at a premium rate — see the sales sheet for details" style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--gold)",
                background: "rgba(255,255,255,0.12)",
                border: "1.5px solid rgba(245,200,66,0.55)",
                borderRadius: 20,
                padding: "3px 10px",
                whiteSpace: "nowrap",
              }}>
                ✨ Premium
              </span>
            )}
          </div>
          {desc && (
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, maxWidth: 580 }}>
              {desc}
            </p>
          )}
          {chainTo && (
            <button
              onClick={() => navigate(chainTo.path)}
              style={{
                marginTop: 14,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "#fff",
                background: "rgba(255,255,255,0.14)",
                border: "2px solid rgba(255,255,255,0.55)",
                borderRadius: 8,
                padding: "6px 14px",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.24)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.14)"}
            >
              {chainTo.label} →
            </button>
          )}
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
