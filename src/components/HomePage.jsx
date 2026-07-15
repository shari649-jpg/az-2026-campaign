import { useState } from "react";
import { useNavigate } from "react-router-dom";

// Message Machine is the primary "just do the thing" path (see punch list:
// homepage overwhelm fix, option 1). It gets its own hero CTA below instead
// of sitting in the tools grid as one card among equals.
const MESSAGE_MACHINE = {
  path: "/messaging",
  label: "Message Machine",
};

const TOOLS = [
  {
    path: "/research",
    label: "Research: Candidates, Issues & Districts",
    eyebrow: "Intel",
    desc: "Deep-dive profiles on candidates — positions, vulnerabilities, voting records. Search by issue, district demographics, or race comparisons.",
    status: "live",
    color: "#1D5C4A",
    bg: "#e0f2ec",
  },
  {
    path: "/rebuttal",
    label: "Rebuttal Campaign Generator",
    eyebrow: "Rapid Rebuttal",
    desc: "Turn a false narrative into a full multi-activist, multi-platform rebuttal campaign with anchor phrase and rebuttal lenses.",
    status: "live",
    color: "#C1673A",
    bg: "#f7e0d4",
  },
  {
    path: "/rapid-response",
    label: "Rapid Response",
    eyebrow: "Monitoring",
    desc: "Read any article, extract key facts and quotes, and push directly to Message Machine — with a full article library.",
    status: "live",
    color: "#1D5C4A",
    bg: "#e0f2ec",
  },
  {
    path: "/media",
    label: "Media",
    eyebrow: "Media",
    desc: "Browse the coalition's shared photo and video library, or build branded graphics and quote cards in Graphics Studio.",
    status: "live",
    color: "#0F6E56",
    bg: "#dff7f1",
  },
  {
    path: "/library",
    label: "Shared Library",
    eyebrow: "Library",
    desc: "Every saved campaign and article from Message Machine, Rebuttal, and Rapid Response — visible to the whole coalition team.",
    status: "live",
    color: "#4A4558",
    bg: "#eef1f8",
  },
  {
    path: "/storms",
    label: "Storm Chasers Hub",
    eyebrow: "Advanced",
    desc: "Coordinate a multi-platform Storm campaign — build posts, manage status, and publish across the whole team at once.",
    status: "live",
    color: "#8a6a10",
    bg: "#fdf3c0",
  },
];

const WORKFLOWS = [
  {
    title: "Research → Message → Library",
    desc: "Research a candidate or issue, send the facts and quotes you check straight into Message Machine, then save the finished campaign to the Shared Library.",
    steps: ["Research", "→", "Message Machine", "→", "Library"],
    color: "#1D5C4A",
  },
  {
    title: "React → Message → Library",
    desc: "When a story breaks, the team decides in the moment whether it goes to Rapid Response or straight to the Rebuttal Generator. Either way, it flows into Message Machine, then gets saved to the Shared Library.",
    steps: ["Rapid Response", "or", "Rebuttal Generator", "→", "Message Machine", "→", "Library"],
    color: "#C1673A",
  },
  {
    title: "Message → Storm",
    desc: "Build a post in Message Machine, then push it straight into a coordinated, multi-platform Storm campaign. (Managers/Administrators)",
    steps: ["Message Machine", "→", "Storm Chasers Hub"],
    color: "#4A4558",
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);

  return (
    <div>
      <div style={{
        background: "var(--teal)",
        padding: "52px 24px 48px",
        borderBottom: "4px solid var(--gold)",
      }}>
        <div style={{ maxWidth: "var(--max-width)", margin: "0 auto", display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <img
            src="/azc-logo-teal.png"
            alt="Arizona Coalition"
            style={{ height: 100, width: 100, objectFit: "contain", flexShrink: 0 }}
          />
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--gold)",
              marginBottom: 10,
            }}>
              Arizona 2026 · Internal Tools
            </div>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(32px, 5vw, 52px)",
              lineHeight: 1.1,
              color: "#ffffff",
              marginBottom: 12,
            }}>
              Coalition Comms Hub
            </h1>
            <p style={{
              fontSize: 17,
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.65,
              maxWidth: 480,
              marginBottom: 22,
            }}>
              Need to post something? Start with Message Machine — everything
              else is here when you're ready to go deeper.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <button
                onClick={() => navigate(MESSAGE_MACHINE.path)}
                style={{
                  background: "var(--gold)",
                  color: "#4A1B0C",
                  border: "none",
                  borderRadius: "var(--radius)",
                  padding: "14px 24px",
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                }}
              >
                Open Message Machine →
              </button>
              <button
                onClick={() => navigate("/manual")}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.75)",
                  fontSize: 13,
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                or take the full tour
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "var(--max-width)", margin: "0 auto", padding: "44px 24px 64px" }}>
        <CollapsibleToggle label="All Tools" open={toolsOpen} onToggle={() => setToolsOpen(o => !o)}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 14,
          }}>
            {TOOLS.map(tool => (
              <ToolCard key={tool.path} tool={tool} onNavigate={navigate} />
            ))}
          </div>
        </CollapsibleToggle>

        <CollapsibleToggle label="Combined Workflows" open={workflowsOpen} onToggle={() => setWorkflowsOpen(o => !o)}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 18,
          }}>
            {WORKFLOWS.map(wf => (
              <WorkflowCard key={wf.title} wf={wf} />
            ))}
          </div>
        </CollapsibleToggle>

        <div>
          <SectionLabel>Quick Links</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            {[
              { label: "AZ SOS Elections", href: "https://azsos.gov/elections" },
              { label: "AZ Legislature", href: "https://www.azleg.gov" },
              { label: "Ballotpedia AZ", href: "https://ballotpedia.org/Arizona" },
              { label: "My Arizona Vote", href: "https://my.arizona.vote" },
              { label: "E-Qual Petitions", href: "https://apps.arizona.vote/equal" },
              { label: "All Resources →", path: "/resources" },
            ].map(link => (
              link.href
                ? <a key={link.href} href={link.href} target="_blank" rel="noreferrer" style={quickLinkStyle}>{link.label} ↗</a>
                : <button key={link.path} onClick={() => navigate(link.path)} style={quickLinkStyle}>{link.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CollapsibleToggle({ label, open, onToggle, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <button
        onClick={onToggle}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 0,
          fontFamily: "var(--font-body)",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text-mid)",
        }}
      >
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
        {label}
      </button>
      {open && <div style={{ marginTop: 18 }}>{children}</div>}
    </div>
  );
}

const quickLinkStyle = {
  display: "inline-block",
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "var(--font-body)",
  letterSpacing: "0.03em",
  color: "var(--teal)",
  background: "var(--teal-light)",
  border: "2px solid var(--teal)",
  borderRadius: 8,
  cursor: "pointer",
  textDecoration: "none",
  transition: "background 0.15s",
};

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--text-mute)",
      paddingBottom: 10,
      borderBottom: "3px solid var(--gold)",
    }}>
      {children}
    </div>
  );
}

function ToolCard({ tool, onNavigate }) {
  const isLive = tool.status === "live";
  return (
    <div
      onClick={() => isLive && onNavigate(tool.path)}
      style={{
        border: "2px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
        background: "var(--bg)",
        cursor: isLive ? "pointer" : "default",
        opacity: isLive ? 1 : 0.6,
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
      onMouseEnter={e => {
        if (!isLive) return;
        e.currentTarget.style.borderColor = tool.color;
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(29,92,74,0.12)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: tool.color,
          background: tool.bg,
          padding: "3px 9px",
          borderRadius: 4,
        }}>
          {tool.eyebrow}
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: isLive ? "var(--teal)" : "var(--charcoal)",
        }}>
          {isLive ? "● Live" : "◌ Coming soon"}
        </span>
      </div>
      <div>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          color: "var(--text)",
          lineHeight: 1.2,
          marginBottom: 6,
        }}>
          {tool.label}
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-mid)", lineHeight: 1.55 }}>
          {tool.desc}
        </p>
      </div>
      {isLive && (
        <div style={{ marginTop: "auto", paddingTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: tool.color, letterSpacing: "0.03em" }}>
            Open →
          </span>
        </div>
      )}
    </div>
  );
}

function WorkflowCard({ wf }) {
  return (
    <div style={{
      border: "2px solid var(--border)",
      borderLeft: `4px solid ${wf.color}`,
      borderRadius: "var(--radius-lg)",
      padding: "20px 22px",
      background: "var(--surface)",
    }}>
      <h3 style={{
        fontFamily: "var(--font-display)",
        fontSize: 18,
        color: wf.color,
        marginBottom: 8,
      }}>
        {wf.title}
      </h3>
      <p style={{ fontSize: 14, color: "var(--text-mid)", lineHeight: 1.6, marginBottom: 14 }}>
        {wf.desc}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {wf.steps.map((step, i) => (
          step === "→"
            ? <span key={i} style={{ fontSize: 16, color: "var(--text-mute)" }}>→</span>
            : step === "or"
            ? <span key={i} style={{ fontSize: 12, fontStyle: "italic", color: "var(--text-mute)", padding: "0 2px" }}>or</span>
            : <span key={i} style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: wf.color,
                background: wf.color + "18",
                padding: "4px 10px",
                borderRadius: 6,
                textTransform: "uppercase",
              }}>
                {step}
              </span>
        ))}
      </div>
    </div>
  );
}
