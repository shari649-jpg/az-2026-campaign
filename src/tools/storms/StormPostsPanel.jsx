// src/tools/storms/StormPostsPanel.jsx
//
// Staff-only panel listing a storm's posts, with add/edit/delete.
// Opened from a storm card in StormsHubPage.

import { useState, useEffect } from "react";
import { loadPosts, deletePost, MEDIA_TYPES } from "../../lib/stormLibrary";
import { useAuth } from "../../context/AuthContext";
import StormPostEditor from "./StormPostEditor";

const TEAL       = "#1D5C4A";
const CHARCOAL   = "#4A4558";
const TERRACOTTA = "#C1673A";
const BORDER     = "#C8C4BC";
const SURFACE_ALT = "#F3F4F0";

export default function StormPostsPanel({ storm, onClose }) {
  const { role } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setPosts(await loadPosts(storm.id)); }
    finally { setLoading(false); }
  }

  function openNew() { setEditingPost(null); setEditorOpen(true); }
  function openEdit(post) { setEditingPost(post); setEditorOpen(true); }

  async function handleDelete(post) {
    if (!window.confirm(`Delete post "${post.title || "Untitled"}"? This removes its media permanently.`)) return;
    await deletePost(storm.id, post.id);
    await load();
  }

  async function handleSaved() {
    setEditorOpen(false);
    await load();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 92,
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
          onClose={() => setEditorOpen(false)}
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
