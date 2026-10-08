import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  useSocialPosting, callSocial, isPostable,
  SOCIAL_PLATFORMS, networkLabel,
  attachmentKind, canAdd, uploadDeviceFile, kindFromFileName, MAX_ATTACHMENTS,
} from "../lib/socialPosting";
import DriveMediaPicker from "./DriveMediaPicker";

// "Send to my accounts" dialog for Message Machine (Oct 2026).
//
// Props:
//   texts           { facebook: "...", twitter: "...", ... } — current
//                   Message Machine text per platform id
// Pictures/videos can be attached from the shared media library (Google Drive,
// referenced by id) or from the user's device (uploaded to their own temporary
// Firebase Storage folder). Instagram and TikTok need media; the server
// re-checks every rule here.
//   initialPlatform platform id whose card the user clicked — preselected
//   onClose
//
// If the subscription isn't active this shows the paywall explanation and a
// link to the Profile page instead of any posting controls. When it flips to
// active (live listener) the controls appear without closing the dialog.
// The server re-checks everything; nothing here is trusted.

const PLUM = "#4A3163";
const TEAL = "#0E7A8C";
const INK = "#362A44";
const CHROME = "#E1E7F0";

const primaryBtn = (disabled) => ({
  background: TEAL, color: "#fff", border: `2px solid ${TEAL}`, borderRadius: 8,
  padding: "10px 18px", fontWeight: 800, fontSize: 14, fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
});
const ghostBtn = {
  background: "#fff", color: TEAL, border: `2px solid ${TEAL}`, borderRadius: 8,
  padding: "10px 18px", fontWeight: 700, fontSize: 14, fontFamily: "inherit", cursor: "pointer",
};

function minLocalDateTime() {
  const d = new Date(Date.now() + 5 * 60000);
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SendToSocialModal({ texts, initialPlatform, onClose }) {
  const { user } = useAuth();
  const { loading, active, status, profilesPaid } = useSocialPosting();

  const [conn, setConn] = useState(null);
  const [connError, setConnError] = useState("");
  const [slot, setSlot] = useState(0);
  const [selected, setSelected] = useState(() => new Set(initialPlatform ? [initialPlatform] : []));
  const [mode, setMode] = useState("now"); // "now" | "later"
  const [when, setWhen] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [attachments, setAttachments] = useState([]); // {source,id|url,name,kind,thumb?}
  const [showLibrary, setShowLibrary] = useState(false);
  const [uploading, setUploading] = useState(null);   // {name, pct}
  const [mediaError, setMediaError] = useState("");
  const fileInput = useRef(null);

  // Escape closes.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  // Which networks are connected on each profile.
  useEffect(() => {
    if (!active || !user) return;
    let cancelled = false;
    callSocial("social-connect", user, { action: "status" })
      .then((d) => {
        if (cancelled) return;
        setConn(d);
        // Start on the first profile that has anything connected.
        const first = d.profiles?.find((p) => p.connected.length > 0);
        if (first) setSlot(first.slot);
      })
      .catch((e) => { if (!cancelled) setConnError(e.message); });
    return () => { cancelled = true; };
  }, [active, user, profilesPaid]);

  const connectedHere = useMemo(
    () => conn?.profiles?.find((p) => p.slot === slot)?.connected || [],
    [conn, slot],
  );

  const platformIds = Object.keys(SOCIAL_PLATFORMS).filter((id) => typeof texts?.[id] === "string" && texts[id].trim());
  const kind = attachmentKind(attachments); // "text" | "image" | "video" | "mixed"
  const takesKind = (id) => SOCIAL_PLATFORMS[id].caps.includes(kind);
  const canPostTo = (id) => isPostable(id, connectedHere) && takesKind(id);
  const chosen = platformIds.filter((id) => selected.has(id) && canPostTo(id));
  const overLimit = chosen.filter((id) => texts[id].trim().length > SOCIAL_PLATFORMS[id].maxChars);
  const igNonJpeg = chosen.includes("instagram") && attachments.some((a) => /\.(png|webp)$/i.test(a.name || ""));
  const xHasLink = chosen.includes("twitter") && /https?:\/\/|www\./i.test(texts.twitter || "");
  const whenOk = mode === "now" || (when && new Date(when).getTime() > Date.now() + 60000);
  const canSend = chosen.length > 0 && overLimit.length === 0 && whenOk && !sending && !uploading;

  function addAttachment(a) {
    setConfirming(false);
    setAttachments((prev) => [...prev, a]);
  }
  function removeAttachment(i) {
    setConfirming(false);
    setAttachments((prev) => prev.filter((_, j) => j !== i));
  }
  async function onFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    setMediaError("");
    let current = attachments;
    for (const file of picked) {
      const k = kindFromFileName(file.name);
      const why = k ? canAdd(current, k) : "";
      if (why) { setMediaError(why); break; }
      try {
        setUploading({ name: file.name, pct: 0 });
        const a = await uploadDeviceFile(file, user.uid, (pct) => setUploading({ name: file.name, pct }));
        current = [...current, a];
        addAttachment(a);
      } catch (err) { setMediaError(err.message); break; }
    }
    setUploading(null);
  }

  function toggle(id) {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function send() {
    setSending(true);
    setError("");
    try {
      const payload = {
        slot,
        platforms: chosen,
        texts: Object.fromEntries(chosen.map((id) => [id, texts[id].trim()])),
      };
      if (attachments.length) {
        payload.attachments = attachments.map((a) => a.source === "drive"
          ? { source: "drive", id: a.id, name: a.name, folderId: a.folderId }
          : { source: "upload", url: a.url, name: a.name });
      }
      if (mode === "later") {
        payload.scheduledDate = new Date(when).toISOString();
        payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      }
      const r = await callSocial("social-publish", user, payload);
      setResult({ scheduled: !!r.scheduled, count: chosen.length, processing: !!r.processing });
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    }
    setSending(false);
  }

  const names = (ids) => ids.map((id) => SOCIAL_PLATFORMS[id].label).join(", ");

  return (
    <div role="dialog" aria-modal="true" aria-label="Send to my accounts"
      style={{ position: "fixed", inset: 0, background: "rgba(54,42,68,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px 26px", color: INK, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: PLUM }}>Send to my accounts</h2>
          <button onClick={onClose} aria-label="Close" disabled={sending}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888", lineHeight: 1 }}>✕</button>
        </div>

        {loading && <p style={{ color: "#888" }}>Loading…</p>}

        {/* ── locked ── */}
        {!loading && !active && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 15, lineHeight: 1.6 }}>
              {status === "past_due"
                ? "Posting is paused because your last payment didn't go through. Update your card on your Profile page and it unlocks again automatically."
                : "Posting straight to your accounts is a $5 per profile per month add-on. Subscribe on your Profile page and it unlocks here automatically — no waiting for approval."}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Link to="/profile" onClick={onClose} style={{ ...primaryBtn(false), textDecoration: "none", display: "inline-block" }}>Go to Profile</Link>
              <button style={ghostBtn} onClick={onClose}>Not now</button>
            </div>
            <p style={{ fontSize: 12.5, color: "#888", marginTop: 14 }}>You can still use <strong>Copy Text</strong> on each post.</p>
          </div>
        )}

        {/* ── done ── */}
        {active && result && (
          <div style={{ marginTop: 14 }}>
            <div style={{ background: "#eef7f9", border: "1px solid #b9dde3", borderRadius: 10, padding: "14px 16px", fontSize: 15, lineHeight: 1.6 }}>
              {result.scheduled
                ? `✓ Scheduled for ${new Date(when).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`
                : result.processing ? "✓ Sent — your video is being processed and will appear shortly." : "✓ Sent."}{" "}
              {result.count} network{result.count > 1 ? "s" : ""}.
            </div>
            <button style={{ ...primaryBtn(false), marginTop: 16 }} onClick={onClose}>Done</button>
          </div>
        )}

        {/* ── compose ── */}
        {active && !result && (
          <div style={{ marginTop: 12 }}>
            {connError && <div style={{ color: "#c41e1e", fontSize: 13, marginBottom: 10 }}>{connError}</div>}
            {!conn && !connError && <p style={{ color: "#888", fontSize: 14 }}>Checking your connected accounts…</p>}

            {conn && conn.profiles.every((p) => p.connected.length === 0) && (
              <div style={{ background: "#fff7ed", border: "1px solid #f5c842", borderRadius: 10, padding: "12px 14px", fontSize: 14, lineHeight: 1.6 }}>
                You haven't connected any accounts yet. <Link to="/profile" onClick={onClose} style={{ color: TEAL, fontWeight: 800 }}>Connect them on your Profile page</Link>, then come back.
              </div>
            )}

            {conn && conn.profiles.some((p) => p.connected.length > 0) && (
              <>
                {conn.profiles.length > 1 && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#777" }}>Post from</label>
                    <select value={slot} onChange={(e) => { setSlot(Number(e.target.value)); setConfirming(false); }}
                      style={{ display: "block", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${CHROME}`, fontFamily: "inherit", fontSize: 14 }}>
                      {conn.profiles.map((p) => (
                        <option key={p.slot} value={p.slot}>
                          Profile {p.slot + 1} — {p.connected.length ? p.connected.map(networkLabel).join(", ") : "nothing connected"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#777", marginBottom: 8 }}>Pictures or video (optional)</div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={{ ...ghostBtn, padding: "7px 12px", fontSize: 13 }} disabled={!!uploading}
                      onClick={() => { setShowLibrary((v) => !v); setMediaError(""); }}>From media library</button>
                    <button type="button" style={{ ...ghostBtn, padding: "7px 12px", fontSize: 13 }} disabled={!!uploading}
                      onClick={() => fileInput.current?.click()}>From my device</button>
                    <input ref={fileInput} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                      onChange={onFiles} style={{ display: "none" }} aria-label="Choose files from your device" />
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 6, lineHeight: 1.5 }}>
                    Up to {MAX_ATTACHMENTS} pictures (JPG, PNG, WebP) or one video (MP4, MOV, WebM). Instagram and TikTok need media; TikTok takes video only.
                  </div>
                  {showLibrary && (
                    <DriveMediaPicker
                      onClose={() => setShowLibrary(false)}
                      canPick={(k) => canAdd(attachments, k)}
                      onPick={(f) => { setMediaError(""); addAttachment({ source: "drive", id: f.id, name: f.name, kind: f.kind, thumb: f.thumb, folderId: f.folderId }); if (f.kind === "video") setShowLibrary(false); }} />
                  )}
                  {uploading && (
                    <div role="status" style={{ fontSize: 13, marginTop: 8 }}>Uploading {uploading.name}… {Math.round(uploading.pct * 100)}%</div>
                  )}
                  {mediaError && <div role="alert" style={{ color: "#c41e1e", fontSize: 13, marginTop: 8 }}>{mediaError}</div>}
                  {attachments.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {attachments.map((a, i) => (
                        <span key={`${a.id || a.url}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: CHROME, borderRadius: 8, padding: "5px 8px", fontSize: 12.5, maxWidth: "100%" }}>
                          <span aria-hidden>{a.kind === "video" ? "🎬" : "🖼"}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{a.name}</span>
                          <button type="button" aria-label={`Remove ${a.name}`} onClick={() => removeAttachment(i)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#777", fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  {kind === "video" && (
                    <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>Videos are processed in the background, so they can take a few minutes to appear after you post.</div>
                  )}
                  {igNonJpeg && (
                    <div style={{ background: "#fff7ed", border: "1px solid #f5c842", color: "#7a4f00", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
                      Instagram can be picky about PNG/WebP pictures. If the post fails, use a JPG.
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#777", marginBottom: 8 }}>Networks</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {platformIds.map((id) => {
                    const cfg = SOCIAL_PLATFORMS[id];
                    const connectedOk = isPostable(id, connectedHere);
                    const kindOk = takesKind(id);
                    const ok = connectedOk && kindOk;
                    const len = texts[id].trim().length;
                    const over = len > cfg.maxChars;
                    return (
                      <label key={id} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: `1.5px solid ${selected.has(id) && ok ? TEAL : CHROME}`, borderRadius: 10, padding: "10px 12px", opacity: ok ? 1 : 0.55, cursor: ok ? "pointer" : "not-allowed" }}>
                        <input type="checkbox" disabled={!ok} checked={selected.has(id) && ok} onChange={() => toggle(id)} style={{ marginTop: 3 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 800, fontSize: 14 }}>
                            <span>{cfg.label}{!connectedOk && <span style={{ fontWeight: 600, color: "#999" }}> — not connected on this profile</span>}
                              {connectedOk && !kindOk && <span style={{ fontWeight: 600, color: "#999" }}> — {cfg.caps.length === 1 ? "video only" : "needs a picture or video"}{kind === "mixed" ? "" : ""}</span>}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 12, color: over ? "#c41e1e" : "#888" }}>{len.toLocaleString()} / {cfg.maxChars.toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: 13, color: "#555", marginTop: 4, whiteSpace: "pre-wrap", maxHeight: 64, overflow: "hidden" }}>
                            {texts[id].trim().slice(0, 220)}{texts[id].trim().length > 220 ? "…" : ""}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {overLimit.length > 0 && (
                  <div style={{ color: "#c41e1e", fontSize: 13, marginTop: 10 }}>
                    {names(overLimit)} {overLimit.length > 1 ? "are" : "is"} over the character limit — shorten it in Message Machine first.
                  </div>
                )}
                {xHasLink && (
                  <div style={{ background: "#fff7ed", border: "1px solid #f5c842", color: "#7a4f00", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
                    Heads up: X's API charges extra for posts with links, so links in X posts may be removed unless the link add-on is enabled on the posting account.
                  </div>
                )}

                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14, fontWeight: 700 }}>
                    <label><input type="radio" name="when" checked={mode === "now"} onChange={() => { setMode("now"); setConfirming(false); }} /> Post now</label>
                    <label><input type="radio" name="when" checked={mode === "later"} onChange={() => { setMode("later"); setConfirming(false); }} /> Schedule</label>
                  </div>
                  {mode === "later" && (
                    <div style={{ marginTop: 10 }}>
                      <input type="datetime-local" value={when} min={minLocalDateTime()} onChange={(e) => { setWhen(e.target.value); setConfirming(false); }}
                        style={{ padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${CHROME}`, fontFamily: "inherit", fontSize: 14 }} />
                      <span style={{ fontSize: 12, color: "#888", marginLeft: 10 }}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                    </div>
                  )}
                </div>

                {error && <div role="alert" style={{ background: "#fdf2f2", border: "1px solid #f5c6c6", color: "#c41e1e", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>{error}</div>}

                <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", alignItems: "center" }}>
                  {!confirming ? (
                    <button style={primaryBtn(!canSend)} disabled={!canSend} onClick={() => { setError(""); setConfirming(true); }}>
                      {mode === "now" ? "Review & post" : "Review & schedule"}
                    </button>
                  ) : (
                    <>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                        {mode === "now" ? "Publish right now to" : "Schedule for the chosen time on"} {names(chosen)}?
                      </span>
                      <button style={primaryBtn(sending)} disabled={sending} onClick={send}>{sending ? "Sending…" : "Yes, confirm"}</button>
                      <button style={ghostBtn} disabled={sending} onClick={() => setConfirming(false)}>Back</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
