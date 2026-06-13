import { useNavigate } from "react-router-dom";
import ToolPage from "../../components/ToolPage";

const TEAL     = "#1D5C4A";
const GOLD     = "#F5C842";
const CHARCOAL = "#4A4558";
const TERRA    = "#C1673A";
const WHITE    = "#FFFFFF";

const TOOLS = [
  {
    num:   "1",
    label: "Research",
    sub:   "Candidates, Issues & Districts",
    path:  "/research",
    steps: [
      "Pick a tab: Search Candidates, Compare Races, or District Profiles",
      "Check facts, quotes, or vulnerabilities with checkboxes",
      'Click "Send to Message Machine" in the floating bar',
    ],
    bg: "#E0F2EC", bord: "#A8D9C8", titc: TEAL, numc: TEAL, icon: "🔍",
  },
  {
    num:   "2",
    label: "Rapid Response",
    sub:   "Monitor & read breaking articles",
    path:  "/rapid-response",
    steps: [
      "Paste a URL and click Fetch — or paste article text directly",
      "Review the AI summary of key claims & quotes",
      'Click "Send to Message Machine"',
    ],
    bg: "#FDE8D8", bord: "#F0C4A8", titc: "#7A3010", numc: "#7A3010", icon: "⚡",
  },
  {
    num:   "3",
    label: "Rebuttal Generator",
    sub:   "Counter false narratives",
    path:  "/rebuttal",
    steps: [
      "Enter the lie or misleading claim — be specific",
      "Set tone & profile (optional — defaults work well)",
      "Generate, then Push to Message Machine",
    ],
    bg: "#FFF0E8", bord: "#F0C4A8", titc: TERRA, numc: TERRA, icon: "🛡️",
  },
  {
    num:   "4",
    label: "Message Machine",
    sub:   "Generate posts for all 6 platforms",
    path:  "/messaging",
    steps: [
      "Set issue, audience, voice, style & platforms",
      "Generate — desert loader plays ~10–25 sec",
      "Review & refine: expand, shorten, rephrase",
      "Optional: More menu → Media drive or Graphics Studio",
    ],
    bg: "#E0FAF5", bord: "#9DD8CC", titc: "#085041", numc: "#085041", icon: "⚙️",
  },
  {
    num:   "5",
    label: "Copy & Post or Save to Library",
    sub:   "Publish or store your campaign",
    path:  null,
    steps: [
      "Copy individual platform posts to publish directly",
      "Save to Library to store the full campaign",
      "Do one or both — nothing saves automatically",
    ],
    bg: "#EEF1F8", bord: "#C5CDE8", titc: CHARCOAL, numc: CHARCOAL, icon: "🚀",
  },
];

function ToolCard({ tool, onClick }) {
  const clickable = !!tool.path;
  return (
    <div
      onClick={() => clickable && onClick(tool.path)}
      style={{
        background: tool.bg,
        border: `1.5px solid ${tool.bord}`,
        borderRadius: 16,
        padding: "22px 24px",
        display: "flex",
        gap: 20,
        alignItems: "flex-start",
        cursor: clickable ? "pointer" : "default",
        transition: "transform 0.12s, box-shadow 0.12s",
        boxShadow: "0 2px 8px rgba(74,69,88,0.07)",
      }}
      onMouseEnter={e => {
        if (clickable) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 6px 20px rgba(74,69,88,0.13)";
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(74,69,88,0.07)";
      }}
    >
      {/* Number + icon column */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0, width: 54 }}>
        <div style={{
          width: 46, height: 46, borderRadius: "50%",
          background: tool.numc,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: WHITE,
        }}>
          {tool.num}
        </div>
        <span style={{ fontSize: 24, lineHeight: 1 }}>{tool.icon}</span>
      </div>

      {/* Content column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
          <span style={{
            fontFamily: "var(--font-display)", fontSize: 19,
            color: tool.titc, lineHeight: 1.2,
          }}>
            {tool.label}
          </span>
          {clickable && (
            <span style={{ fontSize: 12, color: tool.titc, opacity: 0.55, fontWeight: 600 }}>Open →</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: tool.titc, opacity: 0.6, fontStyle: "italic", marginBottom: 12 }}>
          {tool.sub}
        </div>
        <div style={{ height: 1, background: tool.bord, marginBottom: 12 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {tool.steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: tool.numc, fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 2 }}>•</span>
              <span style={{ fontSize: 14, color: CHARCOAL, lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function QuickStartPage() {
  const navigate = useNavigate();

  function handleDownload() {
    const a = document.createElement("a");
    a.href = "/quick-start-reel.png";
    a.download = "AZ_Coalition_Comms_Hub_Quick_Start.png";
    a.click();
  }

  return (
    <ToolPage
      eyebrow="Help"
      title="Quick Start Guide"
      desc="Everything you need to know to go from research to published post."
      accentColor={TEAL}
    >
      <div style={{ maxWidth: "var(--max-width)", margin: "0 auto", padding: "36px 24px 64px" }}>

        {/* Workflow diagram */}
        <div style={{
          background: "var(--surface)", border: "1.5px solid var(--border)",
          borderRadius: 14, padding: "24px 28px 20px",
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 18 }}>
            How the tools connect
          </div>

          {/* Input boxes row */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, textAlign: "center", background: "#E0F2EC", border: "1.5px solid #A8D9C8", borderRadius: 10, padding: "10px 8px", fontSize: 13, fontWeight: 700, color: TEAL }}>Research</div>
            <div style={{ flex: 1, textAlign: "center", background: "#FDE8D8", border: "1.5px solid #F0C4A8", borderRadius: 10, padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "#7A3010" }}>Rapid Response</div>
            <div style={{ flex: 1, textAlign: "center", background: "#FFF0E8", border: "1.5px solid #F0C4A8", borderRadius: 10, padding: "10px 8px", fontSize: 13, fontWeight: 700, color: TERRA }}>Rebuttal Generator</div>
          </div>

          {/* Converging lines — SVG with fixed viewBox, no stretching */}
          <svg viewBox="0 0 300 40" height="40" style={{ display: "block", width: "100%", overflow: "visible" }}>
            <line x1="50"  y1="0" x2="50"  y2="20" stroke="#B0C4BC" strokeWidth="1" />
            <line x1="50"  y1="20" x2="150" y2="20" stroke="#B0C4BC" strokeWidth="1" />
            <line x1="150" y1="0" x2="150" y2="20" stroke="#B0C4BC" strokeWidth="1" />
            <line x1="250" y1="0" x2="250" y2="20" stroke="#B0C4BC" strokeWidth="1" />
            <line x1="250" y1="20" x2="150" y2="20" stroke="#B0C4BC" strokeWidth="1" />
            <line x1="150" y1="20" x2="150" y2="38" stroke="#B0C4BC" strokeWidth="1" />
            <polygon points="145,33 155,33 150,40" fill="#B0C4BC" />
          </svg>

          {/* Message Machine hub */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ background: "#E0FAF5", border: "2px solid #3ECFB2", borderRadius: 12, padding: "12px 32px", fontSize: 15, fontWeight: 700, color: "#085041" }}>
              Message Machine
            </div>
          </div>

          {/* Arrow down */}
          <svg viewBox="0 0 300 30" height="30" style={{ display: "block", width: "100%" }}>
            <line x1="150" y1="0" x2="150" y2="22" stroke="#B0C4BC" strokeWidth="1" />
            <polygon points="145,18 155,18 150,26" fill="#B0C4BC" />
          </svg>

          {/* Output row */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
            <div style={{ background: GOLD, borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, color: TEAL }}>Copy & Post</div>
            <span style={{ fontSize: 13, color: "var(--text-mute)", fontStyle: "italic" }}>and / or</span>
            <div style={{ background: TEAL, borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, color: WHITE }}>Save to Library</div>
          </div>
        </div>

        {/* Tool cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
          {TOOLS.map(tool => (
            <ToolCard key={tool.num} tool={tool} onClick={navigate} />
          ))}
        </div>

        {/* Reminders */}
        <div style={{
          background: "#E0F2EC", border: "1.5px solid #A8D9C8",
          borderRadius: 14, padding: "18px 22px",
          display: "flex", flexDirection: "column", gap: 10, marginBottom: 28,
        }}>
          {[
            ["⚠️", "All AI output is a draft — always verify facts and claims before publishing."],
            ["💾", "Nothing saves automatically — click Save to Library to keep your work."],
            ["👥", "The Library is shared — all coalition staff see the same campaigns in real time."],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: TEAL, lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>

        {/* Download strip */}
        <div style={{
          border: "2px solid var(--border)",
          borderRadius: 14, padding: "18px 22px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap",
          background: "var(--surface)",
        }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 17, color: CHARCOAL, marginBottom: 4 }}>
              Quick Start — Vertical Reel
            </div>
            <div style={{ fontSize: 13, color: "var(--text-mute)", lineHeight: 1.5 }}>
              1080 × 1920 px PNG · Save to your phone or share with your team
            </div>
          </div>
          <button
            onClick={handleDownload}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 22px", background: TEAL, color: WHITE,
              border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 700,
              fontFamily: "var(--font-body)", letterSpacing: "0.04em",
              cursor: "pointer", whiteSpace: "nowrap", transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#164535"}
            onMouseLeave={e => e.currentTarget.style.background = TEAL}
          >
            ↓ Download PNG
          </button>
        </div>

      </div>
    </ToolPage>
  );
}
