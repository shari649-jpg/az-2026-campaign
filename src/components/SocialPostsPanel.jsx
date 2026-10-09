import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useMySocialPosts, useSocialPosting, callSocial, SOCIAL_PLATFORMS } from "../lib/socialPosting";
import SendToSocialModal from "./SendToSocialModal";

// "My social posts" (Oct 2026): the signed-in user's drafts, scheduled posts
// and recent posts. Reads socialPosting/{uid}/posts live; every change goes
// through the social-posts function (cancel actually cancels at Upload-Post).
//
// Layout: one "Drafts" card, then ONE CARD PER DAY (today open, older days
// closed) so the list stays short however much is posted. Each sent post shows
// a small icon per network; an icon is a link to the live post when Upload-Post
// gave us one, otherwise a plain icon.

const TEAL = "#0E7A8C";
const PLUM = "#4A3163";
const CHROME = "#E1E7F0";
const small = { background: "#fff", color: TEAL, border: `1.5px solid ${TEAL}`, borderRadius: 7, padding: "5px 11px", fontWeight: 700, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" };

const BADGE = {
  draft: ["Draft", "#555", CHROME],
  scheduled: ["Scheduled", "#fff", TEAL],
  processing: ["Processing", "#7a4f00", "#fdf0c4"],
  sent: ["Sent", "#fff", "#2d7d46"],
  partial: ["Sent, some failed", "#7a4f00", "#fdf0c4"],
  failed: ["Failed", "#fff", "#c41e1e"],
};

const ICON = {
  facebook: "/social-facebook.svg", instagram: "/social-instagram.svg", twitter: "/social-x.svg",
  threads: "/social-threads.svg", tiktok: "/social-tiktok.svg", bluesky: "/social-bluesky.svg",
};

function toDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  return d && !isNaN(d) ? d : null;
}
const timeOf = (d) => (d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
function dayLabel(d) {
  const t = new Date(); const y = new Date(Date.now() - 86400000); const tm = new Date(Date.now() + 86400000);
  const base = d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  if (dayKey(d) === dayKey(t)) return `Today · ${base}`;
  if (dayKey(d) === dayKey(y)) return `Yesterday · ${base}`;
  if (dayKey(d) === dayKey(tm)) return `Tomorrow · ${base}`;
  return base;
}

function NetIcon({ id, result }) {
  const [failed, setFailed] = useState(false);
  const label = SOCIAL_PLATFORMS[id]?.label || id;
  const bad = result && result.ok === false;
  const body = failed || !ICON[id]
    ? <span style={{ fontSize: 11, fontWeight: 800, color: TEAL }}>{label.slice(0, 2)}</span>
    : <img src={ICON[id]} alt="" onError={() => setFailed(true)} style={{ width: 18, height: 18, display: "block" }} />;
  const style = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: "#fff",
    border: `2px solid ${bad ? "#c41e1e" : result?.url ? TEAL : CHROME}`, padding: 0, textDecoration: "none" };
  if (result?.url) {
    return <a href={result.url} target="_blank" rel="noopener noreferrer" style={style} title={`View on ${label}`} aria-label={`View post on ${label}`}>{body}</a>;
  }
  return <span style={style} title={bad ? `${label}: ${result.message || "failed"}` : label} aria-label={label}>{body}</span>;
}

function Card({ o, onToggle, title, summary, attention, children }) {
  return (
    <div style={{ border: `1.5px solid ${CHROME}`, borderRadius: 12, overflow: "hidden" }}>
      <button type="button" onClick={onToggle} aria-expanded={o}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: o ? "#f6f8fb" : "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <span aria-hidden style={{ color: TEAL, fontSize: 13, width: 14 }}>{o ? "▼" : "▶"}</span>
        <span style={{ fontWeight: 800, color: PLUM, fontSize: 15 }}>{title}</span>
        <span style={{ color: "#777", fontSize: 12.5 }}>{summary}</span>
        {attention && <span style={{ marginLeft: "auto", background: "#fdf0c4", color: "#7a4f00", borderRadius: 6, padding: "2px 8px", fontWeight: 800, fontSize: 12 }}>{attention}</span>}
      </button>
      {o && <div style={{ padding: "4px 12px 12px", display: "grid", gap: 10 }}>{children}</div>}
    </div>
  );
}

export default function SocialPostsPanel() {
  const { user } = useAuth();
  const { active } = useSocialPosting();
  const { loading, posts } = useMySocialPosts();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState({});          // dayKey|"drafts" -> bool (user's choice)
  const [daysShown, setDaysShown] = useState(7);

  // Ask Upload-Post how processing / past-due scheduled posts ended up (and
  // pick up post links). Repeats while the page is open.
  useEffect(() => {
    if (!user) return undefined;
    const go = () => callSocial("social-posts", user, { action: "refresh" }).catch(() => {});
    go();
    const t = setInterval(go, 60000);
    return () => clearInterval(t);
  }, [user]);

  async function act(id, action, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(id); setError("");
    try { await callSocial("social-posts", user, { action, id }); }
    catch (e) { setError(e.message); }
    setBusy(null);
  }

  const { drafts, days } = useMemo(() => {
    const drafts = posts.filter((p) => p.status === "draft");
    const byDay = new Map();
    for (const p of posts) {
      if (p.status === "draft") continue;
      const d = (p.status === "scheduled" ? toDate(p.scheduledDate) : toDate(p.sentAt) || toDate(p.updatedAt)) || new Date();
      const k = dayKey(d);
      if (!byDay.has(k)) byDay.set(k, { key: k, date: d, items: [] });
      byDay.get(k).items.push({ ...p, _when: d });
    }
    const days = [...byDay.values()].sort((a, b) => b.date - a.date);
    for (const g of days) g.items.sort((a, b) => b._when - a._when);
    return { drafts, days };
  }, [posts]);

  if (loading) return <p style={{ color: "#888", fontSize: 14 }}>Loading…</p>;
  if (!posts.length) {
    return <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
      Nothing here yet. Use <strong>Save draft</strong> in the Send dialog, or schedule a post, and it will show up here.
    </p>;
  }

  const todayK = dayKey(new Date());
  const isOpen = (key, dflt) => (key in open ? open[key] : dflt);
  const toggle = (key, dflt) => setOpen((o) => ({ ...o, [key]: !isOpen(key, dflt) }));

  const renderItem = (p) => {
    const [label, fg, bg] = BADGE[p.status] || [p.status, "#555", CHROME];
    const nets = p.platforms || [];
    const when = p.status === "scheduled" ? `for ${timeOf(toDate(p.scheduledDate))}` : timeOf(p._when || toDate(p.updatedAt));
    return (
      <div key={p.id} style={{ border: `1.5px solid ${CHROME}`, borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
          <span style={{ background: bg, color: fg, borderRadius: 6, padding: "2px 8px", fontWeight: 800 }}>{label}</span>
          <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
            {nets.map((id) => <NetIcon key={id} id={id} result={p.status === "draft" || p.status === "scheduled" ? null : p.networkResults?.[id]} />)}
          </span>
          <span style={{ color: "#888", marginLeft: "auto" }}>{when}</span>
        </div>
        <div style={{ fontSize: 14, margin: "6px 0", color: "#362A44", whiteSpace: "pre-wrap" }}>
          {p.preview || <em style={{ color: "#999" }}>(no text)</em>}
        </div>
        {(p.attachments?.length > 0) && <div style={{ fontSize: 12, color: "#888" }}>📎 {p.attachments.length} file{p.attachments.length > 1 ? "s" : ""}</div>}
        {p.notice && <div style={{ fontSize: 12.5, color: PLUM, marginTop: 4 }}>{p.notice}</div>}
        {(p.status === "failed" || p.status === "partial") && p.error && <div style={{ fontSize: 12.5, color: "#c41e1e", marginTop: 4 }}>{p.error}</div>}
        {p.status === "draft" && p.lastError && <div style={{ fontSize: 12.5, color: "#c41e1e", marginTop: 4 }}>Last attempt: {p.lastError}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {p.status === "draft" && (
            <button style={small} disabled={!active || busy === p.id} title={active ? "" : "Posting is locked until your subscription is active"} onClick={() => setEditing(p)}>Edit / send</button>
          )}
          {p.status === "scheduled" && (
            <button style={small} disabled={busy === p.id} onClick={() => act(p.id, "cancel_scheduled", "Cancel this scheduled post? It will be kept here as a draft.")}>
              {busy === p.id ? "Cancelling…" : "Cancel schedule"}
            </button>
          )}
          {p.status === "processing" && (
            <button style={small} disabled={busy === p.id} onClick={() => act(p.id, "refresh")}>Check status</button>
          )}
          {p.status !== "scheduled" && (
            <button style={{ ...small, color: "#c41e1e", borderColor: "#c41e1e" }} disabled={busy === p.id}
              onClick={() => act(p.id, "delete_draft", p.status === "draft" ? "Delete this draft?" : "Remove this from your list? (It stays posted.)")}>
              {p.status === "draft" ? "Delete" : "Remove"}
            </button>
          )}
        </div>
      </div>
    );
  };

  const shownDays = days.slice(0, daysShown);
  return (
    <div>
      {error && <div role="alert" style={{ color: "#c41e1e", fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {drafts.length > 0 && (
          <Card o={isOpen("drafts", true)} onToggle={() => toggle("drafts", true)} title="Drafts" summary={`${drafts.length} saved`}>
            {drafts.map((p) => renderItem({ ...p, _when: toDate(p.updatedAt) }))}
          </Card>
        )}
        {shownDays.map((g) => {
          const counts = {};
          for (const p of g.items) counts[p.status] = (counts[p.status] || 0) + 1;
          const bits = [counts.scheduled && `${counts.scheduled} scheduled`, (counts.sent || 0) + (counts.partial || 0) + (counts.processing || 0) > 0 && `${(counts.sent || 0) + (counts.partial || 0) + (counts.processing || 0)} sent`].filter(Boolean);
          const bad = (counts.failed || 0) + (counts.partial || 0);
          return (
            <Card key={g.key} o={isOpen(g.key, g.key === todayK)} onToggle={() => toggle(g.key, g.key === todayK)} title={dayLabel(g.date)}
              summary={`${g.items.length} post${g.items.length > 1 ? "s" : ""}${bits.length ? " · " + bits.join(", ") : ""}`}
              attention={bad ? `${bad} need${bad > 1 ? "" : "s"} a look` : null}>
              {g.items.map((p) => renderItem(p))}
            </Card>
          );
        })}
      </div>
      {days.length > daysShown && (
        <button style={{ ...small, marginTop: 10 }} onClick={() => setDaysShown((n) => n + 14)}>Show older days</button>
      )}
      {editing && (
        <SendToSocialModal draft={editing} texts={editing.texts} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
