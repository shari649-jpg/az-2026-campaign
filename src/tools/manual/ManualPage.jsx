import { useNavigate } from "react-router-dom";
import ToolPage from "../../components/ToolPage";

const TEAL       = "#1D5C4A";
const GOLD       = "#F5C842";
const CHARCOAL   = "#4A4558";
const TERRA      = "#C1673A";
const WHITE      = "#FFFFFF";
const MM_TEAL    = "#085041"; // Message Machine — matches QuickStartPage's shade
const RR_BROWN   = "#7A3010"; // Rapid Response — matches QuickStartPage's shade
const MEDIA_TEAL = "#0F6E56"; // Media Library & Graphics Studio
const GOLD_DEEP  = "#8a6a10"; // Storm Chasers Hub — dark enough for text contrast

// Section metadata drives both the Table of Contents and each section's
// colored header chip — kept in one place so the two can never drift apart.
const SECTIONS = [
  { id: "how-to-use",       num: null, title: "How to Use This Guide",              color: CHARCOAL,  bg: "#EEF1F8", bord: "#C5CDE8" },
  { id: "getting-started",  num: "1",  title: "Getting Started",                     color: CHARCOAL,  bg: "#EEF1F8", bord: "#C5CDE8" },
  { id: "message-basics",   num: "2",  title: "Message Machine: Basic Message Creation", color: MM_TEAL, bg: "#E0FAF5", bord: "#9DD8CC" },
  { id: "rapid-response",   num: "3",  title: "Rapid Response",                      color: RR_BROWN,  bg: "#FDE8D8", bord: "#F0C4A8" },
  { id: "rebuttal",         num: "4",  title: "Rebuttal Generator",                  color: TERRA,     bg: "#FFF0E8", bord: "#F0C4A8" },
  { id: "message-pro",      num: "5",  title: "Message Machine: Pro Mode (Advanced)", color: MM_TEAL,  bg: "#E0FAF5", bord: "#9DD8CC" },
  { id: "research",         num: "6",  title: "Research",                            color: TEAL,      bg: "#E0F2EC", bord: "#A8D9C8" },
  { id: "media",            num: "7",  title: "Media Library & Graphics Studio",     color: MEDIA_TEAL, bg: "#DFF7F1", bord: "#A8E0D2" },
  { id: "shared-library",   num: "8",  title: "Shared Library: Saving & Reusing Your Work", color: CHARCOAL, bg: "#EEF1F8", bord: "#C5CDE8" },
  { id: "storms",           num: "9",  title: "Storm Chasers Hub (Advanced)",        color: GOLD_DEEP, bg: "#fdf3c0", bord: "#e8d488" },
  { id: "appendix",         num: null, title: "Appendix: Roles at a Glance",         color: CHARCOAL, bg: "#EEF1F8", bord: "#C5CDE8" },
];

function byId(id) { return SECTIONS.find(s => s.id === id); }

function SectionHeader({ id }) {
  const s = byId(id);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
      {s.num && (
        <div style={{
          width: 40, height: 40, borderRadius: "50%", background: s.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: WHITE, flexShrink: 0,
        }}>
          {s.num}
        </div>
      )}
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(20px, 3vw, 26px)", color: s.color, lineHeight: 1.2 }}>
        {s.title}
      </h2>
    </div>
  );
}

function H3({ children, color = CHARCOAL }) {
  return <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, color, margin: "22px 0 8px" }}>{children}</h3>;
}
function P({ children }) {
  return <p style={{ fontSize: 15, color: "var(--text-mid)", lineHeight: 1.65, marginBottom: 12 }}>{children}</p>;
}
function Ul({ items }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 15, color: "var(--text-mid)", lineHeight: 1.6 }}>{item}</li>
      ))}
    </ul>
  );
}
function Ol({ items }) {
  return (
    <ol style={{ margin: "0 0 12px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 15, color: "var(--text-mid)", lineHeight: 1.6 }}>{item}</li>
      ))}
    </ol>
  );
}
function Callout({ icon, title, children, color = TEAL, bg = "#E0F2EC" }) {
  return (
    <div style={{
      background: bg, borderLeft: `4px solid ${color}`, borderRadius: "0 10px 10px 0",
      padding: "14px 18px", marginBottom: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 4 }}>{icon} {title}</div>
      <div style={{ fontSize: 14, color: "var(--text-mid)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}
function Section({ id, children }) {
  const s = byId(id);
  return (
    <section id={id} style={{
      scrollMarginTop: 90, background: "var(--bg)", border: "1.5px solid var(--border)",
      borderRadius: 16, padding: "26px 28px 30px", marginBottom: 20,
    }}>
      <SectionHeader id={id} />
      {children}
      <div style={{ marginTop: 18 }}>
        <a href="#toc" style={{ fontSize: 12, fontWeight: 700, color: s.color, letterSpacing: "0.03em" }}>↑ Back to top</a>
      </div>
    </section>
  );
}

export default function ManualPage() {
  const navigate = useNavigate();

  return (
    <ToolPage
      eyebrow="Help"
      title="Comms Hub Guide"
      desc="A guided tour of every tool, from your first message to running a full multi-platform Storm."
      accentColor={TEAL}
    >
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 24px 64px" }}>

        {/* Intro strip: Quick Start is the prominent, primary path in for new users */}
        <div style={{
          border: "2px solid var(--teal)", borderRadius: 14, padding: "20px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18,
          flexWrap: "wrap", background: "var(--teal-light)", marginBottom: 24,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: TEAL, marginBottom: 6 }}>
              New here?
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", lineHeight: 1.5 }}>
              Start with the Quick Start Guide — a fast walkthrough of the whole workflow.
            </div>
            <div style={{ fontSize: 13, color: "var(--text-mid)", marginTop: 4 }}>
              This page is the full reference behind it, for when you want more detail on a specific tool.
            </div>
          </div>
          <button
            onClick={() => navigate("/quick-start")}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", background: TEAL, color: WHITE, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: "var(--font-body)", letterSpacing: "0.03em", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Open Quick Start →
          </button>
        </div>

        {/* Table of Contents */}
        <div id="toc" style={{ scrollMarginTop: 90, border: "2px solid var(--border)", borderRadius: 16, padding: "22px 26px", marginBottom: 28, background: "var(--surface)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 14 }}>
            Table of Contents
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 8px",
                borderRadius: 8, fontSize: 14, fontWeight: 700, color: s.color, textDecoration: "none",
              }}>
                {s.num && <span style={{ fontSize: 11, opacity: 0.6 }}>{s.num}.</span>}
                {s.title}
              </a>
            ))}
          </div>
        </div>

        {/* ── How to Use This Guide ── */}
        <Section id="how-to-use">
          <P>This guide is organized from easiest to most advanced. If you're brand new, start at the top and work down — each section builds on skills from the one before it. If you already know the basics, jump straight to the section you need using the Table of Contents above.</P>
          <Callout icon="🕵️‍♂️" title="Look for this icon" color={TEAL} bg="#E0F2EC">
            Small help pop-ups marked with the detective icon are built into the tools themselves, so you can get a quick reminder without leaving the page you're on. This guide is the full reference behind those pop-ups.
          </Callout>
          <Callout icon="⚠️" title="AI-generated content is a draft" color={TERRA} bg="#FFF0E8">
            Every AI tool in the Comms Hub — Message Machine, Rapid Response, Rebuttal Generator, and Storm posts — produces a starting draft, not a finished, fact-checked product. Always read it over and verify names, dates, and claims before you publish anything publicly.
          </Callout>
          <Callout icon="💾" title="Nothing saves automatically" color={TEAL} bg="#E0F2EC">
            If you want to keep something you've generated, click "Save to Library." If you navigate away without saving, it's gone.
          </Callout>
        </Section>

        {/* ── 1. Getting Started ── */}
        <Section id="getting-started">
          <H3>1.1 Signing In</H3>
          <P>The Comms Hub is invite-only. You'll receive an email invitation to register; from there you can create an account with an email and password, or sign in with Google. New accounts must verify their email address before they can use any of the tools — if you don't see the verification email, check your spam folder or use the "Resend Verification" link on the sign-in screen.</P>

          <H3>1.2 Roles & What They Unlock</H3>
          <P>Every account has one of three roles. Your role controls which tools you can reach and how much you can do inside them:</P>
          <Ul items={[
            <><strong>Member</strong> — full access to Message Machine, Rapid Response, Rebuttal, Research, Media, and the Shared Library. Can create a Storm and manage their own draft posts.</>,
            <><strong>Manager</strong> — everything a Member can do, plus the ability to review and publish Storms, manage any Storm's posts, and lock platform text once it's finalized.</>,
            <><strong>Administrator</strong> — everything a Manager can do, plus user management (roles, invitations, account status) and the ability to permanently delete Storms.</>,
          ]} />

          <H3>1.3 Finding Your Way Around</H3>
          <P>The top navigation bar holds the tools you'll use most often. Tools used less frequently are tucked under a "More" menu to keep the bar uncluttered. Your account menu (top right) is where you'll find your Profile and, if you administer the coalition's accounts, the Admin panel.</P>

          <H3>1.4 Daily Usage Limits</H3>
          <P>AI-powered features (Message Machine, Rapid Response, Rebuttal, and Storm post generation) have a daily usage limit that resets at midnight UTC. The limit is higher for Managers and Administrators than for Members. You'll see a warning banner once you're close to your limit, and a message once you've reached it — an administrator can grant you extra generations for the day if you run out mid-project.</P>
        </Section>

        {/* ── 2. Message Machine: Basic ── */}
        <Section id="message-basics">
          <P>Message Machine is the coalition's core writing tool. Give it an issue and it writes ready-to-post messages for all six of the coalition's platforms at once: Facebook, Instagram, X/Twitter, Threads, TikTok, and Bluesky.</P>

          <H3 color={MM_TEAL}>2.1 The Basic Fields</H3>
          <Ul items={[
            <><strong>Issue</strong> — describe what you want to talk about, in your own words. Be as specific as you can; a clear issue produces a sharper message.</>,
            <><strong>Audience</strong> — who the message is speaking to (e.g. suburban parents, young voters).</>,
            <><strong>Platforms</strong> — pick which of the six platforms you want posts for. You don't have to generate all six every time.</>,
          ]} />

          <H3 color={MM_TEAL}>2.2 Messaging Mode</H3>
          <P>Above the basic fields, choose a Messaging Mode:</P>
          <Ul items={[
            <><strong>Neutral</strong> (default) — general-purpose messaging with no built-in point of view.</>,
            <><strong>AZ Coalition</strong> — the coalition's own Arizona-grounded voice. This mode also unlocks County Voice in Pro Mode (see Section 5).</>,
            <><strong>National</strong> — built around national messaging frames (see Section 5).</>,
          ]} />

          <H3 color={MM_TEAL}>2.3 Generating & Reading Your Results</H3>
          <Ol items={[
            "Fill in the Issue, Audience, and Platforms, then click Generate.",
            "A short loading animation plays (about 10–25 seconds) while all platform posts are written together.",
            "Each platform appears as its own card. Click a card to expand or collapse its full text.",
          ]} />

          <H3 color={MM_TEAL}>2.4 Refining a Post</H3>
          <P>Every platform card has three quick-refine buttons:</P>
          <Ul items={[
            <><strong>Expand</strong> — regenerate a longer, more detailed version.</>,
            <><strong>Shorten</strong> — regenerate a tighter version.</>,
            <><strong>Rephrase</strong> — regenerate the same idea with different wording.</>,
          ]} />

          <H3 color={MM_TEAL}>2.5 Copying, Saving & Sending Onward</H3>
          <Ul items={[
            <><strong>Copy</strong> — copies a single platform's post to your clipboard, ready to paste and publish.</>,
            <><strong>Save to Library</strong> — stores the whole campaign (all generated platforms together) in the Shared Library. See Section 8.</>,
            <><strong>Push to Storm</strong> — sends a finished post directly into a Storm (Managers/Administrators only). See Section 9.</>,
          ]} />
          <P>If you arrived at Message Machine from Research or Rapid Response with content already queued up, you'll see a small "draft available" prompt — accept it to load that content into the Issue field instead of starting from scratch.</P>
        </Section>

        {/* ── 3. Rapid Response ── */}
        <Section id="rapid-response">
          <P>Rapid Response helps you react quickly to breaking news. Give it an article and it pulls out the key claims and quotes so you can decide how to respond — and, if needed, send that summary straight into Message Machine or Rebuttal.</P>

          <H3 color={RR_BROWN}>3.1 Bringing In an Article</H3>
          <Ul items={[
            "Paste a link and click Fetch — Rapid Response retrieves the article and analyzes it for you.",
            "Or paste the article text directly if you already have it copied.",
          ]} />

          <H3 color={RR_BROWN}>3.2 Reading the Summary</H3>
          <P>Rapid Response returns an AI-written summary of the article's key claims and notable quotes. Use this to quickly judge whether — and how — the coalition should respond.</P>

          <H3 color={RR_BROWN}>3.3 The Search Tab</H3>
          <P>Use the Search tab to look for related coverage on a topic instead of starting from a single link you already have.</P>

          <H3 color={RR_BROWN}>3.4 Sending Your Work Onward</H3>
          <Ul items={[
            <><strong>Send to Message Machine</strong> — pushes the article summary into Message Machine's Issue field so you can turn it into platform posts.</>,
            <><strong>Save to Library</strong> — stores the article and its summary in the Shared Library for later reference (see Section 8).</>,
          ]} />
        </Section>

        {/* ── 4. Rebuttal Generator ── */}
        <Section id="rebuttal">
          <P>Use the Rebuttal Generator when you need to push back directly on a lie or a misleading claim that's circulating.</P>

          <H3 color={TERRA}>4.1 Writing Your Rebuttal</H3>
          <Ol items={[
            "Enter the specific lie or misleading claim you're countering — the more precisely you describe it, the sharper the rebuttal.",
            "Optionally set a Tone and a Profile to shape how the rebuttal sounds. Defaults work well if you're not sure.",
            "Click Generate.",
          ]} />

          <H3 color={TERRA}>4.2 Working With the Result</H3>
          <Ul items={[
            <><strong>Copy All</strong> — copies the full rebuttal text.</>,
            <><strong>Save to Library</strong> — stores the rebuttal for later reuse (see Section 8).</>,
            <><strong>Edit & Regenerate</strong> — adjust your inputs and generate again without starting over.</>,
            <><strong>Push to Message Machine</strong> — turns your rebuttal into ready-to-post platform messages.</>,
          ]} />
          <P>A Rebuttal Library panel is available on the page itself, showing your past rebuttals for quick reuse alongside the Shared Library.</P>
        </Section>

        {/* ── 5. Message Machine: Pro Mode ── */}
        <Section id="message-pro">
          <P>Once you're comfortable with basic message creation, Pro Mode gives you finer control over exactly how a message is framed, who it's grounded in, and whose voice it speaks in. Pro Mode is a collapsible panel — click "⚙️ Pro Mode" to open it. It stays collapsed by default so new users aren't overwhelmed by it.</P>

          <H3 color={MM_TEAL}>5.1 Messaging Frame</H3>
          <P>Focuses an entire message around one strategic theme (used in National mode). Leave it blank for general-purpose messaging.</P>

          <H3 color={MM_TEAL}>5.2 County Voice (AZ Coalition mode only)</H3>
          <P>Grounds a message in one of Arizona's 15 counties — its local stakes, landmarks, and concerns. County Voice is independent from Voice/Persona (below): one is where a message is rooted, the other is who's speaking, so you can set both together.</P>
          <Callout icon="💡" title="Tip" color={MM_TEAL} bg="#E0FAF5">
            If you arrive in Message Machine from a Research page that identified a single, clear county, you'll see a dismissible prompt offering to apply that county's voice automatically. You always have the final say — apply it or dismiss it.
          </Callout>

          <H3 color={MM_TEAL}>5.3 Voice / Persona</H3>
          <P>Pre-built persona presets (for example, Mom Blog or Bro Code) instantly fill in a detailed voice instruction, which you can then edit freely. Click the preset again to clear it.</P>

          <H3 color={MM_TEAL}>5.4 Target Audience, Style, Tone Modifier & Speaker Perspective</H3>
          <P>These fields let you dial in exactly who a message is for, how formal or casual it reads, its emotional tone, and whose perspective it's written from.</P>

          <H3 color={MM_TEAL}>5.5 URL-Aware Ingestion</H3>
          <P>You can paste a news URL directly into Message Machine's Issue/Content field and fetch it, instead of detouring through Rapid Response first — useful once you're comfortable moving quickly between tools.</P>

          <H3 color={MM_TEAL}>5.6 Hashtag Generation</H3>
          <P>Message Machine can also generate suggested hashtags for a campaign once your platform posts are ready.</P>
        </Section>

        {/* ── 6. Research ── */}
        <Section id="research">
          <P>Research is where you look up candidates, races, districts, and issues, and pull verified facts straight into your messaging tools.</P>

          <H3 color={TEAL}>6.1 Search Candidates</H3>
          <P>Look up a candidate directly and review their record.</P>

          <H3 color={TEAL}>6.2 Compare Races</H3>
          <P>Compare candidates within a race side by side, including district context.</P>

          <H3 color={TEAL}>6.3 Geographic Profiles</H3>
          <P>Browse district- and county-level profiles, including which counties fall within a district.</P>

          <H3 color={TEAL}>6.4 Issues</H3>
          <P>Browse coalition-tracked issues, including an at-a-glance severity rating for each.</P>

          <H3 color={TEAL}>6.5 Sending Research Into Your Messaging</H3>
          <P>Wherever you see a checkbox next to a fact or quote, check the ones you want to use, then use the floating "Send to Message Machine" bar to carry them straight into a new message — no retyping or copy-pasting.</P>
        </Section>

        {/* ── 7. Media Library & Graphics Studio ── */}
        <Section id="media">
          <P>The Media page has two tabs: a File Browser for the coalition's shared photo and video library, and a Graphics Studio for building branded graphics on the fly.</P>

          <H3 color={MEDIA_TEAL}>7.1 File Browser</H3>
          <Ul items={[
            "Browse folders of shared coalition media, or search and filter by type (image, video, GIF).",
            "Click an image or GIF to open a full-size preview.",
            "Download any file directly to use in your own posts.",
          ]} />

          <H3 color={MEDIA_TEAL}>7.2 Graphics Studio</H3>
          <P>Create branded quote cards and carousel graphics using ready-made templates styled in the coalition's colors — a fast way to turn a quote or stat into something visual without opening a separate design tool.</P>
        </Section>

        {/* ── 8. Shared Library ── */}
        <Section id="shared-library">
          <P>The Shared Library is where all saved campaigns and articles live — from Message Machine, Rebuttal Generator, and Rapid Response — visible to every coalition member with access to the Comms Hub.</P>

          <H3>8.1 What's Saved There</H3>
          <Ul items={[
            <><strong>Campaigns</strong> — full Message Machine or Rebuttal outputs, saved under a name you choose.</>,
            <><strong>Articles</strong> — Rapid Response summaries, saved with their source link and key points.</>,
          ]} />

          <H3>8.2 Finding Something</H3>
          <P>Use the search box and the tool filters (Message Machine / Rebuttal / Rapid Response) to narrow down the list.</P>

          <H3>8.3 Reusing a Saved Item</H3>
          <Ul items={[
            "Click a saved campaign to load it back into Message Machine or Rebuttal, exactly as it was, ready to edit or regenerate.",
            "Click a saved article to push it into Message Machine as a fresh starting point.",
          ]} />

          <H3>8.4 Who Can Delete What</H3>
          <P>You can always delete items you personally saved. Managers and Administrators can delete any item in the Library.</P>
        </Section>

        {/* ── 9. Storm Chasers Hub ── */}
        <Section id="storms">
          <P>A "Storm" is a coordinated, multi-platform campaign — think of it as a container that holds one or more finished Posts (a video or graphics plus matching text for all six platforms), built around a candidate, an issue, a race, or the coalition as a whole. This is the most advanced tool in the Comms Hub, and it's where individual messages come together into a shared, staff-coordinated push.</P>

          <H3 color={GOLD_DEEP}>9.1 One Page for Everyone</H3>
          <P>Managers and Administrators land on Manager View — the full list of storms with status controls. A Manager View / User View toggle lets staff preview exactly what a Member sees. Members always see User View, which includes browsing active storms plus a "My Storms" section for anything they've personally started.</P>

          <H3 color={GOLD_DEEP}>9.2 Storm Status Lifecycle</H3>
          <Ul items={[
            <><strong>Draft</strong> — being built, not yet visible to the coalition at large. Anyone can create one; it always starts here.</>,
            <><strong>Pending Review</strong> — a Member has submitted their draft storm for staff review.</>,
            <><strong>Active</strong> — live and visible to Members for downloading and posting.</>,
            <><strong>Archived</strong> — no longer active.</>,
          ]} />
          <P>Members can move their own storm from Draft to Pending Review. Only Managers and Administrators can move a storm into or out of Active. Administrators alone can permanently delete a storm; Managers archive instead.</P>

          <H3 color={GOLD_DEEP}>9.3 Creating a Storm</H3>
          <P>Click "+ New Storm" and fill in:</P>
          <Ul items={[
            "Title, short summary, and a longer description",
            "A hashtag (entered without the # — it's added automatically when someone copies a post)",
            "Subject Type & Name — Candidate, Issue/Topic, Race/District, or Coalition-wide",
            "Urgency — a 1–3 alarm rating shown as a bell icon",
            "A start date/time and an expiration date/time",
          ]} />

          <H3 color={GOLD_DEEP}>9.4 Building Posts Inside a Storm</H3>
          <P>Once a storm exists, open "Manage Storm → Storm Posts" to add individual Posts. Each Post can hold one video or several graphics, plus text for each of the six platforms (each with its own character limit shown live as you type).</P>
          <Ul items={[
            <><strong>Generate / Rephrase</strong> — write or rework a platform's text using the same AI writing tool that powers Message Machine.</>,
            <><strong>Lock</strong> (Managers/Administrators only) — locks a platform's text so it can no longer be edited or rephrased; locked fields show a "🔒 Locked by staff" tag.</>,
            <><strong>Push-to-Storm from Message Machine</strong> (Managers/Administrators only) — send a finished Message Machine post straight into an existing storm, or start a brand-new storm from it.</>,
          ]} />
          <P>Media (video or graphics) is always added to a Post manually by staff — it is never included automatically by a push from Message Machine.</P>

          <H3 color={GOLD_DEEP}>9.5 Publishing & Sharing a Post</H3>
          <Ul items={[
            "Download or copy each platform's text and media to post it yourself.",
            "Some storms have a public storm page — a shareable link anyone can view, useful for supporters posting outside the coalition's own accounts.",
          ]} />
          <Callout icon="✅" title="Good to know" color={GOLD_DEEP} bg="#fdf3c0">
            Regenerating a post's text is always a fresh, temporary preview — it never overwrites what's actually saved and shown to others unless you explicitly save over it.
          </Callout>
        </Section>

        {/* ── Appendix ── */}
        <Section id="appendix">
          <div style={{ overflow: "hidden", borderRadius: 10, border: "1.5px solid var(--border)", marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: CHARCOAL }}>
                  <th style={{ textAlign: "left", padding: "10px 14px", color: WHITE, fontSize: 13 }}>Role</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", color: WHITE, fontSize: 13 }}>Can do</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Member", "Message Machine, Rapid Response, Rebuttal, Research, Media, Shared Library. Create a Storm and manage their own draft."],
                  ["Manager", "Everything a Member can do, plus reviewing/publishing Storms, managing any Storm's posts, and locking platform text."],
                  ["Administrator", "Everything a Manager can do, plus user management and permanently deleting Storms."],
                ].map(([role, desc], i) => (
                  <tr key={role} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--bg)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: CHARCOAL, verticalAlign: "top" }}>{role}</td>
                    <td style={{ padding: "10px 14px", color: "var(--text-mid)", lineHeight: 1.55 }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H3>What's Not Covered Yet</H3>
          <P>BS Monitor and the Resources Hub are still being finalized and are intentionally left out of this guide for now. They'll be added in a future update once those tools are ready for general use.</P>
        </Section>

      </div>
    </ToolPage>
  );
}
