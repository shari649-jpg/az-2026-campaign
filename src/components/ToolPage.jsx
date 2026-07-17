import { useNavigate } from "react-router-dom";

export default function ToolPage({ eyebrow, title, desc, chainTo, accentColor = "var(--purple)", children }) {
  const navigate = useNavigate();

  return (
    <div>
      <div style={{
        borderBottom: "3px solid var(--gold)",
        background: "var(--surface)",
        padding: "26px 24px 22px",
      }}>
        <div style={{ maxWidth: "var(--max-width)", margin: "0 auto" }}>
          {eyebrow && (
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: accentColor,
              marginBottom: 6,
            }}>
              {eyebrow}
            </div>
          )}
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(24px, 4vw, 34px)",
            color: "var(--text)",
            lineHeight: 1.15,
            marginBottom: desc ? 8 : 0,
          }}>
            {title}
          </h1>
          {desc && (
            <p style={{ fontSize: 15, color: "var(--text-mid)", lineHeight: 1.6, maxWidth: 580 }}>
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
                color: "var(--purple)",
                background: "var(--purple-light)",
                border: "2px solid var(--purple)",
                borderRadius: 8,
                padding: "6px 14px",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#ddd0e6"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--purple-light)"}
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
