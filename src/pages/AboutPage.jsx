// src/pages/AboutPage.jsx
//
// Public "who we are" page — Aug 2026. Lives at /about, outside AuthGuard
// (see App.jsx), so it renders for anyone, logged in or not. Deliberately
// self-contained (no AppShell/ToolPage dependency, same pattern as the
// legal pages and WaitlistPage) since logged-out visitors never mount
// AppShell.
//
// Content pulled directly from the coalition's organizing document (mission,
// vision, values) — kept close to that wording rather than paraphrased, so
// this stays the canonical public restatement of it. Deliberately does NOT
// name or describe any internal tool (Message Machine, Rapid Response,
// Storms, etc.) — a public page is exposure surface, and specifics about
// internal tooling buy scrutiny, not trust. Visitors who want the tools are
// pointed at the waitlist instead of given a tour.
import { Link } from "react-router-dom";

const PLUM    = "var(--purple)";
const PLUM_DK = "var(--purple-dark)";
const TEAL    = "var(--teal)";
const GOLD    = "var(--gold)";
const SALMON  = "var(--terracotta)";
const INK     = "var(--charcoal)";
const BORDER  = "var(--border)";

const VALUES = [
  {
    title: "Democracy",
    text: "Protecting free, fair, and accessible elections, and organizing to hold officials accountable to voters — not special interests.",
  },
  {
    title: "Grassroots power",
    text: "Centering volunteers and community leaders, not consultants or big donors.",
  },
  {
    title: "Equity",
    text: "Prioritizing communities that are often ignored or targeted — rural areas, working-class neighborhoods, young voters, and historically marginalized groups.",
  },
  {
    title: "Year-round engagement",
    text: "Treating civic engagement as something we do every day, not just in the last weeks before Election Day.",
  },
  {
    title: "Security and trust",
    text: "Using encrypted communication tools and clear norms to protect volunteers, campaigns, and communities as we organize.",
  },
  {
    title: "Collaboration",
    text: "Linking local activist groups, social media organizers, and election volunteers so that everyone's work is aligned instead of siloed.",
  },
];

export default function AboutPage() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>

      {/* ── Header / hero ── */}
      <div style={{ background: `linear-gradient(160deg, ${PLUM} 0%, ${PLUM_DK} 100%)`, padding: "48px 20px 64px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <img src="/azc-logo.png" alt="Arizona Coalition" style={{ height: 60, marginBottom: 16 }} />
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(28px, 5vw, 44px)",
            color: "#fff", lineHeight: 1.2, marginBottom: 18,
          }}>
            Civic power, built by volunteers, for every corner of Arizona.
          </h1>
          <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: "rgba(255,255,255,0.88)", lineHeight: 1.7, maxWidth: 620, margin: "0 auto" }}>
            Arizona Coalition is a completely volunteer, statewide organizing hub that uses social media
            and secure digital tools to turn civic education into civic action and electoral wins in Arizona.
          </p>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            <a href="#get-involved" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 26px",
              background: SALMON, color: "#fff", borderRadius: 8, fontSize: 15, fontWeight: 700,
              fontFamily: "var(--font-body)", letterSpacing: "0.02em", textDecoration: "none",
            }}>
              Get Involved →
            </a>
            <Link to="/login" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 26px",
              background: "rgba(255,255,255,0.12)", color: "#fff", border: "2px solid rgba(255,255,255,0.55)",
              borderRadius: 8, fontSize: 15, fontWeight: 700, fontFamily: "var(--font-body)",
              letterSpacing: "0.02em", textDecoration: "none",
            }}>
              Sign In
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "56px 24px 72px" }}>

        {/* ── Who we connect ── */}
        <section style={{ marginBottom: 56 }}>
          <p style={{ fontSize: 17, color: INK, lineHeight: 1.75, textAlign: "center" }}>
            We connect county leaders, local activist groups, and individual volunteers across rural
            communities, suburbs, and cities — giving them simple ways to learn, organize, and act
            together all year long.
          </p>
        </section>

        {/* ── Vision ── */}
        <section style={{
          marginBottom: 56, textAlign: "center", padding: "40px 32px",
          background: "var(--surface)", border: `1px solid ${BORDER}`, borderRadius: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>
            Our Vision
          </div>
          <p style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(19px, 3vw, 25px)",
            color: PLUM, lineHeight: 1.45, maxWidth: 620, margin: "0 auto",
          }}>
            An Arizona where everyday people are informed, connected, and powerful enough to shape
            elections and public policy — no matter where they live or how much money they have.
          </p>
        </section>

        {/* ── Values ── */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(22px, 3.5vw, 28px)",
            color: PLUM, textAlign: "center", marginBottom: 32,
          }}>
            What We Stand For
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {VALUES.map(v => (
              <div key={v.title} style={{
                background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12,
                padding: "20px 22px", borderTop: `4px solid ${TEAL}`,
              }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, color: TEAL, marginBottom: 8 }}>
                  {v.title}
                </h3>
                <p style={{ fontSize: 14, color: "var(--text-mid)", lineHeight: 1.6, margin: 0 }}>
                  {v.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Get involved ── */}
        <section id="get-involved" style={{
          scrollMarginTop: 24, textAlign: "center", padding: "40px 32px",
          background: `linear-gradient(160deg, ${PLUM} 0%, ${PLUM_DK} 100%)`, borderRadius: 16,
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(20px, 3vw, 26px)", color: "#fff", marginBottom: 12 }}>
            Get Involved
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, maxWidth: 480, margin: "0 auto 24px" }}>
            Want to connect with the coalition, ask a question, or explore working together? Reach out
            directly — we're volunteers, and we read every message.
          </p>
          <a href="mailto:info@arizonacoalition.net" style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 26px",
            background: GOLD, color: PLUM_DK, borderRadius: 8, fontSize: 15, fontWeight: 700,
            fontFamily: "var(--font-body)", letterSpacing: "0.02em", textDecoration: "none", marginBottom: 18,
          }}>
            ✉ Email info@arizonacoalition.net
          </a>

          <div style={{
            marginTop: 8, paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.2)",
            maxWidth: 480, marginLeft: "auto", marginRight: "auto",
          }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, marginBottom: 12 }}>
              If you're here to use our messaging tools, join the waitlist for our app.
            </p>
            <Link to="/waitlist" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 22px",
              background: "rgba(255,255,255,0.12)", color: "#fff", border: "2px solid rgba(255,255,255,0.55)",
              borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: "var(--font-body)",
              letterSpacing: "0.02em", textDecoration: "none",
            }}>
              Join the Waitlist →
            </Link>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
            <Link to="/terms" style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 700 }}>Terms</Link>
            <Link to="/privacy" style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 700 }}>Privacy</Link>
            <Link to="/ai-policy" style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 700 }}>AI Policy</Link>
            <Link to="/login" style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 700 }}>Sign In</Link>
          </div>
          <p style={{ fontSize: 12, color: "#aaa" }}>© {new Date().getFullYear()} Arizona Coalition, LLC</p>
        </footer>
      </div>
    </div>
  );
}
