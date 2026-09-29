// src/pages/CountyPagesPage.jsx
//
// Fully public — no login, no AppShell. Reached via /county-pages (see
// App.jsx's public routes section, alongside /voter-lookup and /vote-sites).
//
// WHY THIS EXISTS (Sept 29, 2026): replaces the standalone Canva page
// "AZ Dem County Pages" (az-county-dems.my.canva.site). The 15 county
// Democratic Party website links below were read directly off that page's
// live link elements on 9/29/2026 — the URLs are copied exactly as they
// appeared there (three of them, Maricopa / Pima / Yavapai, are http://
// rather than https:// on the source page and are kept as-is).
//
// These are EXTERNAL sites run independently by each county party, so every
// link opens in a new tab with rel="noreferrer" — same convention as the
// external cards on ResourcesPage.jsx.
//
// Brand: white page background per the AZ Coalition brand rules, with the
// existing --surface-alt "chrome" fill for the header band. (The other two
// public pages use a teal gradient; this one intentionally follows the
// white-background rule instead.)

import { Link } from "react-router-dom";

// Alphabetical by county. `display` is the bare domain shown under the name.
const COUNTIES = [
  { name: "Apache",     href: "https://www.apachecountydems.org",             display: "apachecountydems.org" },
  { name: "Cochise",    href: "https://www.cochisecodems.org",                display: "cochisecodems.org" },
  { name: "Coconino",   href: "https://coconinodemocrats.org",                display: "coconinodemocrats.org" },
  { name: "Gila",       href: "https://gilacountyazdems.org",                 display: "gilacountyazdems.org" },
  { name: "Graham",     href: "https://www.grahamcountydemocraticparty.com",  display: "grahamcountydemocraticparty.com" },
  { name: "Greenlee",   href: "https://www.greenleecountyazdems.org",         display: "greenleecountyazdems.org" },
  { name: "La Paz",     href: "https://www.lapazcountyazdems.org",            display: "lapazcountyazdems.org" },
  { name: "Maricopa",   href: "http://maricopadems.org",                      display: "maricopadems.org" },
  { name: "Mohave",     href: "https://www.mohavedemocrats.com",              display: "mohavedemocrats.com" },
  { name: "Navajo",     href: "https://www.navajocountydemocrats.org",        display: "navajocountydemocrats.org" },
  { name: "Pima",       href: "http://pimadems.org",                          display: "pimadems.org" },
  { name: "Pinal",      href: "https://www.pinaldemocrats.org",               display: "pinaldemocrats.org" },
  { name: "Santa Cruz", href: "https://www.azsantacruzdems.org",              display: "azsantacruzdems.org" },
  { name: "Yavapai",    href: "http://yavdem.org",                            display: "yavdem.org" },
  { name: "Yuma",       href: "https://www.yumademocrats.com",                display: "yumademocrats.com" },
];

export default function CountyPagesPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "var(--text)", fontFamily: "var(--font-body)" }}>
      <header style={{ background: "var(--surface-alt)", borderBottom: "4px solid var(--purple)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "18px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 56, width: "auto", flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--purple)", lineHeight: 1.15 }}>
              Arizona Coalition
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--teal)", marginTop: 3 }}>
              County Pages
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px 56px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 5vw, 36px)", color: "var(--purple)", margin: "0 0 10px", lineHeight: 1.15 }}>
          Arizona County Democratic Parties
        </h1>
        <div style={{ height: 4, width: 64, background: "var(--terracotta)", borderRadius: 2, marginBottom: 18 }} />
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-mid)", maxWidth: "60ch", margin: "0 0 28px" }}>
          Find your county party's website below. Each link opens that county's own site in a new tab.
        </p>

        <ul style={{
          listStyle: "none", margin: 0, padding: 0,
          display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}>
          {COUNTIES.map(c => (
            <li key={c.name}>
              <a
                href={c.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${c.name} County Democratic Party website (opens in a new tab)`}
                style={{
                  display: "block", height: "100%", boxSizing: "border-box",
                  padding: "16px 18px",
                  background: "#fff",
                  border: "2px solid var(--surface-alt)",
                  borderLeft: "6px solid var(--teal)",
                  borderRadius: "var(--radius)",
                  textDecoration: "none",
                  transition: "border-color 0.15s, transform 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--teal)"; e.currentTarget.style.borderLeftColor = "var(--purple)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--surface-alt)"; e.currentTarget.style.borderLeftColor = "var(--teal)"; e.currentTarget.style.transform = "none"; }}
                onFocus={e => { e.currentTarget.style.outline = "3px solid var(--gold)"; e.currentTarget.style.outlineOffset = "2px"; }}
                onBlur={e => { e.currentTarget.style.outline = "none"; }}
              >
                <span style={{ display: "block", fontWeight: 700, fontSize: 17, color: "var(--purple)" }}>
                  {c.name} ↗
                </span>
                <span style={{ display: "block", fontSize: 13.5, color: "var(--teal)", marginTop: 2, wordBreak: "break-all" }}>
                  {c.display}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <p style={{ fontSize: 13, color: "var(--text-mute)", lineHeight: 1.6, margin: "32px 0 0" }}>
          These are independent county party websites. Looking for your candidates instead?{" "}
          <Link to="/voter-lookup" style={{ color: "var(--teal)", fontWeight: 700, textDecoration: "none" }}>
            Try the Voter Lookup tool
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
