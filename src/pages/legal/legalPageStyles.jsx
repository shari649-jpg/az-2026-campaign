// src/pages/legal/legalPageStyles.js
// Shared brand tokens + layout wrapper for the three public legal pages
// (Terms, Privacy, AI Policy). Mirrors the branded HTML/Google Doc versions
// of these documents so the in-app pages match exactly.

export const L = {
  gold:       "var(--gold)",
  teal:       "var(--teal)",
  tealSoft:   "rgba(29, 92, 74, 0.08)",
  charcoal:   "var(--charcoal)",
  turquoise:  "var(--turquoise)",
  terracotta: "var(--terracotta)",
  ink:        "#1A1A1A",
  surface:    "#FFFFFF",
  surfaceAlt: "#F3F4F0",
  border:     "var(--border)",
};

export function SectionHeading({ num, children }) {
  return (
    <h2 style={{
      fontSize: 19, color: L.teal, display: "flex", alignItems: "baseline",
      gap: 12, marginBottom: 12, marginTop: 34, fontFamily: "var(--font-display)",
    }}>
      <span style={{
        fontSize: 13, fontWeight: 700, color: L.charcoal, background: L.gold,
        borderRadius: 6, padding: "2px 9px", flexShrink: 0, minWidth: 34, textAlign: "center",
      }}>{num}</span>
      {children}
    </h2>
  );
}

export function MarkedList({ tone = "teal", items }) {
  const isTeal = tone === "teal";
  const color = isTeal ? L.teal : L.terracotta;
  const bg = isTeal ? "rgba(62,207,178,0.18)" : "rgba(193,103,58,0.12)";
  const mark = isTeal ? "✓" : "✕";
  return (
    <ul style={{ listStyle: "none", margin: "4px 0 12px", padding: 0 }}>
      {items.map((text, i) => (
        <li key={i} style={{ position: "relative", padding: "5px 0 5px 32px", fontSize: 16, lineHeight: 1.6 }}>
          <span style={{
            position: "absolute", left: 0, top: 4, fontWeight: 700, fontSize: 15,
            color, background: bg, borderRadius: "50%", width: 22, height: 22,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{mark}</span>
          {text}
        </li>
      ))}
    </ul>
  );
}

export function CategoryList({ items }) {
  return (
    <ul style={{ listStyle: "none", display: "grid", gridTemplateColumns: "1fr", gap: 10, margin: "6px 0 12px", padding: 0 }}>
      {items.map(({ label, text }, i) => (
        <li key={i} style={{
          background: L.tealSoft, borderLeft: `4px solid ${L.turquoise}`,
          borderRadius: "0 8px 8px 0", padding: "11px 16px", fontSize: 15.5, lineHeight: 1.6,
        }}>
          <strong style={{ color: L.teal }}>{label}:</strong> {text}
        </li>
      ))}
    </ul>
  );
}

export function ContactCard() {
  return (
    <div style={{
      background: L.surfaceAlt, border: `1px solid ${L.border}`, borderTop: `4px solid ${L.gold}`,
      borderRadius: 10, padding: "22px 26px", marginTop: 8,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: L.charcoal, marginBottom: 8 }}>
        Contact
      </div>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>
        <span style={{ fontWeight: 700, color: L.teal }}>Arizona Coalition, LLC</span><br />
        522 N Central Ave #831<br />
        Phoenix, AZ 85004<br />
        <a href="mailto:info@arizonacoalition.net" style={{ color: L.teal, fontWeight: 700 }}>info@arizonacoalition.net</a>
      </p>
    </div>
  );
}

export function LegalPageLayout({ title, effectiveDate, intro, notice, children }) {
  return (
    <div style={{ background: L.surfaceAlt, minHeight: "100vh", padding: "32px 16px 64px" }}>
      <article style={{
        maxWidth: 780, margin: "0 auto", background: L.surface,
        border: `1px solid ${L.border}`, borderRadius: 14, overflow: "hidden",
        fontFamily: "var(--font-body)", color: L.ink,
      }}>
        <header style={{ background: L.gold, borderBottom: `3px solid ${L.teal}`, padding: "36px 40px 30px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: L.charcoal, marginBottom: 8 }}>
            Arizona Coalition, LLC
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 5vw, 36px)", fontWeight: 700, color: L.teal, lineHeight: 1.2, margin: 0 }}>
            {title}
          </h1>
          <span style={{
            display: "inline-block", marginTop: 14, background: L.teal, color: "#fff",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", padding: "5px 14px", borderRadius: 999,
          }}>
            Effective {effectiveDate}
          </span>
        </header>

        <div style={{ padding: "36px 40px 44px", lineHeight: 1.7 }}>
          {intro && (
            <p style={{ fontSize: 17, color: L.charcoal, paddingBottom: 26, borderBottom: `1px solid ${L.border}`, marginBottom: 32 }}>
              {intro}
            </p>
          )}
          {notice && (
            <div style={{
              background: "rgba(193, 103, 58, 0.08)", border: `2px solid ${L.terracotta}`,
              borderRadius: 10, padding: "16px 20px", fontSize: 15, fontWeight: 700,
              color: L.terracotta, marginBottom: 32,
            }}>
              {notice}
            </div>
          )}
          {children}
        </div>
      </article>
    </div>
  );
}
