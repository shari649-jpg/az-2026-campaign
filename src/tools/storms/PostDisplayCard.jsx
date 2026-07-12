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
// authenticated app or the public page.

import { useState } from "react";
import { zipSync } from "fflate";
import { MEDIA_TYPES, PLATFORMS } from "../../lib/stormLibrary";

const TEAL       = "#1D5C4A";
const CHARCOAL   = "#4A4558";
const TURQUOISE  = "#3ECFB2";
const BORDER     = "#C8C4BC";
const SURFACE_ALT = "#F3F4F0";

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

export default function PostDisplayCard({ post, hashtag }) {
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

      <button onClick={handleDownload} disabled={downloading || selectedCount === 0} style={{
        background: selectedCount === 0 ? "#ddd" : TEAL, color: "#fff", border: "none", borderRadius: 8,
        padding: "9px 18px", fontWeight: 800, fontSize: 13.5, cursor: selectedCount === 0 ? "default" : "pointer", marginBottom: 16,
      }}>
        {downloadLabel}
      </button>

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
                  boxShadow: isOpen ? `0 0 0 3px ${TEAL}33` : "none",
                  padding: 0, cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <PlatformIcon platformKey={p.key} badge={p.badge} />
              </button>
            );
          })}
        </div>
      )}

      {openPlatformData && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, background: SURFACE_ALT, borderRadius: 8, padding: "10px 12px", marginTop: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: TEAL, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{openPlatformData.label}</div>
            <div style={{ fontSize: 13.5, color: "#333", whiteSpace: "pre-wrap" }}>{post.texts[openPlatformData.key]}</div>
          </div>
          <button onClick={() => handleCopy(openPlatformData.key, post.texts[openPlatformData.key])} style={{
            flexShrink: 0, background: copiedKey === openPlatformData.key ? TURQUOISE : "#fff", color: copiedKey === openPlatformData.key ? "#fff" : TEAL,
            border: `1.5px solid ${TEAL}`, borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            {copiedKey === openPlatformData.key ? "Copied ✓" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
