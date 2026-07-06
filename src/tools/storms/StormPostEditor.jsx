// src/tools/storms/StormPostEditor.jsx
//
// Staff-only modal for creating/editing one storm post: either a single
// video OR one-to-many graphics, plus the six platform texts. Embedded
// inside StormsHubPage when a staff member opens a storm's post list.

import { useState, useEffect, useMemo } from "react";
import {
  uploadPostMedia, createPost, updatePost,
  PLATFORMS, MEDIA_TYPES, MAX_VIDEO_MB, MAX_GRAPHIC_MB, MAX_GRAPHICS_PER_POST,
} from "../../lib/stormLibrary";

const TEAL       = "#1D5C4A";
const CHARCOAL   = "#4A4558";
const TURQUOISE  = "#3ECFB2";
const TERRACOTTA = "#C1673A";
const BORDER     = "#C8C4BC";
const SURFACE_ALT = "#F3F4F0";

const EMPTY_TEXTS = PLATFORMS.reduce((acc, p) => ({ ...acc, [p.key]: "" }), {});

export default function StormPostEditor({ stormId, post, nextOrder, onClose, onSaved }) {
  const isEdit = !!post;
  const [title, setTitle] = useState(post?.title || "");
  const [mediaType, setMediaType] = useState(post?.mediaType || MEDIA_TYPES.VIDEO);
  const [existingMedia, setExistingMedia] = useState(post?.media || []); // already-uploaded, kept as-is unless removed
  const [newFiles, setNewFiles] = useState([]); // File objects staged for upload on save
  const [texts, setTexts] = useState({ ...EMPTY_TEXTS, ...(post?.texts || {}) });
  const [uploadProgress, setUploadProgress] = useState(null); // 0-1 while saving
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Local preview URLs for files staged but not yet uploaded. Regenerated
  // whenever newFiles changes, and revoked on cleanup so we don't leak
  // memory as the admin adds/removes graphics before saving.
  const newFilePreviews = useMemo(
    () => newFiles.map(f => URL.createObjectURL(f)),
    [newFiles]
  );
  useEffect(() => {
    return () => newFilePreviews.forEach(url => URL.revokeObjectURL(url));
  }, [newFilePreviews]);

  function handleFilePick(e) {
    const picked = Array.from(e.target.files || []);
    setError("");

    if (mediaType === MEDIA_TYPES.VIDEO) {
      const file = picked[0];
      if (!file) return;
      if (!file.type.startsWith("video/")) { setError("Please choose a video file."); return; }
      const mb = file.size / (1024 * 1024);
      if (mb > MAX_VIDEO_MB) { setError(`Video is ${mb.toFixed(0)}MB — must be under ${MAX_VIDEO_MB}MB.`); return; }
      setNewFiles([file]);
      setExistingMedia([]); // a new video replaces any old one
    } else {
      const bad = picked.find(f => !f.type.startsWith("image/"));
      if (bad) { setError(`"${bad.name}" isn't an image file.`); return; }
      const tooLarge = picked.find(f => f.size / (1024 * 1024) > MAX_GRAPHIC_MB);
      if (tooLarge) { setError(`"${tooLarge.name}" is over ${MAX_GRAPHIC_MB}MB.`); return; }
      const totalCount = existingMedia.length + newFiles.length + picked.length;
      if (totalCount > MAX_GRAPHICS_PER_POST) { setError(`Up to ${MAX_GRAPHICS_PER_POST} graphics per post.`); return; }
      setNewFiles(prev => [...prev, ...picked]);
    }
    e.target.value = ""; // allow re-selecting the same file later
  }

  function removeExisting(path) {
    setExistingMedia(prev => prev.filter(m => m.path !== path));
  }
  function removeNewFile(idx) {
    setNewFiles(prev => prev.filter((_, i) => i !== idx));
  }
  function switchMediaType(type) {
    setMediaType(type);
    setNewFiles([]);
    setExistingMedia([]); // switching type invalidates whatever was there before
    setError("");
  }

  async function handleSave() {
    setError("");
    const totalMediaCount = existingMedia.length + newFiles.length;
    if (totalMediaCount === 0) { setError("Add at least one file before saving."); return; }
    if (!Object.values(texts).some(t => t.trim())) { setError("Add text for at least one platform."); return; }

    setSaving(true);
    try {
      const uploaded = [];
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        const result = await uploadPostMedia(
          stormId,
          post?.id || `pending-${Date.now()}`, // stable-enough path prefix; real postId assigned on create below for new posts
          file,
          (frac) => setUploadProgress((i + frac) / newFiles.length)
        );
        uploaded.push(result);
      }
      const finalMedia = [...existingMedia, ...uploaded];
      const payload = { title, mediaType, media: finalMedia, texts };

      if (isEdit) {
        await updatePost(stormId, post.id, payload);
      } else {
        await createPost(stormId, { ...payload, order: nextOrder });
      }
      onSaved();
    } catch (e) {
      setError("Save failed — check your connection and try again.");
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 95,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
    }} onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 620, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 21, color: TEAL, fontFamily: "var(--font-display)" }}>
            {isEdit ? "Edit Post" : "New Post"}
          </h2>
          <button onClick={() => !saving && onClose()} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>✕</button>
        </div>

        <Field label="Post Title" hint="Internal label only — not shown to members.">
          <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Clip 1 — Town hall walkout" />
        </Field>

        <Field label="Media Type">
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { type: MEDIA_TYPES.VIDEO, label: "🎬 Video" },
              { type: MEDIA_TYPES.GRAPHIC, label: "🖼️ Graphic(s)" },
            ].map(({ type, label }) => (
              <button key={type} type="button" onClick={() => switchMediaType(type)} style={{
                flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14,
                border: `2px solid ${mediaType === type ? TEAL : BORDER}`,
                background: mediaType === type ? "rgba(62,207,178,0.15)" : "#fff",
                color: mediaType === type ? TEAL : "#888",
              }}>
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label={mediaType === MEDIA_TYPES.VIDEO ? "Video File" : "Graphic File(s)"}
          hint={mediaType === MEDIA_TYPES.VIDEO
            ? `One video, under ${MAX_VIDEO_MB}MB.`
            : `Up to ${MAX_GRAPHICS_PER_POST} images, each under ${MAX_GRAPHIC_MB}MB. Select multiple at once, or add more later.`}
        >
          <div style={{ position: "relative" }}>
            <input
              type="file"
              accept={mediaType === MEDIA_TYPES.VIDEO ? "video/*" : "image/*"}
              multiple={mediaType === MEDIA_TYPES.GRAPHIC}
              onChange={handleFilePick}
              style={{ ...inputStyle, padding: "8px 10px", color: "transparent" }}
            />
            <span style={{
              position: "absolute", left: 118, top: "50%", transform: "translateY(-50%)",
              fontSize: 13.5, color: CHARCOAL, pointerEvents: "none",
            }}>
              {existingMedia.length + newFiles.length > 0
                ? `${existingMedia.length + newFiles.length} file${existingMedia.length + newFiles.length === 1 ? "" : "s"} selected`
                : "No file chosen"}
            </span>
          </div>

          {(existingMedia.length > 0 || newFiles.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {existingMedia.map(m => (
                <MediaChip key={m.path} name={m.name || m.path.split("/").pop()} sizeMB={m.sizeMB} previewUrl={mediaType === MEDIA_TYPES.GRAPHIC ? m.url : null} onRemove={() => removeExisting(m.path)} />
              ))}
              {newFiles.map((f, i) => (
                <MediaChip key={i} name={f.name} sizeMB={+(f.size / (1024 * 1024)).toFixed(1)} pending previewUrl={mediaType === MEDIA_TYPES.GRAPHIC ? newFilePreviews[i] : null} onRemove={() => removeNewFile(i)} />
              ))}
            </div>
          )}
        </Field>

        <Field label="Platform Texts" hint="Fill in whichever platforms apply — you don't need all six.">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PLATFORMS.map(p => (
              <div key={p.key}>
                <label style={{ fontSize: 12, fontWeight: 700, color: CHARCOAL }}>{p.label}</label>
                <textarea
                  value={texts[p.key]}
                  onChange={e => setTexts(prev => ({ ...prev, [p.key]: e.target.value }))}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical", marginTop: 4 }}
                  placeholder={`${p.label} post text…`}
                />
              </div>
            ))}
          </div>
        </Field>

        {error && (
          <div style={{ background: "#fee2e2", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "10px 14px", color: "#991b1b", fontSize: 13.5 }}>
            {error}
          </div>
        )}

        {saving && uploadProgress !== null && (
          <div style={{ background: SURFACE_ALT, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
            Uploading… {Math.round(uploadProgress * 100)}%
            <div style={{ background: BORDER, borderRadius: 999, height: 6, marginTop: 6, overflow: "hidden" }}>
              <div style={{ background: TURQUOISE, height: "100%", width: `${uploadProgress * 100}%`, transition: "width 0.2s" }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={() => !saving && onClose()} style={{ background: "none", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer", color: "#666" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px",
            fontWeight: 800, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaChip({ name, sizeMB, pending, onRemove, previewUrl }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, background: pending ? "#fff8e0" : SURFACE_ALT,
      border: `1px solid ${pending ? "#e0c568" : BORDER}`, borderRadius: 10, padding: "6px 8px 6px 6px", fontSize: 12.5,
    }}>
      {previewUrl ? (
        <img src={previewUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, background: "#ddd", flexShrink: 0 }} />
      )}
      <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <span style={{ color: "#999" }}>{sizeMB}MB</span>
      {pending && <span style={{ color: "#c99a1f", fontWeight: 700 }}>new</span>}
      <button onClick={onRemove} style={{ background: "none", border: "none", color: TERRACOTTA, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✕</button>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: CHARCOAL, marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11.5, color: "#999", margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${BORDER}`,
  fontSize: 14.5, fontFamily: "inherit", boxSizing: "border-box",
};
