import { useState, useEffect, useCallback } from "react";
import { auth } from "../firebase";

// Media-library picker for the "Send to my accounts" dialog (Oct 2026).
// Browses the same shared Google Drive library as the Media tool (via
// browse-drive) and lets the user pick pictures/videos to attach.
//
// Props: onPick(file) — file = { id, name, kind: "image"|"video", thumb, folderId }
//        canPick(kind) → "" if allowed, otherwise a message to show
//        onClose
// GIFs are shown but can't be selected (social networks don't take them here).
// Library videos over ~95 MB are shown but disabled — Drive can't hand those to
// the posting service reliably; the user is told to upload from their device.

const ROOT = { id: "1Kt2ytgpZEy8NWPfuuY6j9M6QZuHVelw_", name: "Media" }; // keep in sync with FileBrowser.jsx / browse-drive.mjs
const MAX_DRIVE_VIDEO = 95 * 1024 * 1024;
const TEAL = "#0E7A8C", PLUM = "#4A3163", CHROME = "#E1E7F0";

export default function DriveMediaPicker({ onPick, canPick, onClose }) {
  const [stack, setStack] = useState([ROOT]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async (folderId) => {
    setLoading(true); setError(""); setNote(""); setFolders([]); setFiles([]);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const headers = { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) };
      const post = (mode) => fetch("/.netlify/functions/browse-drive", { method: "POST", headers, body: JSON.stringify({ mode, folderId }) }).then((r) => r.json());
      const [f, m] = await Promise.all([post("folders"), post("files")]);
      if (f.success) setFolders(f.folders || []);
      if (m.success) setFiles((m.files || []).filter((x) => x.type === "image" || x.type === "gif" || x.type === "video"));
      if (!f.success && !m.success) setError("Couldn't load this folder. Please try again.");
    } catch { setError("Connection error — please try again."); }
    setLoading(false);
  }, []);

  useEffect(() => { load(ROOT.id); }, [load]);

  const open = (folder) => { setStack((s) => [...s, folder]); load(folder.id); };
  const back = (i) => { const next = stack.slice(0, i + 1); setStack(next); load(next[next.length - 1].id); };

  function choose(f) {
    if (f.type === "gif") { setNote("GIFs can't be posted here. Use a JPG, PNG or WebP picture, or an MP4 video."); return; }
    const kind = f.type === "video" ? "video" : "image";
    if (kind === "video" && Number(f.size) > MAX_DRIVE_VIDEO) {
      setNote("That video is too large to send from the library (over 95 MB). Download it and use “From my device” instead."); return;
    }
    const why = canPick(kind);
    if (why) { setNote(why); return; }
    setNote("");
    onPick({ id: f.id, name: f.name, kind, thumb: f.thumbnailLink || "", folderId: stack[stack.length - 1].id });
  }

  return (
    <div style={{ border: `1.5px solid ${CHROME}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: PLUM, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {stack.map((s, i) => (
            <span key={s.id}>
              {i > 0 && " / "}
              {i < stack.length - 1
                ? <button type="button" onClick={() => back(i)} style={{ background: "none", border: "none", color: TEAL, cursor: "pointer", fontWeight: 700, fontFamily: "inherit", padding: 0 }}>{s.name}</button>
                : s.name}
            </span>
          ))}
        </div>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Close</button>
      </div>

      {loading && <div style={{ fontSize: 13, color: "#888" }}>Loading…</div>}
      {error && <div style={{ fontSize: 13, color: "#c41e1e" }}>{error}</div>}
      {note && <div role="status" style={{ fontSize: 12.5, color: "#7a4f00", background: "#fff7ed", border: "1px solid #f5c842", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>{note}</div>}

      {folders.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {folders.map((f) => (
            <button key={f.id} type="button" onClick={() => open({ id: f.id, name: f.name })}
              style={{ background: CHROME, border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontWeight: 700, color: PLUM, cursor: "pointer", fontFamily: "inherit" }}>
              📁 {f.name}
            </button>
          ))}
        </div>
      )}

      {!loading && !error && files.length === 0 && folders.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>Nothing here.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 8, maxHeight: 260, overflowY: "auto" }}>
        {files.map((f) => (
          <button key={f.id} type="button" onClick={() => choose(f)} title={f.name}
            style={{ border: `1.5px solid ${CHROME}`, borderRadius: 8, background: "#fff", padding: 0, cursor: "pointer", overflow: "hidden", textAlign: "left", fontFamily: "inherit", opacity: f.type === "gif" ? 0.45 : 1 }}>
            <div style={{ height: 70, background: CHROME, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              {f.thumbnailLink ? <img src={f.thumbnailLink} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (f.type === "video" ? "🎬" : "🖼")}
            </div>
            <div style={{ fontSize: 11, padding: "4px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {f.type === "video" ? "▶ " : ""}{f.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
