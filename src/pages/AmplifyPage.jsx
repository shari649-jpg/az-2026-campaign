import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocialPosting, callSocial, SOCIAL_PLATFORMS } from "../lib/socialPosting";

// Amplify board (Oct 2026). Paid Social Posting users see posts their org
// shared and open each network's live post to boost it by hand. Everything
// goes through the social-board function; the browser can't read the data.

const TEAL = "#0E7A8C";
const PLUM = "#4A3163";
const CHROME = "#E1E7F0";
const ICON = {
  facebook: "/social-facebook.svg", instagram: "/social-instagram.svg", twitter: "/social-x.svg",
  threads: "/social-threads.svg", tiktok: "/social-tiktok.svg", bluesky: "/social-bluesky.svg",
};
const ORDER = Object.keys(SOCIAL_PLATFORMS);

function ago(ms) {
  if (!ms) return "";
  const m = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function NetButton({ id, url, done, onDone, profile, caption }) {
  const [failed, setFailed] = useState(false);
  const label = (SOCIAL_PLATFORMS[id]?.label || id) + (profile ? ` (${profile})` : "");
  const icon = failed || !ICON[id]
    ? <span style={{ fontSize: 11, fontWeight: 800, color: TEAL }}>{label.slice(0, 2)}</span>
    : <img src={ICON[id]} alt="" onError={() => setFailed(true)} style={{ width: 20, height: 20, display: "block" }} />;
  const ring = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: "50%", background: "#fff", border: `2px solid ${done ? "#2d7d46" : url ? TEAL : CHROME}`, textDecoration: "none", padding: 0 };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      {url
        ? <a href={url} target="_blank" rel="noopener noreferrer" style={ring} aria-label={`Open post on ${label}`} title={`Open on ${label}`}>{icon}</a>
        : <span style={{ ...ring, opacity: 0.5 }} title={`${label}: link not ready yet`}>{icon}</span>}
      <label style={{ fontSize: 11.5, color: done ? "#2d7d46" : "#666", display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
        <input type="checkbox" checked={done} onChange={(e) => onDone(e.target.checked)} /> Done
      </label>
      {caption && <span style={{ fontSize: 11, color: PLUM, fontWeight: 700, maxWidth: 84, textAlign: "center", lineHeight: 1.2 }}>{caption}</span>}
    </span>
  );
}

export default function AmplifyPage() {
  const { user } = useAuth();
  const { loading: subLoading, active } = useSocialPosting();
  const [state, setState] = useState({ loading: true, entries: [], platforms: null });
  const [error, setError] = useState("");
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r = await callSocial("social-board", user, { action: "list" });
      if (alive.current) { setState({ loading: false, entries: r.entries || [], platforms: r.platforms }); setError(""); }
    } catch (e) {
      if (alive.current) { setError(e.message); setState((s) => ({ ...s, loading: false })); }
    }
  }, [user]);

  useEffect(() => {
    alive.current = true;
    if (!active) return () => { alive.current = false; };
    load();
    const t = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { alive.current = false; clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [active, load]);

  async function togglePlatform(id) {
    const cur = state.platforms || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setState((s) => ({ ...s, platforms: next }));
    try { await callSocial("social-board", user, { action: "set_platforms", platforms: next }); }
    catch (e) { setError(e.message); }
  }

  async function mark(entryId, platform, done) {
    setState((s) => ({ ...s, entries: s.entries.map((e) => e.id !== entryId ? e : { ...e, done: done ? [...new Set([...e.done, platform])] : e.done.filter((p) => p !== platform) }) }));
    try { await callSocial("social-board", user, { action: "mark", id: entryId, platform, done }); }
    catch (e) { setError(e.message); }
  }

  const wrap = { maxWidth: 760, margin: "0 auto", padding: "24px 16px" };
  if (subLoading) return <div style={wrap}><p style={{ color: "#888" }}>Loading…</p></div>;

  if (!active) {
    return (
      <div style={wrap}>
        <h1 style={{ color: PLUM, marginTop: 0 }}>Amplify board</h1>
        <p style={{ lineHeight: 1.6, color: "#362A44" }}>
          The Amplify board lists the posts your teammates just sent, with a link to each live post, so you can
          like, repost and comment without hunting for links in group chats. It is part of Social Posting.
        </p>
        <Link to="/profile" style={{ color: TEAL, fontWeight: 700 }}>Subscribe to Social Posting on your Profile page →</Link>
      </div>
    );
  }

  const picked = state.platforms;            // null = never chosen
  const filterOn = picked && picked.length > 0;
  const shown = state.entries
    .map((e) => {
      const nets = e.networks.filter((n) => !filterOn || picked.includes(n.platform))
        .sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform) || a.profile.localeCompare(b.profile));
      const count = {}; nets.forEach((n) => { count[n.platform] = (count[n.platform] || 0) + 1; });
      return { ...e, nets: nets.map((n) => ({ ...n, caption: count[n.platform] > 1 ? n.profile : "" })) };
    })
    .filter((e) => e.nets.length);

  return (
    <div style={wrap}>
      <h1 style={{ color: PLUM, marginTop: 0 }}>Amplify board</h1>
      <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
        Recent posts shared by your team. Tap a network to open the post, boost it by hand (like, repost, comment),
        then tick Done. Posts leave the board after about a week.
      </p>
      <div style={{ margin: "14px 0", padding: 12, border: `1.5px solid ${CHROME}`, borderRadius: 10 }}>
        <div style={{ fontWeight: 800, color: PLUM, fontSize: 14, marginBottom: 8 }}>My platforms</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ORDER.map((id) => {
            const on = (picked || []).includes(id);
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => togglePlatform(id)}
                style={{ padding: "6px 12px", borderRadius: 999, fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  border: `1.5px solid ${TEAL}`, background: on ? TEAL : "#fff", color: on ? "#fff" : TEAL }}>
                {SOCIAL_PLATFORMS[id].label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12.5, color: "#777", marginTop: 8 }}>
          {filterOn ? "Showing only the networks you ticked." : "Tick the networks you use to hide the rest. With none ticked you see everything."}
        </div>
      </div>
      {error && <div role="alert" style={{ color: "#c41e1e", fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {state.loading ? <p style={{ color: "#888" }}>Loading…</p>
        : shown.length === 0 ? <p style={{ color: "#666", lineHeight: 1.6 }}>Nothing to boost right now. New posts appear here after a teammate sends them with the Amplify box ticked.</p>
        : (
          <div style={{ display: "grid", gap: 12 }}>
            {shown.map((e) => (
              <div key={e.id} style={{ border: `1.5px solid ${CHROME}`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 12.5, color: "#777", marginBottom: 6 }}>
                  <strong style={{ color: PLUM }}>{e.mine ? "You" : e.ownerName}</strong> · {ago(e.createdAt)}
                </div>
                <div style={{ fontSize: 14, color: "#362A44", marginBottom: 10, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}>{(e.preview || "").replace(/\s+/g, " ").trim() || <em style={{ color: "#999" }}>(no text)</em>}</div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {e.nets.map((n) => <NetButton key={n.key} id={n.platform} url={n.url} profile={n.caption ? n.profile : ""} caption={n.caption} done={e.done.includes(n.key)} onDone={(d) => mark(e.id, n.key, d)} />)}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
