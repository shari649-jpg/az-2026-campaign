import { useNavigate } from "react-router-dom";

// Rebuilt (Aug 26 2026) to match the AZ_Coalition_Comms_Hub_Quick_Reference
// PDF exactly — layout and coloring, not just content. That PDF is now the
// source of truth for this page's design, not the shared ToolPage banner
// every other tool page uses. Key differences from the old version:
// plum (not teal) header with the org logo, a flat 3-box horizontal
// workflow diagram (not the old vertical 3-into-1-into-2 layout), and flat
// colored-left-border module/role/rule cards with no icons (the PDF's
// cards don't have icons — the old teal version's icon circles were a
// deviation this rebuild intentionally drops).
const PURPLE  = "var(--purple)";
const TEAL    = "var(--teal)";
const GOLD    = "var(--gold)";
const TERRA   = "var(--terracotta)";
const CHARCOAL= "var(--charcoal)";
const CHROME  = "var(--surface-alt)";
const WHITE   = "var(--bg)";

// The seven modules, in the order they appear on the Quick Reference PDF.
// `bar` is the left-border color, matching the PDF's per-module color coding.
const MODULES = [
  {
    label: "Message Machine", path: "/messaging", bar: PURPLE,
    desc: "Generates drafts for all 6 platforms at once (Facebook, Instagram, Threads, BlueSky, Twitter/X, TikTok). Expand, shorten, or rephrase per platform. Pro Mode for advanced fields to select audience, voice, tone, etc.",
  },
  {
    label: "Rapid Response", path: "/rapid-response", bar: TERRA,
    desc: "Fetch an article by URL or paste text. AI summarizes claims & context, then sends straight to Message Machine.",
  },
  {
    label: "Rebuttal Generator", path: "/rebuttal", bar: PURPLE,
    desc: "Built to respond to a specific activist or opposing profile. Builds an anchor phrase + rebuttal angles, then 6-platform posts.",
  },
  {
    label: "Research (Arizona plus ~60 national/state candidate data deemed flippable)", path: "/research", bar: TEAL,
    desc: "Search facts, compare races, and pull district-level detail. Select multiple facts to carry into a draft.",
  },
  {
    label: "Media & Graphics Studio", path: "/media", bar: TERRA,
    desc: "Browse approved images/video, or build branded graphics (5 templates, single or 4-slide carousel). Found in the More ▾ menu.",
  },
  {
    label: "Shared Library", path: "/library", bar: GOLD,
    desc: "Every saved draft, searchable and filterable by tool. Reopen anything to reload it into its tool. Delete your own; Managers/Admins delete any.",
  },
  {
    label: "Storm Chasers Hub", path: "/storms", bar: PURPLE,
    desc: "Coordinate a full multi-platform toolkit across your entire org. Members create & manage their own posts; Managers/Admins review, publish, archive and lock text (when desired).",
  },
];

const ROLES = [
  {
    role: "Member", bar: TEAL,
    desc: "Full access to Message Machine, Rapid Response, Rebuttal, Research, Media, Shared Library. Can create a Storm and manage own posts.",
  },
  {
    role: "Manager", bar: GOLD,
    desc: "Everything a Member can do, plus reviewing/publishing Storms, locking platform text, and the Admin panel.",
  },
  {
    role: "Administrator", bar: TERRA,
    desc: "Everything a Manager can do, plus user role changes and account deletion. Access to the sandbox for video transcription and post creation.",
  },
];

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function FlatCard({ bar, title, titleColor = PURPLE, desc, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: CHROME, borderLeft: `5px solid ${bar}`, borderRadius: 8,
        padding: "16px 20px", cursor: onClick ? "pointer" : "default",
        transition: "transform 0.12s",
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = "translateX(2px)"; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = "translateX(0)"; }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: titleColor, lineHeight: 1.25 }}>{title}</span>
        {onClick && <span style={{ fontSize: 11, color: titleColor, opacity: 0.55, fontWeight: 600 }}>Open →</span>}
      </div>
      <div style={{ fontSize: 13.5, color: CHARCOAL, lineHeight: 1.55 }}>{desc}</div>
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
    <div>
      {/* ── Header — plum banner matching the PDF exactly, not the shared
          teal ToolPage banner every other tool page uses. ── */}
      <div style={{ background: PURPLE, padding: "28px 24px" }}>
        <div style={{ maxWidth: "var(--max-width)", margin: "0 auto", display: "flex", alignItems: "center", gap: 18 }}>
          <img src="/azc-logo.png" alt="Arizona Coalition" style={{ height: 56, width: 56, objectFit: "contain", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, marginBottom: 4 }}>
              Arizona Coalition
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, color: WHITE, lineHeight: 1.15 }}>
              Comms Hub Quick Reference
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "var(--max-width)", margin: "0 auto", padding: "28px 24px 64px" }}>

        {/* Intro line */}
        <p style={{ fontSize: 15, color: CHARCOAL, lineHeight: 1.6, marginBottom: 28 }}>
          <strong>Keep this handy.</strong> A two-page map of every tool, how they connect, and the two rules that matter most. For the full walkthrough, see the{" "}
          <button
            onClick={() => navigate("/manual")}
            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", textDecoration: "underline", cursor: "pointer" }}
          >
            User Manual
          </button>.
        </p>

        {/* THE WORKFLOW — flat 3-box horizontal flow, matching the PDF */}
        <SectionLabel>The Workflow</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 32 }}>
          <div style={{ flex: "1 1 220px", background: TEAL, borderRadius: 8, padding: "14px 16px", textAlign: "center", fontSize: 13.5, fontWeight: 700, color: WHITE }}>
            Research / Rapid Response / Rebuttal
          </div>
          <span style={{ fontSize: 18, color: GOLD, fontWeight: 700 }}>→</span>
          <div style={{ flex: "0 1 170px", background: PURPLE, borderRadius: 8, padding: "14px 16px", textAlign: "center", fontSize: 13.5, fontWeight: 700, color: WHITE }}>
            Message Machine
          </div>
          <span style={{ fontSize: 18, color: GOLD, fontWeight: 700 }}>→</span>
          <div style={{ flex: "1 1 220px", background: TERRA, borderRadius: 8, padding: "14px 16px", textAlign: "center", fontSize: 13.5, fontWeight: 700, color: WHITE }}>
            Copy & Post · Save to Library
          </div>
        </div>

        {/* THE MODULES */}
        <SectionLabel>The Modules</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
          {MODULES.map(mod => (
            <FlatCard key={mod.label} bar={mod.bar} title={mod.label} desc={mod.desc} onClick={() => navigate(mod.path)} />
          ))}
        </div>

        {/* ROLES & WHAT THEY UNLOCK */}
        <SectionLabel>Roles & What They Unlock</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
          {ROLES.map(r => (
            <FlatCard key={r.role} bar={r.bar} title={r.role} desc={r.desc} />
          ))}
        </div>

        {/* TWO RULES TO REMEMBER */}
        <SectionLabel>Two Rules to Remember</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
          {[
            ["1", "AI-generated content is a draft", "Message Machine, Rapid Response, Rebuttal, and Storm posts all produce a starting draft — not a finished, fact-checked product. Always read it over and verify names, dates, and claims before you publish anything publicly."],
            ["2", "Nothing saves automatically", "If you want to keep something you've generated, click \u201cSave to Library.\u201d If you navigate away without saving, it's gone for good."],
          ].map(([num, title, body]) => (
            <div key={num} style={{ background: CHROME, borderLeft: `5px solid ${GOLD}`, borderRadius: 8, padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: PURPLE, color: WHITE, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {num}
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: PURPLE, marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 13.5, color: CHARCOAL, lineHeight: 1.55 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* SUPPORT */}
        <SectionLabel>Support</SectionLabel>
        <div style={{ background: CHROME, borderLeft: `5px solid ${TEAL}`, borderRadius: 8, padding: "16px 20px", marginBottom: 32 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: PURPLE, marginBottom: 6 }}>
            Need help?
          </div>
          <div style={{ fontSize: 13.5, color: CHARCOAL, lineHeight: 1.6 }}>
            Look for the 🕵️‍♂️ detective icon for a quick in-context reminder, or check the{" "}
            <button
              onClick={() => navigate("/manual")}
              style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: TEAL, textDecoration: "underline", cursor: "pointer" }}
            >
              full User Manual
            </button>{" "}
            for the complete reference. Questions, access issues, or feedback — reach your Comms Hub Manager or Administrator.
          </div>
        </div>

        {/* Download strip */}
        <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", background: WHITE }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: CHARCOAL, marginBottom: 4 }}>
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
    </div>
  );
}
