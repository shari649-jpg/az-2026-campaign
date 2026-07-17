// src/tools/storms/StormPostsPanel.jsx
//
// Staff-only panel listing a storm's posts, with add/edit/delete.
// Opened from a storm card in StormsHubPage.

import { useState, useEffect } from "react";
import {
  loadPosts, deletePost, MEDIA_TYPES, PUSH_TO_STORM_KEY, PUSH_TO_STORM_TTL_MS,
  canReview, STORM_STATUS, MAX_GRAPHIC_MB, PUBLIC_STORM_BASE_URL,
  setStormPublic, setStormPublicCardImage, uploadPublicCardImage, formatGenParams,
} from "../../lib/stormLibrary";
import { useAuth } from "../../context/AuthContext";
import StormPostEditor from "./StormPostEditor";

const TEAL       = "var(--teal)";
const CHARCOAL   = "var(--charcoal)";
const TERRACOTTA = "var(--terracotta)";
const BORDER     = "var(--border)";
const SURFACE_ALT = "var(--surface-alt)";

export default function StormPostsPanel({ storm, justCreated, onClose }) {
  const { role } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [pendingPush, setPendingPush] = useState(null); // { texts, title } staged from Message Machine

  useEffect(() => { load(); }, []);

  // Consume a Push-to-Storm payload — but only right after THIS storm was
  // just created (the auto-jump-to-Posts moment), never on an ordinary open
  // of an existing storm's Posts panel. That's what keeps a pending push
  // from silently attaching itself to some unrelated storm someone opens
  // later in the day.
  useEffect(() => {
    if (!justCreated) return;
    try {
      const raw = localStorage.getItem(PUSH_TO_STORM_KEY);
      if (!raw) return;
      localStorage.removeItem(PUSH_TO_STORM_KEY); // consumed once, win or lose
      const payload = JSON.parse(raw);
      const age = Date.now() - new Date(payload.pushedAt).getTime();
      if (!(age >= 0 && age <= PUSH_TO_STORM_TTL_MS)) return; // stale — drop it silently
      setPendingPush(payload);
      setEditingPost(null);
      setEditorOpen(true);
    } catch { /* malformed payload — ignore */ }
  }, [justCreated]);

  async function load() {
    setLoading(true);
    try { setPosts(await loadPosts(storm.id)); }
    finally { setLoading(false); }
  }

  function openNew() { setEditingPost(null); setPendingPush(null); setEditorOpen(true); }
  function openEdit(post) { setEditingPost(post); setPendingPush(null); setEditorOpen(true); }

  async function handleDelete(post) {
    if (!window.confirm(`Delete post "${post.title || "Untitled"}"? This removes its media permanently.`)) return;
    await deletePost(storm.id, post.id);
    await load();
  }

  async function handleSaved() {
    setEditorOpen(false);
    setPendingPush(null);
    await load();
  }

  return (
    <div style={{
      // z-index bumped from 92 to 1000 (July 2026) — the AppShell header
      // (including the announcement ticker, when active) sits at zIndex:100,
      // so anything below that renders underneath it, hiding this modal's
      // close button. 1000 matches the convention already used elsewhere
      // (AdminPage's details modal, FileBrowser, rebuttal-campaign-generator).
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 680, width: "100%" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 21, color: TEAL, fontFamily: "var(--font-display)" }}>{storm.title}</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#888" }}>Posts — media + platform texts members will use</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>✕</button>
        </div>

        {canReview(role) && (
          storm.status === STORM_STATUS.ACTIVE
            ? <PublicPageSettings storm={storm} posts={posts} role={role} />
            : <p style={{ fontSize: 12.5, color: "#aaa", margin: "10px 0 0" }}>Public page settings become available once this storm is Active.</p>
        )}

        <button onClick={openNew} style={{
          background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px",
          fontWeight: 800, fontSize: 13.5, cursor: "pointer", margin: "14px 0",
        }}>
          + Add Post
        </button>

        {loading ? (
          <p style={{ color: "#888", padding: "20px 0", textAlign: "center" }}>Loading posts…</p>
        ) : posts.length === 0 ? (
          <p style={{ color: "#999", padding: "20px 0", textAlign: "center" }}>No posts yet. Add the first one above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {posts.map(post => (
              <div key={post.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                background: SURFACE_ALT, borderRadius: 10, padding: "12px 16px",
              }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  {post.mediaType === MEDIA_TYPES.VIDEO && post.media?.[0] ? (
                    <video src={post.media[0].url} style={thumbStyle} muted />
                  ) : post.media?.[0] ? (
                    <img src={post.media[0].url} style={thumbStyle} alt="" />
                  ) : (
                    <div style={{ ...thumbStyle, background: "#ddd" }} />
                  )}
                  {post.mediaType === MEDIA_TYPES.GRAPHIC && (post.media?.length || 0) > 1 && (
                    <span style={{
                      position: "absolute", bottom: -4, right: -4, background: TEAL, color: "#fff",
                      fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "1px 6px", border: "2px solid #fff",
                    }}>
                      +{post.media.length - 1}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: CHARCOAL, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {post.title || "Untitled post"}
                    </div>
                    <div style={{ fontSize: 12, color: "#888" }}>
                      {post.mediaType === MEDIA_TYPES.VIDEO ? "🎬 Video" : `🖼️ ${post.media?.length || 0} graphic${post.media?.length === 1 ? "" : "s"}`}
                      {" · "}
                      {Object.values(post.texts || {}).filter(t => t.trim()).length} platform text{Object.values(post.texts || {}).filter(t => t.trim()).length === 1 ? "" : "s"}
                    </div>
                    {formatGenParams(post.genParams) && (
                      <div style={{ fontSize: 11, color: TEAL, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {formatGenParams(post.genParams)}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openEdit(post)} style={smallBtnStyle(TEAL)}>Edit</button>
                  <button onClick={() => handleDelete(post)} style={smallBtnStyle(TERRACOTTA)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editorOpen && (
        <StormPostEditor
          stormId={storm.id}
          storm={storm}
          role={role}
          post={editingPost}
          nextOrder={posts.length}
          initialTexts={pendingPush?.texts}
          initialTitle={pendingPush?.title}
          initialGenParams={pendingPush?.genParams}
          onClose={() => { setEditorOpen(false); setPendingPush(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function smallBtnStyle(color) {
  return {
    background: "#fff", color, border: `1.5px solid ${color}`, borderRadius: 7,
    padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  };
}

const thumbStyle = {
  width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#ccc",
};

// ── Public Page Settings (item 4, July 2026) ─────────────────────────────
// Manager/Admin only (gated by the caller, not this component itself —
// see canReview(role) at the call site above). Only ever rendered while
// the storm is Active. Handles the public/private toggle, the shareable
// link, and picking or uploading the card image shown on the public page.
function PublicPageSettings({ storm, posts, role }) {
  const [isPublic, setIsPublic]   = useState(!!storm.isPublic);
  const [publicToken, setToken]   = useState(storm.publicToken || null);
  const [cardImage, setCardImage] = useState(storm.publicCardImage || null);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [error, setError]         = useState("");

  // Every graphic across every post in this storm — the pool the picker
  // offers alongside the "upload a new one" option. Videos aren't offered
  // here since there's no ready static frame to use as a card image.
  const availableGraphics = posts
    .filter(p => p.mediaType === MEDIA_TYPES.GRAPHIC)
    .flatMap(p => p.media || []);

  async function handleToggle() {
    setSaving(true);
    setError("");
    try {
      const next = !isPublic;
      const token = await setStormPublic(storm.id, next, publicToken, role);
      setIsPublic(next);
      if (token) setToken(token);
    } catch (e) {
      setError(e.message || "Failed to update public access.");
    }
    setSaving(false);
  }

  async function handlePickExisting(mediaItem) {
    setSaving(true);
    setError("");
    try {
      const image = { url: mediaItem.url, path: mediaItem.path, name: mediaItem.name || "", source: "post" };
      await setStormPublicCardImage(storm.id, image, role);
      setCardImage(image);
    } catch (e) {
      setError(e.message || "Failed to set card image.");
    }
    setSaving(false);
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadPublicCardImage(storm.id, file);
      const image = { ...uploaded, source: "upload" };
      await setStormPublicCardImage(storm.id, image, role);
      setCardImage(image);
    } catch (e) {
      setError(e.message || "Upload failed.");
    }
    setUploading(false);
  }

  const publicUrl = publicToken ? `${PUBLIC_STORM_BASE_URL}/${publicToken}` : null;

  function handleCopyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div style={{ background: SURFACE_ALT, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", margin: "10px 0 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: TEAL, textTransform: "uppercase", letterSpacing: "0.06em" }}>Public Page</div>
          <div style={{ fontSize: 12.5, color: "#888", marginTop: 2 }}>Anyone with the link can view and copy this storm — no login required.</div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: saving ? "default" : "pointer", flexShrink: 0 }}>
          <input type="checkbox" checked={isPublic} disabled={saving} onChange={handleToggle} style={{ width: 18, height: 18, cursor: "pointer" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: isPublic ? TEAL : "#888" }}>{isPublic ? "Public" : "Private"}</span>
        </label>
      </div>

      {error && <div style={{ fontSize: 12.5, color: TERRACOTTA, marginTop: 8 }}>{error}</div>}

      {isPublic && publicUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px" }}>
          <span style={{ fontSize: 12.5, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{publicUrl}</span>
          <button onClick={handleCopyLink} style={smallBtnStyle(TEAL)}>{copied ? "Copied ✓" : "Copy Link"}</button>
        </div>
      )}

      {isPublic && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: CHARCOAL, marginBottom: 8 }}>Public card image</div>

          {cardImage ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <img src={cardImage.url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: `2px solid ${TEAL}` }} />
              <span style={{ fontSize: 12, color: "#888" }}>Current selection{cardImage.source === "upload" ? " (uploaded)" : " (from a post)"}</span>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "#aaa", marginTop: 0, marginBottom: 10 }}>
              No image selected yet — the public page will show a default Arizona Coalition graphic until you pick or upload one.
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {availableGraphics.map(m => (
              <button
                key={m.path}
                onClick={() => handlePickExisting(m)}
                disabled={saving}
                title="Use this graphic as the public card image"
                style={{
                  padding: 0, width: 64, height: 64, borderRadius: 8, flexShrink: 0,
                  border: `2px solid ${cardImage?.path === m.path ? TEAL : "transparent"}`,
                  cursor: saving ? "default" : "pointer", background: "none", overflow: "hidden",
                }}
              >
                <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
            ))}
            <label style={{
              width: 64, height: 64, borderRadius: 8, border: `2px dashed ${BORDER}`, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: uploading ? "default" : "pointer", fontSize: 22, color: "#999",
            }} title={`Upload a custom image (max ${MAX_GRAPHIC_MB}MB)`}>
              {uploading ? "…" : "+"}
              <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
