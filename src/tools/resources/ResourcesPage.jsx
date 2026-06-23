import ToolPage from "../../components/ToolPage";

const RESOURCE_GROUPS = [
  {
    title: "Strategy Documents",
    color: "#1D5C4A",
    items: [
      {
        label: "AZ 2026 Messaging Strategy",
        desc: "District-by-district playbook, messaging frames, GOTV strategy",
        href: null,
        tag: "PDF",
      },
      {
        label: "Arizona Coalition Organizing Doc",
        desc: "Member types, target groups, county-by-county plans",
        href: null,
        tag: "PDF",
      },
      {
        label: "County Voices Style Sheets",
        desc: "Demographic snapshots and messaging guidance per county",
        href: null,
        tag: "PDF",
      },
      {
        label: "AZ Battleground District Report",
        desc: "Current candidate rosters, district splits, strategy notes",
        href: null,
        tag: "Doc",
      },
    ],
  },
  {
    title: "Google Drive",
    color: "#4A4558",
    items: [
      {
        label: "Main Coalition Drive",
        desc: "All shared documents, templates, and assets",
        href: null,
        tag: "Drive",
      },
      {
        label: "County Message Sheets",
        desc: "Individual county messaging and talking points",
        href: null,
        tag: "Drive",
      },
      {
        label: "Media Library",
        desc: "Images, graphics, video assets for campaigns",
        href: null,
        tag: "Drive",
      },
      {
        label: "Volunteer Tracking Sheet",
        desc: "Volunteer roster and task tracking spreadsheet",
        href: null,
        tag: "Sheet",
      },
    ],
  },
  {
    title: "Election Resources",
    color: "#C1673A",
    items: [
      { label: "AZ SOS — Elections", desc: "Official Arizona election information", href: "https://azsos.gov/elections", tag: "Gov" },
      { label: "My Arizona Vote", desc: "Voter registration, ballot status, polling locations", href: "https://my.arizona.vote", tag: "Gov" },
      { label: "E-Qual — Candidate Petitions", desc: "Sign candidate nominating petitions and Clean Elections contributions", href: "https://apps.arizona.vote/equal", tag: "Gov" },
      { label: "ServiceArizona — Register to Vote", desc: "Register or update voter registration", href: "https://servicearizona.com", tag: "Gov" },
    ],
  },
  {
    title: "Research & Reference",
    color: "#4A4558",
    items: [
      { label: "Ballotpedia — Arizona", desc: "Candidates, races, ballot measures statewide", href: "https://ballotpedia.org/Arizona", tag: "Ext" },
      { label: "Arizona Legislature", desc: "Bill tracking, member roster, session calendar", href: "https://www.azleg.gov", tag: "Gov" },
      { label: "AZ Independent Redistricting", desc: "Official district maps and lookup", href: "https://irc.az.gov", tag: "Gov" },
      { label: "Civic Engagement Beyond Voting", desc: "Legislative tracking and civic education", href: "https://cebv.org", tag: "Ext" },
    ],
  },
  {
    title: "Tools & Platforms",
    color: "#3ECFB2",
    items: [
      { label: "SocialPilot", desc: "Scheduled posting and analytics across all platforms", href: "https://socialpilot.co", tag: "Tool" },
      { label: "Canva — AZ Coalition", desc: "Coalition graphics and design templates", href: null, tag: "Tool" },
      { label: "AZ Coalition Linktree", desc: "Public-facing action hub", href: null, tag: "Link" },
      { label: "Signal Group", desc: "Secure coalition communications", href: null, tag: "Secure" },
    ],
  },
];

export default function ResourcesPage() {
  return (
    <ToolPage
      eyebrow="Library"
      title="Resources Hub"
      desc="Centralized links to strategy documents, Google Drive folders, election resources, and coalition tools."
      accentColor="#4A4558"
    >
      <div style={{ maxWidth: "var(--max-width)", margin: "0 auto", padding: "36px 24px 64px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {RESOURCE_GROUPS.map(group => (
            <ResourceGroup key={group.title} group={group} />
          ))}
        </div>
      </div>
    </ToolPage>
  );
}

function ResourceGroup({ group }) {
  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
        paddingBottom: 10,
        borderBottom: `2px solid ${group.color}`,
      }}>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          color: group.color,
        }}>
          {group.title}
        </h2>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 14,
      }}>
        {group.items.map(item => (
          <ResourceCard key={item.label} item={item} color={group.color} />
        ))}
      </div>
    </div>
  );
}

function ResourceCard({ item, color }) {
  const isLinked = !!item.href;
  const El = isLinked ? "a" : "div";
  const linkProps = isLinked
    ? { href: item.href, target: "_blank", rel: "noreferrer" }
    : {};

  return (
    <El
      {...linkProps}
      style={{
        display: "block",
        padding: "16px 18px",
        border: "2px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg)",
        textDecoration: "none",
        opacity: isLinked ? 1 : 0.6,
        transition: "border-color 0.15s",
        cursor: isLinked ? "pointer" : "default",
      }}
      onMouseEnter={e => { if (isLinked) e.currentTarget.style.borderColor = color; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>
          {item.label}{isLinked ? " ↗" : ""}
        </span>
        <span style={{
          flexShrink: 0,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: color,
          background: color + "18",
          padding: "2px 6px",
          borderRadius: 4,
        }}>
          {item.tag}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-mute)", lineHeight: 1.5, margin: 0 }}>
        {item.desc}
      </p>
      {!isLinked && (
        <p style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 6, fontStyle: "italic" }}>
          Link not yet configured
        </p>
      )}
    </El>
  );
}
