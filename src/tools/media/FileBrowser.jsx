import { useState, useEffect, useCallback } from "react";

const B = {
  teal:       "#1D5C4A",
  tealDark:   "#164437",
  tealLight:  "#e8f4f0",
  gold:       "#F5C842",
  goldDark:   "#c9a000",
  turquoise:  "#3ECFB2",
  charcoal:   "#4A4558",
  terracotta: "#C1673A",
  bg:         "#ffffff",
  surface:    "#ffffff",
  surfaceAlt: "#f3f4f0",
  border:     "#C8C4BC",
  borderStrong:"#1D5C4A",
  text:       "#1A1A1A",
  textMid:    "#4A4558",
  textMute:   "#888580",
  red:        "#c41e1e",
};

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeTag({ type }) {
  const styles = {
    image: { bg: B.tealLight, color: B.teal, label: "IMAGE" },
    video: { bg: "#fff3e0", color: "#c1673a", label: "VIDEO" },
    gif:   { bg: "#f0f0ff", color: "#5c35cc", label: "GIF" },
  };
  const s = styles[type] || styles.image;
  return (
    <span style={{
      fontSize: 10, fontWeight: 900, letterSpacing: "0.1em",
      padding: "2px 7px", borderRadius: 4,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  );
}

// Lightbox for image/gif preview
function Lightbox({ file, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.88)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: "100%", position: "relative" }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: -44, right: 0,
            background: "none", border: "none", color: "#fff",
            fontSize: 32, cursor: "pointer", lineHeight: 1, fontFamily: "inherit",
          }}
        >✕</button>
        <img
          src={file.viewUrl}
          alt={file.name}
          style={{ width: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 8, display: "block" }}
        />
        <div style={{
          marginTop: 14, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        }}>
          <div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{file.name}</p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <FileTypeTag type={file.type} />
              {file.size && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{formatBytes(file.size)}</span>}
            </div>
          </div>
          <a
            href={file.downloadUrl}
            download={file.name}
            target="_blank"
            rel="noreferrer"
            style={{
              background: B.gold, color: B.teal, fontWeight: 900,
              padding: "10px 22px", borderRadius: 8, textDecoration: "none",
              fontSize: 15, border: `2px solid ${B.goldDark}`, whiteSpace: "nowrap",
            }}
          >
            ↓ Download
          </a>
        </div>
      </div>
    </div>
  );
}

// Single file card
function FileCard({ file, onClick }) {
  const [imgError, setImgError] = useState(false);
  const isClickable = file.type === "image" || file.type === "gif";

  return (
    <div
      onClick={() => isClickable && onClick(file)}
      style={{
        background: B.surface,
        border: `2px solid ${B.border}`,
        borderRadius: 10,
        overflow: "hidden",
        cursor: isClickable ? "pointer" : "default",
        transition: "border-color 0.15s, box-shadow 0.15s",
        display: "flex", flexDirection: "column",
      }}
      onMouseEnter={e => { if (isClickable) { e.currentTarget.style.borderColor = B.teal; e.currentTarget.style.boxShadow = `0 4px 16px rgba(29,92,74,0.15)`; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = B.border; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Thumbnail / preview area */}
      <div style={{
        width: "100%", paddingBottom: "75%", position: "relative",
        background: B.surfaceAlt, overflow: "hidden",
      }}>
        {file.thumbnailLink && !imgError ? (
          <img
            src={file.thumbnailLink}
            alt={file.name}
            onError={() => setImgError(true)}
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%", objectFit: "cover",
            }}
          />
        ) : (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <span style={{ fontSize: 36 }}>
              {file.type === "video" ? "🎬" : file.type === "gif" ? "🎞️" : "🖼️"}
            </span>
            <span style={{ fontSize: 11, color: B.textMute, textAlign: "center", padding: "0 8px" }}>
              {file.type === "video" ? "Video" : "No preview"}
            </span>
          </div>
        )}
        {/* Video play overlay */}
        {file.type === "video" && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.25)",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "rgba(255,255,255,0.9)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 18, marginLeft: 3 }}>▶</span>
            </div>
          </div>
        )}
      </div>

      {/* Info + actions */}
      <div style={{ padding: "10px 12px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <FileTypeTag type={file.type} />
          {file.size && <span style={{ fontSize: 11, color: B.textMute, marginLeft: "auto", flexShrink: 0 }}>{formatBytes(file.size)}</span>}
        </div>
        <p style={{
          fontSize: 13, fontWeight: 600, color: B.text, lineHeight: 1.35,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          wordBreak: "break-word",
        }}>{file.name}</p>
        <div style={{ marginTop: "auto", paddingTop: 6 }}>
          <a
            href={file.downloadUrl}
            download={file.name}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: "block", textAlign: "center",
              background: B.teal, color: "#fff",
              fontWeight: 700, fontSize: 13,
              padding: "7px 0", borderRadius: 6,
              textDecoration: "none",
              border: `2px solid ${B.tealDark}`,
            }}
            onMouseEnter={e => e.currentTarget.style.background = B.tealDark}
            onMouseLeave={e => e.currentTarget.style.background = B.teal}
          >
            ↓ Download
          </a>
        </div>
      </div>
    </div>
  );
}

export default function FileBrowser() {
  const [folderStack, setFolderStack] = useState([
    { id: "1Kt2ytgpZEy8NWPfuuY6j9M6QZuHVelw_", name: "Media" }
  ]);
  const [subfolders, setSubfolders]   = useState([]);
  const [files, setFiles]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [lightbox, setLightbox]       = useState(null);
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("all");
  const [view, setView]               = useState("grid"); // grid | list

  const currentFolder = folderStack[folderStack.length - 1];

  const loadFolder = useCallback(async (folderId) => {
    setLoading(true);
    setError(null);
    setFiles([]);
    setSubfolders([]);
    setSearch("");
    setTypeFilter("all");

    try {
      const [foldersRes, filesRes] = await Promise.all([
        fetch("/.netlify/functions/browse-drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "folders", folderId }),
        }),
        fetch("/.netlify/functions/browse-drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "files", folderId }),
        }),
      ]);

      const foldersData = await foldersRes.json();
      const filesData   = await filesRes.json();

      if (foldersData.success) setSubfolders(foldersData.folders || []);
      if (filesData.success)   setFiles(filesData.files || []);
      if (!foldersData.success && !filesData.success) {
        setError("Could not load folder contents. Check Drive permissions.");
      }
    } catch (e) {
      setError("Connection error — please try again.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFolder(currentFolder.id);
  }, []);

  const navigateTo = (folder) => {
    setFolderStack(prev => [...prev, folder]);
    loadFolder(folder.id);
  };

  const navigateBack = (idx) => {
    const newStack = folderStack.slice(0, idx + 1);
    setFolderStack(newStack);
    loadFolder(newStack[newStack.length - 1].id);
  };

  // Filter files
  const filtered = files.filter(f => {
    const matchType = typeFilter === "all" || f.type === typeFilter;
    const matchSearch = !search.trim() || f.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const counts = {
    all: files.length,
    image: files.filter(f => f.type === "image").length,
    video: files.filter(f => f.type === "video").length,
    gif:   files.filter(f => f.type === "gif").length,
  };

  const btnTab = (active) => ({
    padding: "7px 16px", borderRadius: 6, fontSize: 14, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
    border: active ? `2px solid ${B.teal}` : `2px solid ${B.border}`,
    background: active ? B.teal : B.surface,
    color: active ? "#fff" : B.textMid,
    transition: "all 0.15s",
  });

  return (
    <div style={{ fontFamily: "'Atkinson Hyperlegible', Georgia, serif" }}>
      {lightbox && <Lightbox file={lightbox} onClose={() => setLightbox(null)} />}

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {folderStack.map((f, idx) => (
          <span key={f.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {idx > 0 && <span style={{ color: B.textMute, fontSize: 14 }}>›</span>}
            <button
              onClick={() => idx < folderStack.length - 1 && navigateBack(idx)}
              style={{
                background: "none", border: "none", cursor: idx < folderStack.length - 1 ? "pointer" : "default",
                fontSize: 15, fontWeight: idx === folderStack.length - 1 ? 900 : 600,
                color: idx === folderStack.length - 1 ? B.teal : B.textMid,
                fontFamily: "inherit", padding: "2px 4px",
                textDecoration: idx < folderStack.length - 1 ? "underline" : "none",
              }}
            >
              {idx === 0 ? "📁 " : "📂 "}{f.name}
            </button>
          </span>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#fff5f0", border: `2px solid ${B.terracotta}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20, color: B.terracotta, fontWeight: 700 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📂</div>
          <p style={{ color: B.textMid, fontSize: 18, fontWeight: 600 }}>Loading folder…</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Subfolders */}
          {subfolders.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: B.textMute, marginBottom: 12 }}>
                Folders
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                {subfolders.map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => navigateTo(folder)}
                    style={{
                      background: B.surfaceAlt, border: `2px solid ${B.border}`,
                      borderRadius: 8, padding: "12px 14px",
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 10,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = B.teal; e.currentTarget.style.background = B.tealLight; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = B.border; e.currentTarget.style.background = B.surfaceAlt; }}
                  >
                    <span style={{ fontSize: 20 }}>📁</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: B.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {folder.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files section */}
          {files.length > 0 && (
            <>
              {/* Filter + search bar */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { key: "all",   label: `All (${counts.all})` },
                    { key: "image", label: `Images (${counts.image})` },
                    { key: "video", label: `Video (${counts.video})` },
                    { key: "gif",   label: `GIFs (${counts.gif})` },
                  ].filter(t => t.key === "all" || counts[t.key] > 0).map(t => (
                    <button key={t.key} style={btnTab(typeFilter === t.key)} onClick={() => setTypeFilter(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Search files…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    marginLeft: "auto", padding: "7px 14px", fontSize: 14,
                    border: `2px solid ${B.border}`, borderRadius: 6,
                    fontFamily: "inherit", color: B.text, background: B.surface,
                    minWidth: 180,
                  }}
                />
              </div>

              {/* Grid */}
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: B.textMute }}>
                  <p style={{ fontSize: 18, fontWeight: 600 }}>No files match your filter.</p>
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 14,
                }}>
                  {filtered.map(file => (
                    <FileCard key={file.id} file={file} onClick={setLightbox} />
                  ))}
                </div>
              )}
            </>
          )}

          {files.length === 0 && subfolders.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>📭</div>
              <p style={{ color: B.textMid, fontSize: 18, fontWeight: 600 }}>This folder is empty.</p>
            </div>
          )}

          {files.length === 0 && subfolders.length > 0 && (
            <div style={{ textAlign: "center", padding: "30px 0 10px" }}>
              <p style={{ color: B.textMute, fontSize: 15 }}>No media files in this folder — browse a subfolder above.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
