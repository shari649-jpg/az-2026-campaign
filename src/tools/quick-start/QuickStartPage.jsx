import { useNavigate } from "react-router-dom";
import ToolPage from "../../components/ToolPage";

const TEAL       = "var(--teal)";
const GOLD       = "var(--gold)";
const CHARCOAL   = "var(--charcoal)";
const TERRA      = "var(--terracotta)";
const WHITE      = "var(--bg)";
const MM_TEAL    = "#085041"; // Message Machine — matches ManualPage's shade
const RR_BROWN   = "#7A3010"; // Rapid Response
const MEDIA_TEAL = "#0F6E56"; // Media Library & Graphics Studio
const GOLD_DEEP  = "#8a6a10"; // Storm Chasers Hub — dark enough for text contrast

// The seven modules, in the order they appear on the Quick Reference card.
// Each is a compact reference entry, not a step-by-step — for the numbered
// walkthrough of any one tool, see the full Comms Hub Guide.
const MODULES = [
  {
    label: "Message Machine", path: "/messaging", icon: "⚙️",
    bg: "#E0FAF5", bord: "#9DD8CC", titc: MM_TEAL,
    desc: "Generates drafts for all 6 platforms at once (Facebook, Instagram, Threads, BlueSky, Twitter/X, TikTok). Expand, shorten, or rephrase per platform. Pro Mode for advanced fields to select audience, voice, tone, etc.",
  },
  {
    label: "Rapid Response", path: "/rapid-response", icon: "⚡",
    bg: "#FDE8D8", bord: "#F0C4A8", titc: RR_BROWN,
    desc: "Fetch an article by URL or paste text. AI summarizes claims & context, then sends straight to Message Machine.",
  },
  {
    label: "Rebuttal Generator", path: "/rebuttal", icon: "🛡️",
    bg: "#FFF0E8", bord: "#F0C4A8", titc: TERRA,
    desc: "Built to respond to a specific activist or opposing profile. Builds an anchor phrase + rebuttal angles, then 6-platform posts.",
  },
  {
    label: "Research (Arizona plus ~60 national/state candidate data deemed flippable)", path: "/research", icon: "🔍",
    bg: "#E0F2EC", bord: "#A8D9C8", titc: TEAL,
    desc: "Search facts, compare races, and pull district-level detail. Select multiple facts to carry into a draft.",
  },
  {
    label: "Media & Graphics Studio", path: "/media", icon: "🎨",
    bg: "#DFF7F1", bord: "#A8E0D2", titc: MEDIA_TEAL,
    desc: "Browse approved images/video, or build branded graphics (5 templates, single or 4-slide carousel). Found in the More ▾ menu.",
  },
  {
    label: "Shared Library", path: "/library", icon: "📚",
    bg: "#EEF1F8", bord: "#C5CDE8", titc: CHARCOAL,
    desc: "Every saved draft, searchable and filterable by tool. Reopen anything to reload it into its tool. Delete your own; Managers/Admins delete any.",
  },
  {
    label: "Storm Chasers Hub", path: "/storms", icon: "🌩️",
    bg: "#fdf3c0", bord: "#e8d488", titc: GOLD_DEEP,
    desc: "Coordinate a full multi-platform toolkit across your entire org. Members create & manage their own posts; Managers/Admins review, publish, archive and lock text (when desired).",
  },
];

const ROLES = [
  {
    role: "Member", color: TEAL, bg: "#E0F2EC", bord: "#A8D9C8",
    desc: "Full access to Message Machine, Rapid Response, Rebuttal, Research, Media, Shared Library. Can create a Storm and manage own posts.",
  },
  {
    role: "Manager", color: GOLD_DEEP, bg: "#fdf3c0", bord: "#e8d488",
    desc: "Everything a Member can do, plus reviewing/publishing Storms, locking platform text, and the Admin panel.",
  },
  {
    role: "Administrator", color: TERRA, bg: "#FFF0E8", bord: "#F0C4A8",
    desc: "Everything a Manager can do, plus user role changes and account deletion. Access to the sandbox for video transcription and post creation.",
  },
];

function ModuleCard({ mod, onClick }) {
  return (
    <div
      onClick={() => onClick(mod.path)}
      style={{
        background: mod.bg, border: `1.5px solid ${mod.bord}`,
        borderRadius: 14, padding: "18px 20px",
        display: "flex", gap: 16, alignItems: "flex-start",
        cursor: "pointer",
        transition: "transform 0.12s, box-shadow 0.12s",
        boxShadow: "0 2px 8px rgba(74,69,88,0.07)",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(74,69,88,0.13)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(74,69,88,0.07)"; }}
    >
      <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{mod.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 17, color: mod.titc, lineHeight: 1.2 }}>{mod.label}</span>
          <span style={{ fontSize: 11, color: mod.titc, opacity: 0.55, fontWeight: 600 }}>Open →</span>
        </div>
        <div style={{ fontSize: 13.5, color: CHARCOAL, lineHeight: 1.55 }}>{mod.desc}</div>
      </div>
    </div>
  );
}

function RoleCard({ r }) {
  return (
    <div style={{ flex: "1 1 200px", background: r.bg, border: `1.5px solid ${r.bord}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: r.color, marginBottom: 8 }}>{r.role}</div>
      <div style={{ fontSize: 13, color: CHARCOAL, lineHeight: 1.55 }}>{r.desc}</div>
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
      title="Comms Hub Quick Reference"
      desc="Keep this handy — a two-page map of every tool, how they connect, and the two rules that matter most. For the full walkthrough, see the User Manual."
      accentColor={TEAL}
    >
      <div style={{ maxWidth: "var(--max-width)", margin: "0 auto", padding: "36px 24px 64px" }}>

        {/* THE WORKFLOW */}
        <div style={{ background: "var(--bg)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "24px 28px 20px", marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 18 }}>
            The Workflow
          </div>

          {/* Row 1: input boxes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ textAlign: "center", background: "#E0F2EC", border: "1.5px solid #A8D9C8", borderRadius: 10, padding: "10px 8px", fontSize: 13, fontWeight: 700, color: TEAL }}>Research</div>
            <div style={{ textAlign: "center", background: "#FDE8D8", border: "1.5px solid #F0C4A8", borderRadius: 10, padding: "10px 8px", fontSize: 13, fontWeight: 700, color: RR_BROWN }}>Rapid Response</div>
            <div style={{ textAlign: "center", background: "#FFF0E8", border: "1.5px solid #F0C4A8", borderRadius: 10, padding: "10px 8px", fontSize: 13, fontWeight: 700, color: TERRA }}>Rebuttal Generator</div>
          </div>

          {/* Row 2: connecting lines down to Message Machine */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, height: 40 }}>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: "50%", top: 0, width: 1.5, height: 20, background: "#B0C4BC" }} />
              <div style={{ position: "absolute", left: "50%", top: 20, right: -6, height: 1.5, background: "#B0C4BC" }} />
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: "50%", top: 0, width: 1.5, height: 40, background: "#B0C4BC" }} />
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", right: "50%", top: 0, width: 1.5, height: 20, background: "#B0C4BC" }} />
              <div style={{ position: "absolute", right: "50%", top: 20, left: -6, height: 1.5, background: "#B0C4BC" }} />
            </div>
          </div>

          {/* Row 3: Message Machine centered */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ background: "#E0FAF5", border: "2px solid #3ECFB2", borderRadius: 12, padding: "12px 32px", fontSize: 15, fontWeight: 700, color: MM_TEAL }}>
              Message Machine
            </div>
          </div>

          {/* Arrow down to outputs */}
          <div style={{ display: "flex", justifyContent: "center", flexDirection: "column", alignItems: "center", height: 28 }}>
            <div style={{ width: 1.5, height: 18, background: "#B0C4BC" }} />
            <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid #B0C4BC" }} />
          </div>

          {/* Outputs */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ background: GOLD, borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, color: TEAL }}>Copy & Post</div>
            <span style={{ fontSize: 13, color: "var(--text-mute)", fontStyle: "italic" }}>·</span>
            <div style={{ background: TEAL, borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, color: WHITE }}>Save to Library</div>
          </div>
        </div>

        {/* THE MODULES */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 12 }}>
          The Modules
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          {MODULES.map(mod => (
            <ModuleCard key={mod.label} mod={mod} onClick={navigate} />
          ))}
        </div>

        {/* ROLES & WHAT THEY UNLOCK */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 12 }}>
          Roles & What They Unlock
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
          {ROLES.map(r => (
            <RoleCard key={r.role} r={r} />
          ))}
        </div>

        {/* TWO RULES TO REMEMBER */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 12 }}>
          Two Rules to Remember
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {[
            ["1", "AI-generated content is a draft", "Message Machine, Rapid Response, Rebuttal, and Storm posts all produce a starting draft — not a finished, fact-checked product. Always read it over and verify names, dates, and claims before you publish anything publicly."],
            ["2", "Nothing saves automatically", "If you want to keep something you've generated, click \u201cSave to Library.\u201d If you navigate away without saving, it's gone for good."],
          ].map(([num, title, body]) => (
            <div key={num} style={{ background: "#E0F2EC", border: "1.5px solid #A8D9C8", borderRadius: 14, padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: TEAL, color: WHITE, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                {num}
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: TEAL, marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 13.5, color: CHARCOAL, lineHeight: 1.55 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* SUPPORT */}
        <div style={{ border: "2px solid var(--border)", borderRadius: 14, padding: "18px 22px", marginBottom: 28, background: "var(--bg)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: CHARCOAL, marginBottom: 6 }}>
            Need help?
          </div>
          <div style={{ fontSize: 13.5, color: "var(--text-mid)", lineHeight: 1.6 }}>
            Look for the 🕵️‍♂️ detective icon on any page for a quick in-context reminder, or check the{" "}
            <button
              onClick={() => navigate("/manual")}
              style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: TEAL, textDecoration: "underline", cursor: "pointer" }}
            >
              full Comms Hub Guide
            </button>{" "}
            for the complete reference. Questions, access issues, or feedback — reach your Comms Hub Manager or Administrator.
          </div>
        </div>

        {/* Download strip */}
        <div style={{ border: "2px solid var(--border)", borderRadius: 14, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", background: "var(--bg)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 17, color: CHARCOAL, marginBottom: 4 }}>
              Quick Reference — Mobile Graphic
            </div>
            <div style={{ fontSize: 13, color: "var(--text-mute)", lineHeight: 1.5 }}>
              1080 × 1920 px PNG · Save to your phone or share with your team
            </div>
          </div>
          <button
            onClick={handleDownload}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px", background: TEAL, color: WHITE, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: "var(--font-body)", letterSpacing: "0.04em", cursor: "pointer", whiteSpace: "nowrap", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#164535"}
            onMouseLeave={e => e.currentTarget.style.background = TEAL}
          >
            ↓ Download PNG
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <span style={{ fontSize: 12, color: "var(--text-mute)", fontStyle: "italic" }}>
            Internal coalition use only · Not for public distribution
          </span>
        </div>

      </div>
    </ToolPage>
  );
}
