// src/pages/CountyPagesPage.jsx
//
// Fully public — no login, no AppShell. Reached via /county-pages (see
// App.jsx's public routes section, alongside /voter-lookup).
//
// WHY THIS EXISTS (Sept 29, 2026): replaces the standalone Canva page
// "AZ Dem County Pages" (az-county-dems.my.canva.site). The 15 county
// Democratic Party website links below were read directly off that page's
// live link elements on 9/29/2026 — the URLs are copied exactly as they
// appeared there (three of them, Maricopa / Pima / Yavapai, are http://
// rather than https:// on the source page and are kept as-is).
//
// These are EXTERNAL sites run independently by each county party, so every
// website link opens in a new tab with rel="noreferrer" — same convention as
// the external cards on ResourcesPage.jsx.
//
// Two additions (Sept 29, 2026), both driven by src/data/countyMaterials.js:
//   - A county that has given us a slate card gets a second link on its card
//     ("Slate card") to /county-pages/:slug (CountySlateCardPage.jsx). Counties
//     without one look exactly as before.
//   - The DNC "Know Your Rights" flyer (English/Spanish) appears once, in the
//     section below the list — it is the same for every county.
//
// Brand: white page background per the AZ Coalition brand rules, with the
// existing --surface-alt "chrome" fill for the header band. (The other
// public pages use a teal gradient; this one intentionally follows the
// white-background rule instead.)

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { COUNTY_MATERIALS, KNOW_YOUR_RIGHTS } from "../data/countyMaterials";

// Alphabetical by county. `slug` matches the keys in COUNTY_MATERIALS.
// `display` is the bare domain shown under the name.
const COUNTIES = [
  { name: "Apache",     slug: "apache",     href: "https://www.apachecountydems.org",             display: "apachecountydems.org" },
  { name: "Cochise",    slug: "cochise",    href: "https://www.cochisecodems.org",                display: "cochisecodems.org" },
  { name: "Coconino",   slug: "coconino",   href: "https://coconinodemocrats.org",                display: "coconinodemocrats.org" },
  { name: "Gila",       slug: "gila",       href: "https://gilacountyazdems.org",                 display: "gilacountyazdems.org" },
  { name: "Graham",     slug: "graham",     href: "https://www.grahamcountydemocraticparty.com",  display: "grahamcountydemocraticparty.com" },
  { name: "Greenlee",   slug: "greenlee",   href: "https://www.greenleecountyazdems.org",         display: "greenleecountyazdems.org" },
  { name: "La Paz",     slug: "la-paz",     href: "https://www.lapazcountyazdems.org",            display: "lapazcountyazdems.org" },
  { name: "Maricopa",   slug: "maricopa",   href: "http://maricopadems.org",                      display: "maricopadems.org" },
  { name: "Mohave",     slug: "mohave",     href: "https://www.mohavedemocrats.com",              display: "mohavedemocrats.com" },
  { name: "Navajo",     slug: "navajo",     href: "https://www.navajocountydemocrats.org",        display: "navajocountydemocrats.org" },
  { name: "Pima",       slug: "pima",       href: "http://pimadems.org",                          display: "pimadems.org" },
  { name: "Pinal",      slug: "pinal",      href: "https://www.pinaldemocrats.org",               display: "pinaldemocrats.org" },
  { name: "Santa Cruz", slug: "santa-cruz", href: "https://www.azsantacruzdems.org",              display: "azsantacruzdems.org" },
  { name: "Yavapai",    slug: "yavapai",    href: "http://yavdem.org",                            display: "yavdem.org" },
  { name: "Yuma",       slug: "yuma",       href: "https://www.yumademocrats.com",                display: "yumademocrats.com" },
];

const linkReset = { textDecoration: "none" };

export default function CountyPagesPage() {
  // This page is public (no AppShell, so no built-in nav). Header links
  // depend on whether the visitor is signed in: members get a way back to
  // the app (Home, Resources — both behind AuthGuard); everyone else gets
  // the public pages instead, since "/" and "/resources" would just bounce
  // them to the login/about screen.
  const { user } = useAuth();
  const navLinks = user
    ? [{ to: "/", label: "← Home" }, { to: "/resources", label: "Resources" }]
    : [{ to: "/about", label: "About" }, { to: "/voter-lookup", label: "Voter Lookup" }];

  // React Router doesn't scroll to #hash on its own — needed so a link like
  // /county-pages#know-your-rights lands on that section.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView();
  }, [hash]);

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "var(--text)", fontFamily: "var(--font-body)" }}>
      <header style={{ background: "var(--surface-alt)", borderBottom: "4px solid var(--purple)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "18px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <Link to={user ? "/" : "/about"} style={{ display: "flex", alignItems: "center", gap: 14, ...linkReset }}>
            <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 56, width: "auto", flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--purple)", lineHeight: 1.15 }}>
                Arizona Coalition
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--teal)", marginTop: 3 }}>
                County Pages
              </div>
            </div>
          </Link>
          <nav aria-label="Site navigation" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {navLinks.map(l => (
              <Link
                key={l.to}
                to={l.to}
                style={{
                  fontSize: 14, fontWeight: 700, color: "var(--purple)", ...linkReset,
                  padding: "10px 16px", background: "#fff",
                  border: "2px solid var(--purple)", borderRadius: "var(--radius)",
                }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px 56px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 5vw, 36px)", color: "var(--purple)", margin: "0 0 10px", lineHeight: 1.15 }}>
          Arizona County Democratic Parties
        </h1>
        <div style={{ height: 4, width: 64, background: "var(--terracotta)", borderRadius: 2, marginBottom: 18 }} />
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-mid)", maxWidth: "60ch", margin: "0 0 28px" }}>
          Find your county party's website below. Some counties also have a slate card you can pull up on your phone.{" "}
          <a href="#know-your-rights" style={{ color: "var(--teal)", fontWeight: 700 }}>Know your voting rights ↓</a>
        </p>

        <ul style={{
          listStyle: "none", margin: 0, padding: 0,
          display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}>
          {COUNTIES.map(c => <CountyCard key={c.slug} county={c} materials={COUNTY_MATERIALS[c.slug]} />)}
        </ul>

        <KnowYourRights />

        <p style={{ fontSize: 13, color: "var(--text-mute)", lineHeight: 1.6, margin: "40px 0 0" }}>
          County website links go to independent county party websites. Looking for your candidates instead?{" "}
          <Link to="/voter-lookup" style={{ color: "var(--teal)", fontWeight: 700, ...linkReset }}>
            Try the Voter Lookup tool
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

function CountyCard({ county: c, materials }) {
  const hasCard = !!materials?.slateCard;
  const [hover, setHover] = useState(false);
  return (
    <li>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          height: "100%", boxSizing: "border-box",
          background: "#fff",
          border: `2px solid ${hover ? "var(--teal)" : "var(--surface-alt)"}`,
          borderLeft: `6px solid ${hover ? "var(--purple)" : "var(--teal)"}`,
          borderRadius: "var(--radius)",
          transition: "border-color 0.15s",
          display: "flex", flexDirection: "column",
        }}
      >
        <a
          href={c.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${c.name} County Democratic Party website (opens in a new tab)`}
          style={{ display: "block", padding: "16px 18px", flex: 1, ...linkReset }}
          onFocus={e => { e.currentTarget.style.outline = "3px solid var(--gold)"; e.currentTarget.style.outlineOffset = "-3px"; }}
          onBlur={e => { e.currentTarget.style.outline = "none"; }}
        >
          <span style={{ display: "block", fontWeight: 700, fontSize: 17, color: "var(--purple)" }}>
            {c.name} ↗
          </span>
          <span style={{ display: "block", fontSize: 13.5, color: "var(--teal)", marginTop: 2, wordBreak: "break-all" }}>
            {c.display}
          </span>
        </a>
        {hasCard && (
          <Link
            to={`/county-pages/${c.slug}`}
            aria-label={`${c.name} County ${materials.slateCard.year} slate card`}
            style={{
              // Filled button (Sept 30 2026) so the slate card reads as an
              // action, not a footnote. Deep plum fill, white text.
              display: "block", textAlign: "center", ...linkReset,
              margin: "0 14px 14px", padding: "12px 16px",
              background: "var(--purple)", borderRadius: 10,
              fontSize: 15, fontWeight: 700, color: "#fff",
            }}
            onFocus={e => { e.currentTarget.style.outline = "3px solid var(--gold)"; e.currentTarget.style.outlineOffset = "2px"; }}
            onBlur={e => { e.currentTarget.style.outline = "none"; }}
          >
            View {materials.slateCard.year} Slate Card →
          </Link>
        )}
      </div>
    </li>
  );
}

function KnowYourRights() {
  const kyr = KNOW_YOUR_RIGHTS;
  const [lang, setLang] = useState(() => {
    const phone = (typeof navigator !== "undefined" && navigator.language) || "en";
    return phone.toLowerCase().startsWith("es") ? "es" : "en";
  });
  const v = kyr.versions.find(x => x.lang === lang) || kyr.versions[0];
  const es = lang === "es";

  return (
    <section id="know-your-rights" style={{ marginTop: 48, scrollMarginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px, 4vw, 28px)", color: "var(--purple)", margin: 0 }}>
          {es ? "Conoce tus derechos" : "Know Your Rights"}
        </h2>
        <div role="group" aria-label="Language" style={{ display: "inline-flex", border: "2px solid var(--purple)", borderRadius: 10, overflow: "hidden" }}>
          {kyr.versions.map(x => (
            <button
              key={x.lang}
              type="button"
              onClick={() => setLang(x.lang)}
              aria-pressed={x.lang === lang}
              lang={x.lang}
              style={{
                fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer",
                padding: "8px 16px", border: "none",
                background: x.lang === lang ? "var(--purple)" : "#fff",
                color: x.lang === lang ? "#fff" : "var(--purple)",
              }}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 4, width: 64, background: "var(--terracotta)", borderRadius: 2, margin: "10px 0 14px" }} />
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text-mid)", maxWidth: "60ch", margin: "0 0 16px" }}>
        {es
          ? <>Un volante del {kyr.source} para todos los votantes. Línea de protección al votante: <a href={`tel:${kyr.hotline.tel}`} style={{ color: "var(--teal)", fontWeight: 700 }}>{kyr.hotline.label}</a>.</>
          : <>A flyer from the {kyr.source} for all voters. Voter protection hotline: <a href={`tel:${kyr.hotline.tel}`} style={{ color: "var(--teal)", fontWeight: 700 }}>{kyr.hotline.label}</a>.</>}
      </p>
      <img
        key={v.image}
        src={v.image}
        alt={v.alt}
        lang={v.lang}
        width={v.width}
        height={v.height}
        loading="lazy"
        style={{ display: "block", width: "100%", maxWidth: 640, height: "auto", border: "1px solid var(--border)", borderRadius: 6 }}
      />
      <p style={{ margin: "12px 0 0" }}>
        <a href={v.image} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 700, color: "var(--teal)" }}>
          {es ? "Abrir imagen completa ↗" : "Open full-size image ↗"}
        </a>
      </p>
    </section>
  );
}
