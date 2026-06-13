import ToolPage from "../../components/ToolPage";

// ─── Brand tokens (mirrors CSS variables already in the app) ───────────────
const TEAL      = "#1D5C4A";
const TURQ      = "#3ECFB2";
const GOLD      = "#F5C842";
const CHARCOAL  = "#4A4558";
const TERRA     = "#C1673A";
const WHITE     = "#FFFFFF";
const BG        = "#F5F4F0";

// Card colour definitions per tool
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
    bg:    "#E0F2EC",
    bord:  "#A8D9C8",
    titc:  TEAL,
    numc:  TEAL,
    icon:  "🔍",
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
    bg:    "#FDE8D8",
    bord:  "#F0C4A8",
    titc:  "#7A3010",
    numc:  "#7A3010",
    icon:  "⚡",
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
    bg:    "#FFF0E8",
    bord:  "#F0C4A8",
    titc:  TERRA,
    numc:  TERRA,
    icon:  "🛡️",
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
    bg:    "#E0FAF5",
    bord:  "#9DD8CC",
    titc:  "#085041",
    numc:  "#085041",
    icon:  "⚙️",
  },
  {
    num:   "5",
    label: "Copy & Post or Save",
    sub:   "Publish or store your campaign",
    path:  null,
    steps: [
      "Copy individual platform posts to publish directly",
      "Save to Library to store the full campaign",
      "Do one or both — nothing saves automatically",
    ],
    bg:    "#EEF1F8",
    bord:  "#C5CDE8",
    titc:  CHARCOAL,
    numc:  CHARCOAL,
    icon:  "🚀",
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────

function FlowPill({ label }) {
  return (
    <span style={{
      background: "rgba(29,92,74,0.12)",
      border: "1.5px solid rgba(29,92,74,0.2)",
      borderRadius: 20,
      padding: "3px 13px",
      fontSize: 13,
      fontWeight: 700,
      color: TEAL,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function ToolCard({ tool, navigate }) {
  const isClickable = !!tool.path;
  return (
    <div
      onClick={() => isClickable && navigate(tool.path)}
      style={{
        background: tool.bg,
        border: `1.5px solid ${tool.bord}`,
        borderRadius: 16,
        padding: "22px 24px",
        display: "flex",
        gap: 18,
        alignItems: "flex-start",
        cursor: isClickable ? "pointer" : "default",
        transition: "transform 0.12s, box-shadow 0.12s",
        boxShadow: "0 2px 8px rgba(74,69,88,0.07)",
      }}
      onMouseEnter={e => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 6px 20px rgba(74,69,88,0.12)";
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(74,69,88,0.07)";
      }}
    >
      {/* Left: number + icon */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0, width: 56 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: tool.numc,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 700,
          color: WHITE,
          flexShrink: 0,
        }}>
          {tool.num}
        </div>
        <span style={{ fontSize: 26, lineHeight: 1 }}>{tool.icon}</span>
      </div>

      {/* Right: content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 700,
            color: tool.titc,
            lineHeight: 1.2,
          }}>
            {tool.label}
          </span>
          {isClickable && (
            <span style={{ fontSize: 12, color: tool.titc, opacity: 0.6, fontWeight: 600 }}>
              Open →
            </span>
          )}
        </div>
        <div style={{
          fontSize: 13,
          fontWeight: 500,
          color: tool.titc,
          opacity: 0.65,
          fontStyle: "italic",
          marginBottom: 12,
        }}>
          {tool.sub}
        </div>

        <div style={{
          height: 1,
          background: tool.bord,
          marginBottom: 12,
          opacity: 0.8,
        }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {tool.steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: tool.numc, fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 1 }}>•</span>
              <span style={{ fontSize: 14, color: CHARCOAL, lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FooterNote({ icon, text }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: TEAL, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function QuickStartPage() {
  // Inline navigate using window.location as a fallback
  // (replace with useNavigate() once wired into the router)
  function navigate(path) {
    window.location.href = path;
  }

  function handleDownload() {
    const link = document.createElement("a");
    link.href = "/quick-start-reel.png";
    link.download = "AZ_Coalition_Comms_Hub_Quick_Start.png";
    link.click();
  }

  return (
    <ToolPage
      eyebrow="Help"
      title="Quick Start Guide"
      desc="Everything you need to know to go from research to published post."
      accentColor={TEAL}
    >
      <div style={{ maxWidth: "var(--max-width)", margin: "0 auto", padding: "36px 24px 64px" }}>

        {/* ── Workflow flow strip ─────────────────────────────────── */}
        <div style={{
          background: GOLD,
          borderRadius: 14,
          padding: "18px 24px",
          marginBottom: 32,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: TEAL,
            marginRight: 4,
            whiteSpace: "nowrap",
          }}>
            Workflow
          </span>
          <FlowPill label="Research" />
          <span style={{ color: TEAL, opacity: 0.45, fontSize: 16 }}>→</span>
          <FlowPill label="Rapid Response" />
          <span style={{ color: TEAL, opacity: 0.45, fontSize: 16 }}>→</span>
          <FlowPill label="Rebuttal Generator" />
          <span style={{ color: TEAL, opacity: 0.45, fontSize: 16 }}>→</span>
          <FlowPill label="Message Machine" />
          <span style={{ color: TEAL, opacity: 0.45, fontSize: 16 }}>→</span>
          <FlowPill label="Copy & Post / Save to Library" />
        </div>

        {/* ── Tool cards ─────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
          {TOOLS.map(tool => (
            <ToolCard key={tool.num} tool={tool} navigate={navigate} />
          ))}
        </div>

        {/* ── Reminders box ──────────────────────────────────────── */}
        <div style={{
          background: "#E0F2EC",
          border: "1.5px solid #A8D9C8",
          borderRadius: 14,
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 32,
        }}>
          <FooterNote icon="⚠️" text="All AI output is a draft — always verify facts and claims before publishing." />
          <FooterNote icon="💾" text="Nothing saves automatically — click Save to Library to keep your work." />
          <FooterNote icon="👥" text="The Library is shared — all coalition staff see the same campaigns in real time." />
        </div>

        {/* ── Download strip ─────────────────────────────────────── */}
        <div style={{
          border: `2px solid var(--border, #e2dfe8)`,
          borderRadius: 14,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          background: "var(--surface, #fff)",
        }}>
          <div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 17,
              color: CHARCOAL,
              marginBottom: 4,
            }}>
              Quick Start — Vertical Reel
            </div>
            <div style={{ fontSize: 13, color: "var(--text-mute, #888)", lineHeight: 1.5 }}>
              1080 × 1920 px PNG · Save to your phone or share with your team
            </div>
          </div>
          <button
            onClick={handleDownload}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 22px",
              background: TEAL,
              color: WHITE,
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "var(--font-body)",
              letterSpacing: "0.04em",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background 0.15s",
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
