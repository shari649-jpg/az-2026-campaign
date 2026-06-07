import { useNavigate } from "react-router-dom";

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
    path: "/messaging",
    label: "Message Machine",
    eyebrow: "Comms",
    desc: "Generate platform-ready social media posts tailored to issue, audience, voice, and style — across all six platforms.",
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
];

const WORKFLOWS = [
  {
    title: "Research → Message",
    desc: "Research a candidate or issue, then take findings directly into the Message Machine to generate platform posts.",
    steps: ["Candidate Research", "→", "Message Machine"],
    color: "#1D5C4A",
  },
  {
    title: "Monitor → Rebuttal",
    desc: "Catch a false narrative in Rapid Response, then send it straight to the Rebuttal Generator.",
    steps: ["Rapid Response", "→", "Rebuttal Generator"],
    color: "#C1673A",
  },
];

export default function HomePage() {
  const navigate = useNavigate();

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
              Coalition Operations Hub
            </h1>
            <p style={{
              fontSize: 17,
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.65,
              maxWidth: 520,
            }}>
              AI-powered campaign tools for research, messaging, and rapid response.
              Use each tool independently or chain them together.
            </p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "var(--max-width)", margin: "0 auto", padding: "44px 24px 64px" }}>
        <div style={{ marginBottom: 56 }}>
          <SectionLabel>Tools</SectionLabel>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 18,
            marginTop: 20,
          }}>
            {TOOLS.map(tool => (
              <ToolCard key={tool.path} tool={tool} onNavigate={navigate} />
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 56 }}>
          <SectionLabel>Combined Workflows</SectionLabel>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 18,
            marginTop: 20,
          }}>
            {WORKFLOWS.map(wf => (
              <WorkflowCard key={wf.title} wf={wf} />
            ))}
          </div>
        </div>

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
        padding: 26,
        background: "var(--bg)",
        cursor: isLive ? "pointer" : "default",
        opacity: isLive ? 1 : 0.6,
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 12,
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
          fontSize: 21,
          color: "var(--text)",
          lineHeight: 1.2,
          marginBottom: 8,
        }}>
          {tool.label}
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-mid)", lineHeight: 1.65 }}>
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
