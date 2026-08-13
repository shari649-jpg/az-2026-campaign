import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import ConversationCoach from "./ConversationCoach";
import { loadActiveAnnouncement } from "../lib/announcementLibrary";
import ResearchPage from "../tools/research/ResearchPage";

const NAV_ITEMS = [
  { path: "/",               short: "Home" },
  { path: "/messaging",      short: "Messaging" },
  { path: "/research",       short: "Research" },
  { path: "/rapid-response", short: "Rapid Response" },
  { path: "/rebuttal",       short: "Rebuttal" },
];

const MORE_ITEMS = [
  { path: "/media",             short: "Media" },
  { path: "/library",           short: "Library" },
  { path: "/resources",         short: "Resources" },
  { path: "/misinfo-monitor",   short: "BS Monitor" },
  { path: "/storms",             short: "Storm Chaser's Hub" },
  { path: "/manual",             short: "Help" },
];

// Scrolls the window to the top whenever the route changes, regardless of
// how the user arrived (nav click, direct link, tool-to-tool push, or
// browser back/forward). Lives once here in AppShell since every routed
// page renders through the single <Outlet /> below.
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

// Floating scroll-to-top / scroll-to-bottom arrows.
// Appears once the user has scrolled down; hidden at the very top of the page.
function ScrollButtons() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 240);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  const btnStyle = {
    width: 44, height: 44, borderRadius: "50%",
    background: "var(--teal)", color: "#fff",
    border: "2px solid var(--gold)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18, fontWeight: 900, cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
    fontFamily: "inherit",
  };

  return (
    <div style={{
      position: "fixed", left: 20, bottom: 28, zIndex: 90,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Scroll to top"
        title="Scroll to top"
        style={btnStyle}
      >↑</button>
      <button
        onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
        aria-label="Scroll to bottom"
        title="Scroll to bottom"
        style={btnStyle}
      >↓</button>
    </div>
  );
}

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, profile, logout, isAdmin, isManager, isOrgAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Keep Research Hub mounted across navigation (Aug 2026) ────────────
  // Research's own tabs (candidate search results, bill lookups, etc.)
  // used to reset every time the person navigated away and back, because
  // React Router unmounts <Outlet />'s content on every route change —
  // there's no built-in way to navigate away from a route without
  // destroying its component tree. Fix: render <ResearchPage /> here in
  // AppShell instead of through the normal route switch, and just hide it
  // with CSS when the person isn't on /research — it never unmounts once
  // mounted, so all of its own internal state (and each of its tabs')
  // survives real navigation, not just tab-switching within the page.
  // The actual /research Route in App.jsx is kept registered (so the auth
  // guard, layout, and direct links/back-forward still work) but renders
  // nothing — this component is the real content now. Mounted lazily
  // (only once the person has actually visited /research) so a person who
  // never opens Research never pays for its on-mount data fetches.
  const onResearch = location.pathname === "/research";
  const [researchMounted, setResearchMounted] = useState(onResearch);
  useEffect(() => {
    if (onResearch) setResearchMounted(true);
  }, [onResearch]);

  // ── Scheduled header announcement (start/end date-time banner) ──
  // Polled rather than realtime (onSnapshot) — consistent with the rest of
  // the app's manual-fetch style — so a scheduled message can start/stop
  // showing without anyone reloading the page, just up to a minute late.
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const a = await loadActiveAnnouncement();
        if (!cancelled) setActiveAnnouncement(a);
      } catch {}
    };
    check();
    const interval = setInterval(check, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const displayName = profile?.fullName || user?.displayName || user?.email || "User";
  const initials = displayName
    .split(" ")
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleLogout() {
    setUserMenuOpen(false);
    await logout();
    navigate("/login");
  }

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
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-100%); }
        }
        .ticker-track {
          display: inline-block;
          padding-left: 100%;
          animation: tickerScroll 22s linear infinite;
          white-space: nowrap;
        }
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
          .user-menu-desktop { display: none !important; }
          .user-menu-mobile-btn { display: flex !important; }
        }
        @media (min-width: 901px) {
          .mobile-menu { display: none !important; }
          .user-menu-mobile-btn { display: none !important; }
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
              }}>Comms Hub · 2026</span>
            </div>
          </NavLink>

          {/* Desktop nav */}
          <nav className="nav-links-desktop" style={{ display: "flex", gap: 24, alignItems: "center" }}>
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

            {/* More ▾ dropdown — click to open, close on outside click */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMoreOpen(v => !v)}
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13, fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: moreOpen ? "var(--teal)" : "var(--charcoal)",
                  background: "none", border: "none",
                  borderBottom: `3px solid ${moreOpen ? "var(--gold)" : "transparent"}`,
                  padding: "6px 2px",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                  transition: "color 0.15s, border-color 0.15s",
                }}
                aria-expanded={moreOpen}
                aria-haspopup="true"
              >
                More
                <span style={{
                  fontSize: 9,
                  display: "inline-block",
                  transform: moreOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s",
                  marginTop: 1,
                }}>▼</span>
              </button>

              {moreOpen && (
                <>
                  <div
                    onClick={() => setMoreOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 199 }}
                  />
                  <div style={{
                    position: "absolute", top: "100%", right: 0,
                    background: "var(--bg)",
                    border: "2px solid var(--border)",
                    borderRadius: 10,
                    boxShadow: "0 8px 32px rgba(74,69,88,0.15)",
                    minWidth: 160, zIndex: 200,
                    overflow: "hidden",
                  }}>
                    {MORE_ITEMS.map(item => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setMoreOpen(false)}
                        className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
                        style={{
                          display: "block",
                          padding: "12px 18px",
                          borderBottom: "1px solid var(--surface-alt)",
                          borderRadius: 0,
                        }}
                      >
                        {item.short}
                      </NavLink>
                    ))}
                  </div>
                </>
              )}
            </div>
          </nav>

          {/* ── Right side: User avatar (desktop) + Hamburger (mobile) ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>

            {/* Desktop user menu */}
            <div className="user-menu-desktop" style={{ position: "relative" }}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                title={displayName}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "var(--teal)",
                  color: "#fff",
                  border: "2px solid var(--gold)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  letterSpacing: "0.04em",
                  transition: "background 0.15s",
                  flexShrink: 0,
                }}
              >
                {initials}
              </button>

              {userMenuOpen && (
                <>
                  <div
                    onClick={() => setUserMenuOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 199 }}
                  />
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0,
                    background: "var(--bg)",
                    border: "2px solid var(--border)",
                    borderRadius: 10,
                    boxShadow: "0 8px 32px rgba(74,69,88,0.15)",
                    minWidth: 200, zIndex: 200,
                    overflow: "hidden",
                  }}>
                    {/* User info */}
                    <div style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid var(--surface-alt)",
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--charcoal)" }}>
                        {displayName}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 2 }}>
                        {user?.email}
                      </div>
                      <div style={{
                        marginTop: 6,
                        display: "inline-block",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        background: profile?.role === "administrator" ? "var(--gold)" :
                                    profile?.role === "manager" ? "var(--turquoise)" : "var(--surface-alt)",
                        color: profile?.role === "administrator" ? "var(--teal)" :
                               profile?.role === "manager" ? "var(--teal)" : "var(--text-mute)",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}>
                        {profile?.role ?? "user"}
                      </div>
                    </div>
                    {/* Announcements link (Admin + Manager) */}
                    {isManager && (
                      <NavLink
                        to="/announcements"
                        onClick={() => setUserMenuOpen(false)}
                        style={{ display: "block", padding: "12px 16px", fontSize: 14, fontWeight: 700, color: "var(--teal)", textDecoration: "none", borderBottom: "1px solid var(--surface-alt)", background: "none" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--teal-light)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}
                      >
                        📢 Announcements
                      </NavLink>
                    )}
                    {/* Prompt Sandbox link (Manager + Admin) — Handoff #26 follow-up */}
                    {isManager && (
                      <NavLink
                        to="/sandbox"
                        onClick={() => setUserMenuOpen(false)}
                        style={{ display: "block", padding: "12px 16px", fontSize: 14, fontWeight: 700, color: "var(--teal)", textDecoration: "none", borderBottom: "1px solid var(--surface-alt)", background: "none" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--teal-light)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}
                      >
                        🧪 Prompt Sandbox
                      </NavLink>
                    )}
                    {/* Admin link — also shown to a plain org admin (August
                        2026, TODO #1), who lands on the same /admin route
                        but AdminPage.jsx routes them to the much smaller
                        OrgAdminPanel instead of the full tabbed UI. Label
                        reflects which one they'll actually see. */}
                    {(isAdmin || isOrgAdmin) && (
                      <NavLink
                        to="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        style={{ display: "block", padding: "12px 16px", fontSize: 14, fontWeight: 700, color: "var(--teal)", textDecoration: "none", borderBottom: "1px solid var(--surface-alt)", background: "none" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--teal-light)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}
                      >
                        {isAdmin ? "⚙️ Admin" : "👥 My Org"}
                      </NavLink>
                    )}
                    {/* Profile link */}
                    <NavLink
                      to="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      style={{ display: "block", padding: "12px 16px", fontSize: 14, fontWeight: 700, color: "var(--charcoal)", textDecoration: "none", borderBottom: "1px solid var(--surface-alt)", background: "none" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--teal-light)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      👤 Profile
                    </NavLink>
                    {/* Sign out */}
                    <button
                      onClick={handleLogout}
                      style={{
                        width: "100%",
                        padding: "13px 16px",
                        background: "none",
                        border: "none",
                        textAlign: "left",
                        fontSize: 14,
                        fontFamily: "var(--font-body)",
                        color: "#c41e1e",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#fdf2f2"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>

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
        </div>

        {/* Scheduled announcement ticker — only rendered while one is active */}
        {activeAnnouncement && (
          <div style={{
            background: "var(--gold)",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            overflow: "hidden",
            height: 30,
            display: "flex",
            alignItems: "center",
          }}>
            <div className="ticker-track" style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--teal)",
              letterSpacing: "0.02em",
            }}>
              📢 {activeAnnouncement.text}
            </div>
          </div>
        )}
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
        <div style={{ borderTop: "2px solid var(--gold)", margin: "4px 0" }} />
        {MORE_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => "mobile-nav-link" + (isActive ? " active" : "")}
            onClick={() => setMenuOpen(false)}
          >
            {item.short}
          </NavLink>
        ))}

        {/* Mobile announcements link (Admin + Manager) */}
        {isManager && (
          <NavLink
            to="/announcements"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => "mobile-nav-link" + (isActive ? " active" : "")}
          >
            📢 Announcements
          </NavLink>
        )}
        {/* Mobile sandbox link (Manager + Admin) — Handoff #26 follow-up */}
        {isManager && (
          <NavLink
            to="/sandbox"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => "mobile-nav-link" + (isActive ? " active" : "")}
          >
            🧪 Prompt Sandbox
          </NavLink>
        )}
        {/* Mobile admin link — also org admins, see desktop comment above */}
        {(isAdmin || isOrgAdmin) && (
          <NavLink
            to="/admin"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => "mobile-nav-link" + (isActive ? " active" : "")}
          >
            {isAdmin ? "⚙️ Admin" : "👥 My Org"}
          </NavLink>
        )}
        {/* Mobile profile link */}
        <NavLink
          to="/profile"
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) => "mobile-nav-link" + (isActive ? " active" : "")}
        >
          👤 Profile
        </NavLink>
        {/* Mobile user section */}
        <div style={{ borderTop: "2px solid var(--gold)", margin: "4px 0" }} />
        <div style={{ padding: "14px 24px 10px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--teal)", color: "#fff",
            border: "2px solid var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--charcoal)" }}>{displayName}</div>
            <div style={{ fontSize: 12, color: "var(--text-mute)" }}>{user?.email}</div>
          </div>
        </div>
        <button
          onClick={() => { setMenuOpen(false); handleLogout(); }}
          style={{
            display: "block",
            width: "100%",
            padding: "14px 24px",
            background: "none",
            border: "none",
            borderTop: "1px solid var(--surface-alt)",
            textAlign: "left",
            fontSize: 16,
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            color: "#c41e1e",
            cursor: "pointer",
            letterSpacing: "0.03em",
          }}
        >
          Sign Out
        </button>
      </div>

      {/* ── Page content ── */}
      <ScrollToTopOnNavigate />
      <main style={{ flex: 1 }}>
        {researchMounted && (
          <div style={{ display: onResearch ? "block" : "none" }}>
            <ResearchPage />
          </div>
        )}
        <div style={{ display: onResearch ? "none" : "block" }}>
          <Outlet />
        </div>
      </main>

      <ScrollButtons />
      <ConversationCoach />

      {/* ── Footer ── */}
      <footer style={{
        borderTop: "3px solid var(--gold)",
        background: "var(--teal)",
        padding: "40px 24px 28px",
        marginTop: "auto",
      }}>
        <div style={{
          maxWidth: "var(--max-width)",
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 40,
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}>
          {/* Brand block */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 58, width: 58, objectFit: "contain" }} />
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--gold)", marginBottom: 4 }}>
                  Arizona Coalition
                </div>
                <div style={{ fontSize: 12, color: "var(--turquoise-light)", letterSpacing: "0.06em" }}>
                  Comms Hub · Arizona 2026
                </div>
              </div>
            </div>

            {/* Social icons */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {/* Instagram */}
              <a href="https://www.instagram.com/arizonacoalition/" target="_blank" rel="noreferrer" aria-label="Instagram" style={{ color: "rgba(255,255,255,0.7)", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--gold)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </a>
              {/* Facebook */}
              <a href="https://www.facebook.com/DemsForAction/" target="_blank" rel="noreferrer" aria-label="Facebook" style={{ color: "rgba(255,255,255,0.7)", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--gold)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              {/* TikTok */}
              <a href="https://www.tiktok.com/@azcoalition" target="_blank" rel="noreferrer" aria-label="TikTok" style={{ color: "rgba(255,255,255,0.7)", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--gold)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                </svg>
              </a>
              {/* X / Twitter */}
              <a href="https://x.com/DemsForAction" target="_blank" rel="noreferrer" aria-label="X (Twitter)" style={{ color: "rgba(255,255,255,0.7)", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--gold)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              {/* Threads */}
              <a href="https://www.threads.com/@arizonacoalition" target="_blank" rel="noreferrer" aria-label="Threads" style={{ color: "rgba(255,255,255,0.7)", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--gold)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.722-2.042 1.351-1.399 2.017-3.549 1.986-6.338h-7.995v-2.014H22.08c.028 3.619-.598 6.365-2.204 8.253C18.275 23.24 15.737 24 12.186 24zm4.832-11.218H8.654v-1.963h8.364v1.963zm-7.357-3.985a5.18 5.18 0 01-.476-.023c-1.928-.244-3.132-1.684-3.006-3.575.135-1.974 1.63-3.33 3.715-3.33.07 0 .14.001.21.004 1.61.073 2.924.861 3.512 2.12.43.924.414 2.013-.043 2.96l-1.822-.894c.224-.457.232-.973.024-1.416-.33-.71-1.097-1.153-2.01-1.196a1.9 1.9 0 00-.13-.004c-1.126 0-1.812.614-1.884 1.641-.072 1.054.595 1.727 1.774 1.879.102.012.206.018.313.018.614 0 1.202-.178 1.695-.515l1.068 1.662c-.802.542-1.754.839-2.74.669z"/>
                </svg>
              </a>
            </div>

            {/* Contact */}
            <div>
              <a href="mailto:info@arizonacoalition.net" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none", letterSpacing: "0.02em" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--gold)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.65)"}>
                ✉ info@arizonacoalition.net
              </a>
            </div>
          </div>

          {/* Nav links */}
          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
           <FooterLinkGroup title="Tools" links={[
  { label: "Candidate Research",  path: "/research" },
  { label: "Message Machine",     path: "/messaging" },
  { label: "Rebuttal Generator",  path: "/rebuttal" },
  { label: "Rapid Response",      path: "/rapid-response" },
  { label: "Media Library",       path: "/media" },
  { label: "Shared Library",      path: "/library" },
  { label: "BS Monitor",     path: "/misinfo-monitor" },
]} />
            <FooterLinkGroup title="Resources" links={[
              { label: "All Resources",       path: "/resources" },
              { label: "AZ SOS Elections",    href: "https://azsos.gov/elections" },
              { label: "Ballotpedia AZ",      href: "https://ballotpedia.org/Arizona" },
              { label: "AZ Legislature",      href: "https://www.azleg.gov" },
            ]} />
          </div>
        </div>

        {/* Bottom bar — copyright + legal */}
        <div style={{
          maxWidth: "var(--max-width)",
          margin: "28px auto 0",
          paddingTop: 18,
          borderTop: "1px solid rgba(255,255,255,0.15)",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", letterSpacing: "0.04em" }}>
            © 2026 Arizona Coalition. All rights reserved.
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", letterSpacing: "0.03em", textAlign: "right" }}>
            Internal coalition use only · Not for public distribution · Paid for by Arizona Coalition
          </span>
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
