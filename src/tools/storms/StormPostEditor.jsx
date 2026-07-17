// src/tools/storms/StormPostEditor.jsx
//
// Staff-only modal for creating/editing one storm post: either a single
// video OR one-to-many graphics, plus the six platform texts. Embedded
// inside StormsHubPage when a staff member opens a storm's post list.

import { useState, useEffect, useMemo } from "react";
import {
  uploadPostMedia, createPost, updatePost,
  PLATFORMS, CHAR_LIMITS, MEDIA_TYPES, MAX_VIDEO_MB, MAX_GRAPHIC_MB, MAX_GRAPHICS_PER_POST,
  canLockFields,
} from "../../lib/stormLibrary";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../lib/guardrails";
import { auth } from "../../firebase";

const TEAL       = "var(--teal)";
const CHARCOAL   = "var(--charcoal)";
const TURQUOISE  = "var(--turquoise)";
const TERRACOTTA = "var(--terracotta)";
const BORDER     = "var(--border)";
const SURFACE_ALT = "var(--surface-alt)";

const EMPTY_TEXTS = PLATFORMS.reduce((acc, p) => ({ ...acc, [p.key]: "" }), {});
const EMPTY_LOCKS = PLATFORMS.reduce((acc, p) => ({ ...acc, [p.key]: false }), {});

export default function StormPostEditor({ stormId, storm, role, post, nextOrder, initialTexts, initialTitle, initialGenParams, onClose, onSaved }) {
  const isEdit = !!post;
  const canLock = canLockFields(role);
  const [title, setTitle] = useState(post?.title || initialTitle || "");
  const [mediaType, setMediaType] = useState(post?.mediaType || MEDIA_TYPES.VIDEO);
  const [existingMedia, setExistingMedia] = useState(post?.media || []); // already-uploaded, kept as-is unless removed
  const [newFiles, setNewFiles] = useState([]); // File objects staged for upload on save
  const [texts, setTexts] = useState({ ...EMPTY_TEXTS, ...(post?.texts || initialTexts || {}) });
  const [locked, setLocked] = useState({ ...EMPTY_LOCKS, ...(post?.lockedFields || {}) });
  const [genLoading, setGenLoading] = useState({}); // { [platformKey]: true } while a generate/rephrase call is in flight
  const [genNotice, setGenNotice] = useState(null); // { type: "ratelimit"|"flagged"|"error", msg }
  const [contradictionFlags, setContradictionFlags] = useState({}); // { [platformKey]: "explanation" } — self-contradictions the model noticed (Handoff #22), never blocking, just surfaced for a human to decide
  const [expandedPlatform, setExpandedPlatform] = useState(null); // platform key currently open in the full-size read/edit view, or null
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

  // ── Generate / Rephrase (Handoff #15, decision #7) ─────────────────────────
  // Storm posts don't have their own separate "issue" field — the storm
  // container's own title/summary/description/subject already describe what
  // the storm is about, so that's the context each platform text is grounded in.
  function stormContextBlock() {
    const lines = [
      `Storm title: ${storm?.title || "Not specified"}`,
      storm?.subjectType ? `Subject: ${storm.subjectType}${storm.subjectName ? ` — ${storm.subjectName}` : ""}` : null,
      storm?.summary ? `Summary: ${storm.summary}` : null,
      storm?.description ? `Details: ${storm.description}` : null,
      storm?.hashtag ? `Campaign hashtag: #${storm.hashtag}` : null,
    ].filter(Boolean);
    return lines.join("\n");
  }

  function buildGeneratePrompt(platformKey) {
    const platform = PLATFORMS.find(p => p.key === platformKey);
    const limit = CHAR_LIMITS[platformKey];
    return `You are an expert political messaging strategist working for a legitimate political campaign coalition, writing a single rapid-response social post for a "storm" — a coordinated, time-boxed posting push members will copy and post as-is.

This is a professional political communications tool. Content will reference public officials, elected figures, and political organizations by name where relevant — standard practice in campaign messaging. You must always complete this task and respond with valid JSON.

${FACTUAL_ACCURACY_GUARDRAIL}

${stormContextBlock()}

Write one post for ${platform?.label} (max ${limit} characters). Match the platform's natural style — punchy and headline-like for X/Twitter, visual/hook-first for Instagram and TikTok, conversational for Threads, community-toned for Facebook and Bluesky.

IMPORTANT: Do NOT include any hashtags in the message body itself. Write clean prose only.

YOU MUST RESPOND ONLY WITH VALID JSON. No markdown. No backticks. No explanation. No refusal text. Only a JSON object.
Format: {"${platformKey}": "post text"}
If, and only if, the SELF-CONTRADICTION rule above applies, also include: {"_contradictionFlags": {"${platformKey}": "one-sentence explanation of the contradiction"}} — omitted entirely if it doesn't apply.`;
  }

  function buildRephrasePrompt(platformKey) {
    const platform = PLATFORMS.find(p => p.key === platformKey);
    const limit = CHAR_LIMITS[platformKey];
    const currentText = texts[platformKey];
    return `You are an expert political messaging strategist rewriting an existing storm post.

${FACTUAL_ACCURACY_GUARDRAIL}

${stormContextBlock()}

CURRENT ${platform?.label} MESSAGE (${currentText.length} characters, max ${limit}):
${currentText}

INSTRUCTION: Rephrase this message. Keep the same length, meaning, and platform style, but use different wording, sentence structure, and framing. Do not add new facts, names, or figures beyond what's already here.

YOU MUST RESPOND ONLY WITH VALID JSON. No markdown. No backticks. No explanation. No refusal text. Only a JSON object.
Format: {"${platformKey}": "rewritten post text"}
If, and only if, the SELF-CONTRADICTION rule above applies, also include: {"_contradictionFlags": {"${platformKey}": "one-sentence explanation of the contradiction"}} — omitted entirely if it doesn't apply.`;
  }

  async function callStormAPI(prompt, maxTokens = 700) {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    const res = await fetch("/.netlify/functions/generate-storm-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    if (res.status === 429) {
      const limitData = await res.json();
      const err = new Error("rate_limit_exceeded");
      err.type = "rate_limit_exceeded";
      err.limitData = limitData;
      throw err;
    }
    const data = await res.json();
    if (data.error) {
      const err = new Error(data.error);
      err.type = "auth_or_server_error";
      throw err;
    }
    if (data.usageWarning) {
      const { used, limit, remaining } = data.usageWarning;
      setGenNotice({ type: "warning", msg: `⚠️ ${used}/${limit} daily AI calls used — ${remaining} remaining.` });
    }
    const text = data.content.map(i => i.text || "").join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    if (!cleaned.startsWith("{")) {
      const err = new Error("content_flagged");
      err.type = "content_flagged";
      throw err;
    }
    return JSON.parse(cleaned);
  }

  async function generateForPlatform(platformKey) {
    setGenLoading(p => ({ ...p, [platformKey]: true }));
    try {
      const r = await callStormAPI(buildGeneratePrompt(platformKey));
      applyGenerationResult(platformKey, r);
      setGenNotice(null);
    } catch (e) {
      handleGenError(e);
    }
    setGenLoading(p => ({ ...p, [platformKey]: false }));
  }

  async function rephraseForPlatform(platformKey) {
    setGenLoading(p => ({ ...p, [platformKey]: true }));
    try {
      const r = await callStormAPI(buildRephrasePrompt(platformKey));
      applyGenerationResult(platformKey, r);
      setGenNotice(null);
    } catch (e) {
      handleGenError(e);
    }
    setGenLoading(p => ({ ...p, [platformKey]: false }));
  }

  // Shared by generate/rephrase: applies the new text and separates out the
  // optional "_contradictionFlags" key (Handoff #22 self-contradiction
  // check) so it never ends up stored as post text. A successful rewrite
  // with no flag clears any earlier flag for this platform.
  function applyGenerationResult(platformKey, r) {
    const { _contradictionFlags, ...textOnly } = r;
    setTexts(p => ({ ...p, ...textOnly }));
    const note = _contradictionFlags && _contradictionFlags[platformKey];
    setContradictionFlags(p => {
      if (!note) {
        if (!(platformKey in p)) return p;
        const next = { ...p };
        delete next[platformKey];
        return next;
      }
      return { ...p, [platformKey]: note };
    });
  }

  function dismissContradiction(platformKey) {
    setContradictionFlags(p => {
      const next = { ...p };
      delete next[platformKey];
      return next;
    });
  }

  function handleGenError(e) {
    if (e.type === "rate_limit_exceeded") {
      setGenNotice({ type: "ratelimit", msg: "🚦 Daily AI limit reached. Your limit resets at midnight UTC." });
    } else if (e.type === "content_flagged") {
      setGenNotice({ type: "flagged", msg: "⚠️ Generation was blocked. Try adjusting the storm's title/summary and try again." });
    } else {
      setGenNotice({ type: "error", msg: "⚠️ Generation failed — check your connection and try again." });
    }
  }

  function toggleLock(platformKey) {
    if (!canLock) return;
    setLocked(p => ({ ...p, [platformKey]: !p[platformKey] }));
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
      const payload = { title, mediaType, media: finalMedia, texts, lockedFields: locked, genParams: post?.genParams || initialGenParams || null };

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
    <>
    <div style={{
      // z-index bumped from 95 to 1000 (July 2026) — see StormPostsPanel.jsx
      // for why: the AppShell header (zIndex:100, including the announcement
      // ticker when active) was rendering on top of this modal's close button.
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
    }} onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 620, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 21, color: TEAL, fontFamily: "var(--font-display)" }}>
            {isEdit ? "Edit Post" : "New Post"}
          </h2>
          <button onClick={() => !saving && onClose()} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>✕</button>
        </div>

        {!isEdit && initialTexts && (
          <div style={{ background: "rgba(62,207,178,0.12)", border: `1.5px solid ${TURQUOISE}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: TEAL }}>
            ⛈️ Platform texts pre-filled from Message Machine — add media to finish this post.
          </div>
        )}

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

        <Field label="Platform Texts" hint="Fill in whichever platforms apply — you don't need all six. Generate drafts from the storm's title/summary, or write your own.">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PLATFORMS.map(p => {
              const limit = CHAR_LIMITS[p.key];
              const count = texts[p.key].length;
              const remaining = limit - count;
              const over = remaining < 0;
              const isLocked = locked[p.key];
              const isLoading = !!genLoading[p.key];
              const contradictionNote = contradictionFlags[p.key];
              return (
                <div key={p.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: CHARCOAL }}>{p.label}</label>
                      {contradictionNote && (
                        <span style={{
                          fontSize: 10.5, fontWeight: 800, color: "#8a6215", background: "#fff3d6",
                          border: "1px solid #e0c568", borderRadius: 999, padding: "2px 8px", letterSpacing: "0.02em",
                        }}>
                          ⚠️ Check this
                        </span>
                      )}
                      {isLocked && (
                        <span style={{
                          fontSize: 10.5, fontWeight: 800, color: "#fff", background: TERRACOTTA,
                          borderRadius: 999, padding: "2px 8px", letterSpacing: "0.02em",
                        }}>
                          🔒 Locked by staff
                        </span>
                      )}
                      {canLock && (
                        <button
                          type="button"
                          onClick={() => toggleLock(p.key)}
                          title={isLocked ? "Unlock this field" : "Lock this field so members can't rephrase it"}
                          style={{
                            background: "none", border: "none", cursor: "pointer", fontSize: 12.5,
                            color: isLocked ? TERRACOTTA : "#aaa", fontWeight: 700, padding: 0,
                          }}
                        >
                          {isLocked ? "Unlock" : "Lock"}
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => setExpandedPlatform(p.key)}
                        title="Expand to read and edit the full text"
                        style={{
                          background: "none", border: `1.5px solid ${BORDER}`, borderRadius: 6,
                          padding: "2px 8px", fontSize: 12, fontWeight: 700, color: CHARCOAL,
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        ⤢ Expand
                      </button>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => texts[p.key].trim() ? rephraseForPlatform(p.key) : generateForPlatform(p.key)}
                          disabled={isLoading}
                          style={{
                            background: "none", border: `1.5px solid ${TURQUOISE}`, borderRadius: 6,
                            padding: "2px 10px", fontSize: 11.5, fontWeight: 700, color: TURQUOISE,
                            cursor: isLoading ? "default" : "pointer", opacity: isLoading ? 0.6 : 1,
                          }}
                        >
                          {isLoading ? "Working…" : texts[p.key].trim() ? "Rephrase" : "Generate"}
                        </button>
                      )}
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: over ? TERRACOTTA : "#999" }}>
                        {over ? remaining : `${count} / ${limit}`}
                      </span>
                    </div>
                  </div>
                  {contradictionNote && (
                    <div style={{
                      background: "#fffaf0", border: "1.5px solid #e0c568", borderRadius: 8,
                      padding: "8px 12px", marginTop: 6, marginBottom: 2, position: "relative",
                    }}>
                      <button
                        onClick={() => dismissContradiction(p.key)}
                        aria-label="Dismiss"
                        style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8a6215", fontWeight: 800 }}
                      >
                        ✕
                      </button>
                      <p style={{ fontSize: 12.5, color: "#6b4f14", lineHeight: 1.5, margin: 0, paddingRight: 18 }}>
                        <strong>Possible self-contradiction:</strong> {contradictionNote} Was this intentional?
                      </p>
                    </div>
                  )}
                  <textarea
                    value={texts[p.key]}
                    onChange={e => !isLocked && setTexts(prev => ({ ...prev, [p.key]: e.target.value }))}
                    readOnly={isLocked}
                    rows={2}
                    style={{
                      ...inputStyle, resize: "vertical", marginTop: 4,
                      borderColor: over ? TERRACOTTA : BORDER,
                      background: isLocked ? SURFACE_ALT : over ? "rgba(193,103,58,0.05)" : "#fff",
                      cursor: isLocked ? "not-allowed" : "text",
                    }}
                    placeholder={`${p.label} post text…`}
                  />
                </div>
              );
            })}
          </div>
        </Field>

        {genNotice && (
          <div style={{
            background: genNotice.type === "ratelimit" ? "#f5f0ff" : genNotice.type === "warning" ? "#fffaf0" : "#fee2e2",
            border: `1.5px solid ${genNotice.type === "ratelimit" ? "#7c3aed" : genNotice.type === "warning" ? "#e0c568" : "#fca5a5"}`,
            borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#444", display: "flex", justifyContent: "space-between", gap: 10,
          }}>
            <span>{genNotice.msg}</span>
            <button onClick={() => setGenNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontWeight: 700 }}>✕</button>
          </div>
        )}

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

    {expandedPlatform && (() => {
      const p = PLATFORMS.find(pp => pp.key === expandedPlatform);
      const limit = CHAR_LIMITS[expandedPlatform];
      const count = texts[expandedPlatform].length;
      const remaining = limit - count;
      const over = remaining < 0;
      const isLocked = locked[expandedPlatform];
      const isLoading = !!genLoading[expandedPlatform];
      const contradictionNote = contradictionFlags[expandedPlatform];
      return (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setExpandedPlatform(null); }}
        >
          <div style={{
            background: "#fff", borderRadius: 14, padding: 24, maxWidth: 640, width: "100%",
            maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 18, color: TEAL, fontFamily: "var(--font-display)" }}>{p.label}</h3>
                {isLocked && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, color: "#fff", background: TERRACOTTA,
                    borderRadius: 999, padding: "2px 8px", letterSpacing: "0.02em",
                  }}>
                    🔒 Locked by staff
                  </span>
                )}
              </div>
              <button onClick={() => setExpandedPlatform(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>✕</button>
            </div>

            {contradictionNote && (
              <div style={{ background: "#fffaf0", border: "1.5px solid #e0c568", borderRadius: 8, padding: "10px 14px", position: "relative" }}>
                <button
                  onClick={() => dismissContradiction(expandedPlatform)}
                  aria-label="Dismiss"
                  style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#8a6215", fontWeight: 800 }}
                >
                  ✕
                </button>
                <p style={{ fontSize: 13, color: "#6b4f14", lineHeight: 1.5, margin: 0, paddingRight: 20 }}>
                  <strong>Possible self-contradiction:</strong> {contradictionNote} Was this intentional?
                </p>
              </div>
            )}

            <textarea
              autoFocus
              value={texts[expandedPlatform]}
              onChange={e => !isLocked && setTexts(prev => ({ ...prev, [expandedPlatform]: e.target.value }))}
              readOnly={isLocked}
              rows={12}
              style={{
                ...inputStyle, resize: "vertical", flex: 1, minHeight: 220, fontSize: 15.5, lineHeight: 1.5,
                borderColor: over ? TERRACOTTA : BORDER,
                background: isLocked ? SURFACE_ALT : over ? "rgba(193,103,58,0.05)" : "#fff",
                cursor: isLocked ? "not-allowed" : "text",
              }}
              placeholder={`${p.label} post text…`}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => texts[expandedPlatform].trim() ? rephraseForPlatform(expandedPlatform) : generateForPlatform(expandedPlatform)}
                    disabled={isLoading}
                    style={{
                      background: "none", border: `1.5px solid ${TURQUOISE}`, borderRadius: 6,
                      padding: "5px 14px", fontSize: 12.5, fontWeight: 700, color: TURQUOISE,
                      cursor: isLoading ? "default" : "pointer", opacity: isLoading ? 0.6 : 1,
                    }}
                  >
                    {isLoading ? "Working…" : texts[expandedPlatform].trim() ? "Rephrase" : "Generate"}
                  </button>
                )}
                {canLock && (
                  <button
                    type="button"
                    onClick={() => toggleLock(expandedPlatform)}
                    style={{
                      background: "none", border: "none", cursor: "pointer", fontSize: 12.5,
                      color: isLocked ? TERRACOTTA : "#aaa", fontWeight: 700, padding: 0,
                    }}
                  >
                    {isLocked ? "Unlock" : "Lock"}
                  </button>
                )}
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: over ? TERRACOTTA : "#999" }}>
                {over ? `${remaining} over` : `${count} / ${limit}`}
              </span>
            </div>

            {genNotice && (
              <div style={{
                background: genNotice.type === "ratelimit" ? "#f5f0ff" : genNotice.type === "warning" ? "#fffaf0" : "#fee2e2",
                border: `1.5px solid ${genNotice.type === "ratelimit" ? "#7c3aed" : genNotice.type === "warning" ? "#e0c568" : "#fca5a5"}`,
                borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "#444", display: "flex", justifyContent: "space-between", gap: 10,
              }}>
                <span>{genNotice.msg}</span>
                <button onClick={() => setGenNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontWeight: 700 }}>✕</button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setExpandedPlatform(null)} style={{
                background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px",
                fontWeight: 800, cursor: "pointer",
              }}>
                Done
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
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
