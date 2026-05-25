import { Outlet, NavLink } from "react-router-dom";
import { useState } from "react";

const NAV_ITEMS = [
  { path: "/",               short: "Home" },
  { path: "/research",       short: "Research" },
  { path: "/messaging",      short: "Messaging" },
  { path: "/rebuttal",       short: "Rebuttal" },
  { path: "/rapid-response", short: "Rapid Response" },
  { path: "/resources",      short: "Resources" },
];

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        .nav-link {
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--charcoal);
          text-decoration: none;
          padding: 6px 2px;
          border-bottom: 3px solid transparent;
          transition: color 0.15s, border-color 0.15s;
          white-space: nowrap;
        }
        .nav-link:hover {
          color: var(--teal);
          text-decoration: none;
          border-bottom-color: var(--teal-mid);
        }
        .nav-link.active {
          color: var(--teal);
          border-bottom-color: var(--gold);
        }
        .mobile-nav-link {
          display: block;
          font-family: var(--font-body);
          font-size: 17px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--charcoal);
          text-decoration: none;
          padding: 15px 24px;
          border-bottom: 1px solid var(--surface-alt);
          transition: background 0.1s, color 0.1s;
        }
        .mobile-nav-link:hover { background: var(--teal-light); color: var(--teal); text-decoration: none; }
        .mobile-nav-link.active { color: var(--teal); background: var(--teal-light); }
        .hamburger {
          display: none;
          flex-direction: column;
          gap: 5px;
          cursor: pointer;
          background: none;
          border: none;
          padding: 8px;
        }
        .hamburger span {
          display: block;
          width: 24px;
          height: 2px;
          background: var(--charcoal);
          border-radius: 2px;
          transition: all 0.2s;
        }
        @media (max-width: 900px) {
          .nav-links-desktop { display: none !important; }
          .hamburger { display: flex !important; }
        }
        @media (min-width: 901px) {
          .mobile-menu { display: none !important; }
        }
      `}</style>

      {/* ── Top bar ── */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--bg)",
        borderBottom: "3px solid var(--gold)",
        height: "var(--nav-height)",
        boxShadow: "0 2px 12px rgba(74,69,88,0.08)",
      }}>
        <div style={{
          maxWidth: "var(--max-width)",
          margin: "0 auto",
          padding: "0 24px",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}>
          {/* Logo */}
          <NavLink to="/" style={{ textDecoration: "none", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src="/azc-logo.png"
              alt="Arizona Coalition"
              style={{ height: 50, width: 50, objectFit: "contain" }}
            />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
              <span style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                color: "var(--teal)",
                letterSpacing: "-0.01em",
              }}>Arizona Coalition</span>
              <span style={{
                fontFamily: "var(--font-body)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--text-mute)",
              }}>Operations Hub · 2026</span>
            </div>
          </NavLink>

          {/* Desktop nav */}
          <nav className="nav-links-desktop" style={{ display: "flex", gap: 28, alignItems: "center" }}>
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              >
                {item.short}
              </NavLink>
            ))}
          </nav>

          {/* Hamburger */}
          <button
            className="hamburger"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <span style={{ transform: menuOpen ? "rotate(45deg) translateY(7px)" : "none" }} />
            <span style={{ opacity: menuOpen ? 0 : 1 }} />
            <span style={{ transform: menuOpen ? "rotate(-45deg) translateY(-7px)" : "none" }} />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      <div className="mobile-menu" style={{
        position: "fixed",
        top: "var(--nav-height)",
        left: 0,
        right: 0,
        background: "var(--bg)",
        borderBottom: "3px solid var(--gold)",
        zIndex: 99,
        display: menuOpen ? "block" : "none",
        boxShadow: "0 8px 24px rgba(74,69,88,0.12)",
      }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) => "mobile-nav-link" + (isActive ? " active" : "")}
            onClick={() => setMenuOpen(false)}
          >
            {item.short}
          </NavLink>
        ))}
      </div>

      {/* ── Page content ── */}
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: "3px solid var(--gold)",
        background: "var(--teal)",
        padding: "36px 24px 28px",
        marginTop: "auto",
      }}>
        <div style={{
          maxWidth: "var(--max-width)",
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 32,
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src="/azc-logo.png" alt="Arizona Coalition" style={{ height: 58, width: 58, objectFit: "contain" }} />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--gold)", marginBottom: 4 }}>
                Arizona Coalition
              </div>
              <div style={{ fontSize: 12, color: "var(--turquoise-light)", letterSpacing: "0.06em" }}>
                Operations Hub · Arizona 2026
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
            <FooterLinkGroup title="Tools" links={[
              { label: "Candidate Research",  path: "/research" },
              { label: "Message Machine",     path: "/messaging" },
              { label: "Rebuttal Generator",  path: "/rebuttal" },
              { label: "Rapid Response",      path: "/rapid-response" },
            ]} />
            <FooterLinkGroup title="Resources" links={[
              { label: "All Resources",       path: "/resources" },
              { label: "AZ SOS Elections",    href: "https://azsos.gov/elections" },
              { label: "Ballotpedia AZ",      href: "https://ballotpedia.org/Arizona" },
              { label: "AZ Legislature",      href: "https://www.azleg.gov" },
            ]} />
          </div>
        </div>

        <div style={{
          maxWidth: "var(--max-width)",
          margin: "24px auto 0",
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.15)",
          fontSize: 11,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.04em",
        }}>
          Internal coalition use only · Not for public distribution
        </div>
      </footer>
    </div>
  );
}

function FooterLinkGroup({ title, links }) {
  return (
    <div>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--gold)",
        marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {links.map(link => (
          link.href
            ? <a key={link.href} href={link.href} target="_blank" rel="noreferrer"
                style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", textDecoration: "none" }}
                onMouseEnter={e => e.target.style.color = "var(--gold)"}
                onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.75)"}
              >
                {link.label} ↗
              </a>
            : <NavLink key={link.path} to={link.path}
                style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", textDecoration: "none" }}
                onMouseEnter={e => e.target.style.color = "var(--gold)"}
                onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.75)"}
              >
                {link.label}
              </NavLink>
        ))}
      </div>
    </div>
  );
}
