// src/tools/storms/PostDisplayCard.jsx
//
// Renders a single storm post for viewing/copying/downloading — media up
// top, then a row of platform icons (only for platforms with actual text),
// tap one to expand just that platform's text with a Copy button. Only one
// platform open at a time, so this never piles back into the old layout
// where every platform's full text rendered stacked open simultaneously.
//
// Extracted July 2026 (item 5) from StormsHubPage.jsx's UserPostCard, so
// the public storm page (no login, view/copy/download only) and the
// internal "User View" share exactly one implementation instead of two
// that could drift out of sync. Purely presentational — takes `post` and
// `hashtag` and has no idea whether it's being rendered inside the
// authenticated app or the public page... except for one deliberate
// exception added here (Handoff #19/#22): the "🔁 Regenerate" button
// needs to know which of two very different backends to call, so the
// caller now also passes `storm` (full object, member context only) and
// `isPublic`/`publicToken` (public-page context only). Regeneration is
// always ephemeral — it only ever changes what's shown locally in this
// component; `post.texts` in Firestore is never touched.

import { useState } from "react";
import { zipSync } from "fflate";
import { MEDIA_TYPES, PLATFORMS, CHAR_LIMITS, formatGenParams } from "../../lib/stormLibrary";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../lib/guardrails";
import { auth } from "../../firebase";

const TEAL       = "var(--teal)";
const CHARCOAL   = "var(--charcoal)";
const TURQUOISE  = "var(--turquoise)";
const BORDER     = "var(--border)";
const SURFACE_ALT = "var(--surface-alt)";

const linkBtnStyle = { background: "none", border: "none", color: TEAL, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" };

// Real brand icons for the platform toggle row. Files live in /public (same
// convention as azc-logo.png) and are downloaded once from simpleicons.org
// (CC0-licensed, so no attribution/trademark concern) rather than bundled
// as an npm dependency. Keyed by PLATFORMS' `key` (not always the same as
// the filename — the "twitter" key maps to the "x" icon file, matching the
// platform's current name/branding).
const SOCIAL_ICON_PATHS = {
  facebook:  "/social-facebook.svg",
  instagram: "/social-instagram.svg",
  twitter:   "/social-x.svg",
  threads:   "/social-threads.svg",
  tiktok:    "/social-tiktok.svg",
  bluesky:   "/social-bluesky.svg",
};

// Renders the real icon file if it loads; if it's missing, misnamed, or
// hasn't been added to /public yet, falls back to the plain text badge
// (PLATFORMS' `badge` field) instead of a broken image — so this is safe
// to deploy at any point, before or after the icon files actually exist.
function PlatformIcon({ platformKey, badge }) {
  const [failed, setFailed] = useState(false);
  const src = SOCIAL_ICON_PATHS[platformKey];
  if (failed || !src) {
    return <span style={{ fontSize: 11, fontWeight: 800, color: TEAL, letterSpacing: "0.01em" }}>{badge}</span>;
  }
  return (
    <img
      src={src}
      alt={badge}
      onError={() => setFailed(true)}
      style={{ width: 22, height: 22, display: "block" }}
    />
  );
}

export default function PostDisplayCard({ post, hashtag, storm, isPublic, publicToken }) {
  const isGraphicSet = post.mediaType === MEDIA_TYPES.GRAPHIC && (post.media?.length || 0) > 1;
  const [selected, setSelected] = useState(() => new Set((post.media || []).map((_, i) => i)));
  const [downloading, setDownloading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  // Which platform's text is currently expanded, if any — only one open at
  // a time. Replaces the old layout where every platform's full text
  // rendered stacked open simultaneously, which made a storm with several
  // posts an enormous scroll, especially on mobile, even for someone who
  // only cares about one platform.
  const [openPlatform, setOpenPlatform] = useState(null);

  // ── Regenerate (Handoff #19/#22) — always ephemeral, never saved ──────
  const [regenTexts, setRegenTexts] = useState({}); // { [platformKey]: "alternate text" } — local-only
  const [regenLoading, setRegenLoading] = useState(null); // platformKey currently regenerating, or null
  const [regenNotice, setRegenNotice] = useState(null); // { type: "ratelimit"|"disabled"|"error", msg } — persists until dismissed, since a tripped breaker should stay visible

  function toggle(i) { setSelected(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; }); }
  function selectAll() { setSelected(new Set((post.media || []).map((_, i) => i))); }
  function selectNone() { setSelected(new Set()); }

  async function handleDownload() {
    const items = (post.media || []).filter((_, i) => selected.has(i));
    if (items.length === 0) return;
    setDownloading(true);
    try {
      if (items.length === 1) {
        await downloadSingle(items[0]);
      } else {
        const filesForZip = {};
        for (const item of items) {
          const res = await fetch(item.url);
          filesForZip[item.name || item.path.split("/").pop()] = new Uint8Array(await res.arrayBuffer());
        }
        const zipped = zipSync(filesForZip);
        triggerDownload(new Blob([zipped], { type: "application/zip" }), `${(post.title || "storm-post").replace(/\s+/g, "_")}.zip`);
      }
    } catch (e) {
      alert("Download failed — please check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadSingle(item) {
    const res = await fetch(item.url);
    triggerDownload(await res.blob(), item.name || item.path.split("/").pop());
  }
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function handleCopy(platformKey, text) {
    navigator.clipboard.writeText(hashtag ? `${text}\n\n#${hashtag}` : text);
    setCopiedKey(platformKey);
    setTimeout(() => setCopiedKey(null), 1800);
  }
  function togglePlatform(key) {
    setOpenPlatform(prev => prev === key ? null : key);
  }

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

  // Member path — mirrors StormPostEditor.jsx's buildRephrasePrompt exactly,
  // since this is the same authenticated tool, just reached from a
  // read-only card instead of the edit modal. Calls the same
  // generate-storm-text.mjs function (server-side guardrail enforcement
  // already covers this path).
  async function regenerateAsMember(platformKey) {
    const platform = PLATFORMS.find(p => p.key === platformKey);
    const limit = CHAR_LIMITS[platformKey];
    const currentText = post.texts[platformKey];
    const prompt = `You are an expert political messaging strategist rewriting an existing storm post.

${FACTUAL_ACCURACY_GUARDRAIL}

${stormContextBlock()}

CURRENT ${platform?.label} MESSAGE (${currentText.length} characters, max ${limit}):
${currentText}

INSTRUCTION: Rephrase this message. Keep the same length, meaning, and platform style, but use different wording, sentence structure, and framing. Do not add new facts, names, or figures beyond what's already here.

YOU MUST RESPOND ONLY WITH VALID JSON. No markdown. No backticks. No explanation. No refusal text. Only a JSON object.
Format: {"${platformKey}": "rewritten post text"}`;

    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    const res = await fetch("/.netlify/functions/generate-storm-text", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}) },
      body: JSON.stringify({ max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });
    if (res.status === 429) { const err = new Error("rate_limit"); err.type = "ratelimit"; throw err; }
    const data = await res.json();
    if (data.error) throw new Error("generation_failed");
    const text = data.content.map(b => b.text || "").join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    if (!cleaned.startsWith("{")) throw new Error("generation_failed");
    const parsed = JSON.parse(cleaned);
    return parsed[platformKey] || "";
  }

  // Public path — a separate, tightly-scoped function; the entire prompt
  // is built server-side from stored data, never from anything this
  // client sends. See public-storm-regenerate.mjs.
  async function regenerateAsPublic(platformKey) {
    const res = await fetch("/.netlify/functions/public-storm-regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: publicToken, postId: post.id, platformKey }),
    });
    const data = await res.json();
    if (res.status === 429) { const err = new Error("rate_limit"); err.type = "ratelimit"; throw err; }
    if (data.error === "disabled") { const err = new Error("disabled"); err.type = "disabled"; throw err; }
    if (data.error === "locked") { const err = new Error("locked"); err.type = "locked"; throw err; }
    if (!data.ok) throw new Error("generation_failed");
    return data.text || "";
  }

  async function handleRegenerate(platformKey) {
    // Client-side guard, both paths — the button below is hidden whenever
    // a platform is locked, so this shouldn't be reachable, but it's cheap
    // insurance against any stale-render edge case. This mirrors
    // StormPostEditor.jsx's own client-side-only lock enforcement for its
    // Rephrase button — generate-storm-text.mjs (the member path's
    // backend) is a deliberately generic prompt-forwarding function with
    // no postId/lock awareness at all, shared with generate-sandbox-text.mjs,
    // so lock enforcement for the member path lives here, not server-side.
    // The public path is different: public-storm-regenerate.mjs enforces
    // this server-side too, since that caller has no authenticated session
    // to already be trusted the way a signed-in member is.
    if (post.lockedFields?.[platformKey]) return;
    setRegenLoading(platformKey);
    try {
      const text = isPublic ? await regenerateAsPublic(platformKey) : await regenerateAsMember(platformKey);
      setRegenTexts(prev => ({ ...prev, [platformKey]: text }));
      setRegenNotice(null);
    } catch (e) {
      if (e.type === "ratelimit") {
        setRegenNotice({ type: "ratelimit", msg: "🚦 Regenerate limit reached for now — resets at midnight UTC." });
      } else if (e.type === "disabled") {
        setRegenNotice({ type: "disabled", msg: "Regenerate is temporarily turned off by staff. Try again later." });
      } else if (e.type === "locked") {
        setRegenNotice({ type: "disabled", msg: "🔒 This platform's wording is locked by staff and can't be regenerated." });
      } else {
        setRegenNotice({ type: "error", msg: "⚠️ Couldn't regenerate — please try again." });
      }
    }
    setRegenLoading(null);
  }

  function revertRegenerated(platformKey) {
    setRegenTexts(prev => { const next = { ...prev }; delete next[platformKey]; return next; });
  }

  // Only platforms with actual text get an icon at all — an empty
  // platform never appears.
  const activePlatforms = PLATFORMS.filter(p => post.texts?.[p.key]?.trim());
  const openPlatformData = activePlatforms.find(p => p.key === openPlatform) || null;

  const selectedCount = selected.size;
  const downloadLabel = downloading ? "Preparing…" : selectedCount === 0 ? "Select media to download" : selectedCount === 1 ? "⬇ Download" : `⬇ Download ${selectedCount} as .zip`;

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
      {post.title && <div style={{ fontWeight: 700, color: CHARCOAL, fontSize: 15, marginBottom: 10 }}>{post.title}</div>}

      {post.mediaType === MEDIA_TYPES.VIDEO ? (
        post.media?.[0] && <video src={post.media[0].url} controls style={{ width: "100%", maxWidth: 320, borderRadius: 8, marginBottom: 12, display: "block" }} />
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: isGraphicSet ? 8 : 12 }}>
            {(post.media || []).map((m, i) => (
              <label key={m.path} style={{ position: "relative", cursor: "pointer" }}>
                <img src={m.url} alt="" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, border: `2px solid ${selected.has(i) ? TURQUOISE : "transparent"}`, opacity: selected.has(i) ? 1 : 0.45, transition: "all 0.15s" }} />
                {isGraphicSet && <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, accentColor: TEAL, cursor: "pointer" }} />}
              </label>
            ))}
          </div>
          {isGraphicSet && (
            <div style={{ display: "flex", gap: 12, marginBottom: 12, fontSize: 12.5 }}>
              <button onClick={selectAll} style={linkBtnStyle}>Select All</button>
              <button onClick={selectNone} style={linkBtnStyle}>Deselect All</button>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={handleDownload} disabled={downloading || selectedCount === 0} style={{
          background: selectedCount === 0 ? "#ddd" : TEAL, color: "#fff", border: "none", borderRadius: 8,
          padding: "9px 18px", fontWeight: 800, fontSize: 13.5, cursor: selectedCount === 0 ? "default" : "pointer",
        }}>
          {downloadLabel}
        </button>
        {formatGenParams(post.genParams) && (
          <span style={{ fontSize: 11.5, color: "#888", lineHeight: 1.3 }}>
            {formatGenParams(post.genParams)}
          </span>
        )}
      </div>

      {/* Platform icons — tap one to expand just that platform's text below.
          Tap the same one again (or a different one) to switch/close.
          Only one open at a time, so this never piles back up into the
          old wall-of-text layout. */}
      {activePlatforms.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {activePlatforms.map(p => {
            const isOpen = openPlatform === p.key;
            return (
              <button
                key={p.key}
                onClick={() => togglePlatform(p.key)}
                title={p.label}
                aria-label={p.label}
                aria-pressed={isOpen}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${isOpen ? TEAL : BORDER}`,
                  // Background stays white regardless of open/closed state —
                  // a real brand-colored logo (unlike a recolored badge)
                  // shouldn't have to fight a colored circle behind it.
                  // Open state is shown with a soft ring instead.
                  background: "#fff",
                  boxShadow: isOpen ? "0 0 0 3px rgba(14, 122, 140, 0.2)" : "none", // ocean teal at 20% alpha — a CSS var can't take a hex alpha suffix
                  padding: 0, cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <PlatformIcon platformKey={p.key} badge={p.badge} />
              </button>
            );
          })}
        </div>
      )}

      {openPlatformData && (() => {
        const key = openPlatformData.key;
        const regenText = regenTexts[key];
        const isRegenLoading = regenLoading === key;
        const displayedText = regenText ?? post.texts[key];
        // Lock check — now applies to BOTH contexts. Public: lockedFields
        // is only sent to the client via public-storm.mjs (Aug 2026 fix),
        // matching public-storm-regenerate.mjs's own server-side check.
        // Member/User View: post.lockedFields is already present in the
        // authenticated fetch this component receives regardless (no
        // gating needed there), and handleRegenerate above adds the
        // matching client-side guard for this path — see its comment for
        // why member-path enforcement lives client-side, not server-side.
        const isLocked = !!post.lockedFields?.[key];
        return (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, background: regenText ? "#fffaf0" : SURFACE_ALT, border: regenText ? `1.5px solid #e0c568` : "none", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: TEAL, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                  {openPlatformData.label}{regenText && <span style={{ color: "#8a6215", marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>· 🔁 alternate version (not saved)</span>}
                </div>
                <div style={{ fontSize: 13.5, color: "#333", whiteSpace: "pre-wrap" }}>{displayedText}</div>
              </div>
              <button onClick={() => handleCopy(key, displayedText)} style={{
                flexShrink: 0, background: copiedKey === key ? TURQUOISE : "#fff", color: copiedKey === key ? "#fff" : TEAL,
                border: `1.5px solid ${TEAL}`, borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>
                {copiedKey === key ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
              {isLocked ? (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#8a6215", background: "#fff3d6",
                  border: "1px solid #e0c568", borderRadius: 999, padding: "2px 8px", letterSpacing: "0.02em",
                }}>
                  🔒 Locked by staff
                </span>
              ) : (
                <button
                  onClick={() => handleRegenerate(key)}
                  disabled={isRegenLoading || regenNotice?.type === "ratelimit" || regenNotice?.type === "disabled"}
                  style={{
                    background: "none", border: `1.5px solid ${TURQUOISE}`, borderRadius: 6, padding: "3px 10px",
                    fontSize: 11.5, fontWeight: 700, color: TURQUOISE,
                    cursor: (isRegenLoading || regenNotice?.type === "ratelimit" || regenNotice?.type === "disabled") ? "default" : "pointer",
                    opacity: (isRegenLoading || regenNotice?.type === "ratelimit" || regenNotice?.type === "disabled") ? 0.55 : 1,
                  }}
                >
                  {isRegenLoading ? "Regenerating…" : "🔁 Regenerate"}
                </button>
              )}
              {regenText && (
                <button onClick={() => revertRegenerated(key)} style={{ background: "none", border: "none", color: "#888", fontSize: 11.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                  Revert to original
                </button>
              )}
            </div>
            {regenNotice && (
              <div style={{
                marginTop: 8, fontSize: 12, color: regenNotice.type === "error" ? "#991b1b" : "#8a6215",
                background: regenNotice.type === "error" ? "#fee2e2" : "#fff3d6",
                border: `1px solid ${regenNotice.type === "error" ? "#fca5a5" : "#e0c568"}`,
                borderRadius: 7, padding: "6px 10px", display: "flex", justifyContent: "space-between", gap: 8,
              }}>
                <span>{regenNotice.msg}</span>
                <button onClick={() => setRegenNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 800 }}>✕</button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
