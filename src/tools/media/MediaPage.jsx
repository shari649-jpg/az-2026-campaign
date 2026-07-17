import { useState } from "react";
import FileBrowser from "./FileBrowser";
import GraphicsStudio from "./GraphicsStudio";

const B = {
  teal:        "var(--teal)",
  tealDark:    "var(--teal-mid)",
  gold:        "var(--gold)",
  turquoise:   "var(--turquoise)",
  charcoal:    "var(--charcoal)",
  bg:          "var(--bg)",
  surfaceAlt:  "#f3f4f0",
  border:      "var(--border)",
  text:        "#1A1A1A",
  textMid:     "var(--text-mid)",
  textMute:    "#888580",
};

const TABS = [
  { id: "files",    label: "📁 File Browser",    desc: "Browse, preview and download media from Drive" },
  { id: "graphics", label: "🎨 Graphics Studio", desc: "Create branded quote cards and carousel graphics" },
];

export default function MediaPage() {
  const [activeTab, setActiveTab] = useState("files");

  return (
    <div style={{
      minHeight: "100vh",
      background: B.bg,
      fontFamily: "'Atkinson Hyperlegible', Georgia, serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        textarea:focus, input:focus, select:focus {
          outline: 3px solid var(--turquoise) !important;
          outline-offset: 2px;
          border-color: var(--teal) !important;
        }
        button:focus { outline: 3px solid var(--turquoise); outline-offset: 2px; }
        button:active { transform: scale(0.97); }
        @media (max-width: 700px) {
          .media-grid { grid-template-columns: 1fr !important; }
          .studio-preview { display: none !important; }
        }
      `}</style>

      {/* Page header */}
      <div style={{
        borderBottom: `4px solid ${B.gold}`,
        background: B.teal,
        padding: "28px 24px 0",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 48, height: 48, background: B.gold, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24,
            }}>🎬</div>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#fff", margin: 0, letterSpacing: "-0.01em" }}>
                Media
              </h1>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", margin: 0, marginTop: 2 }}>
                Coalition media library and graphics tools
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "12px 22px",
                    background: active ? B.bg : "transparent",
                    color: active ? B.teal : "rgba(255,255,255,0.75)",
                    fontWeight: 900,
                    fontSize: 15,
                    border: "none",
                    borderBottom: active ? `4px solid ${B.gold}` : "4px solid transparent",
                    borderRadius: "8px 8px 0 0",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: "0.01em",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab description strip */}
      <div style={{
        background: B.surfaceAlt,
        borderBottom: `2px solid ${B.border}`,
        padding: "10px 24px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ fontSize: 14, color: B.textMid, margin: 0 }}>
            {TABS.find(t => t.id === activeTab)?.desc}
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        {activeTab === "files"    && <FileBrowser />}
        {activeTab === "graphics" && <GraphicsStudio />}
      </div>
    </div>
  );
}
