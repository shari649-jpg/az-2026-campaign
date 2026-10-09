import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useMySocialPosts, useSocialPosting, callSocial, SOCIAL_PLATFORMS } from "../lib/socialPosting";
import SendToSocialModal from "./SendToSocialModal";

// "My social posts" (Oct 2026): the signed-in user's drafts, scheduled posts
// and recent posts. Reads socialPosting/{uid}/posts live; every change goes
// through the social-posts function (cancel actually cancels at Upload-Post).

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

function when(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  return d && !isNaN(d) ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
}

export default function SocialPostsPanel() {
  const { user } = useAuth();
  const { active } = useSocialPosting();
  const { loading, posts } = useMySocialPosts();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [showAllSent, setShowAllSent] = useState(false);

  // Ask Upload-Post how processing / past-due scheduled posts ended up.
  useEffect(() => {
    if (!user) return;
    const go = () => callSocial("social-posts", user, { action: "refresh" }).catch(() => {});
    go();
    const t = setInterval(go, 60000); // picks up networks that fail after sending (e.g. a scheduled time passing)
    return () => clearInterval(t);
  }, [user]);

  async function act(id, action, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(id); setError("");
    try { await callSocial("social-posts", user, { action, id }); }
    catch (e) { setError(e.message); }
    setBusy(null);
  }

  if (loading) return <p style={{ color: "#888", fontSize: 14 }}>Loading…</p>;
  if (!posts.length) {
    return <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
      Nothing here yet. Use <strong>Save draft</strong> in the Send dialog, or schedule a post, and it will show up here.
    </p>;
  }

  const sent = posts.filter((p) => ["sent", "partial", "failed", "processing"].includes(p.status));
  const rows = [
    ...posts.filter((p) => p.status === "draft"),
    ...posts.filter((p) => p.status === "scheduled"),
    ...(showAllSent ? sent : sent.slice(0, 5)),
  ];

  return (
    <div>
      {error && <div role="alert" style={{ color: "#c41e1e", fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((p) => {
          const [label, fg, bg] = BADGE[p.status] || [p.status, "#555", CHROME];
          const nets = (p.platforms || []).map((id) => SOCIAL_PLATFORMS[id]?.label || id).join(", ");
          return (
            <div key={p.id} style={{ border: `1.5px solid ${CHROME}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                <span style={{ background: bg, color: fg, borderRadius: 6, padding: "2px 8px", fontWeight: 800 }}>{label}</span>
                <span style={{ color: "#666" }}>{nets}</span>
                <span style={{ color: "#888", marginLeft: "auto" }}>
                  {p.status === "scheduled" ? `for ${when(p.scheduledDate)}` : when(p.sentAt || p.updatedAt)}
                </span>
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
        })}
      </div>
      {!showAllSent && sent.length > 5 && (
        <button style={{ ...small, marginTop: 10 }} onClick={() => setShowAllSent(true)}>Show all recent posts ({sent.length})</button>
      )}
      {editing && (
        <SendToSocialModal draft={editing} texts={editing.texts} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
