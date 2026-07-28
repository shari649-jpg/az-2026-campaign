import { useState, useEffect, useRef, useCallback } from "react";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { storage, auth } from "../firebase";

const TEAL = "var(--teal)";
const TEAL_DARK = "var(--teal-mid)";
const GOLD = "var(--gold)";
const BORDER = "var(--border)";
const CHARCOAL = "var(--charcoal)";
const BG = "var(--bg)";
const FOLDER = "candidate-headshots";

function slugify(name) {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "";
  const first = parts[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const last = parts.length > 1 ? parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return last ? `${last}-${first}` : first;
}

export default function AdminHeadshots() {
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [listError, setListError] = useState(null);

  const [uploadedFiles, setUploadedFiles] = useState([]); // [{ name, url }]
  const [loadingFiles, setLoadingFiles] = useState(true);

  const [selectedName, setSelectedName] = useState("");
  const [filename, setFilename] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState(null);
  const [progress, setProgress] = useState(null); // 0-100 while uploading
  const [uploadError, setUploadError] = useState(null);
  const [justUploaded, setJustUploaded] = useState(null); // filename just confirmed uploaded
  const [deletingName, setDeletingName] = useState(null);
  const fileRef = useRef(null);

  const loadCandidates = useCallback(async () => {
    setLoadingCandidates(true);
    setListError(null);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/.netlify/functions/query-candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ query: "", filterType: null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load candidates");
      setCandidates(data.results || []);
    } catch (err) {
      setListError(err.message || "Could not load candidates.");
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  const loadUploadedFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const folderRef = ref(storage, FOLDER);
      const listing = await listAll(folderRef);
      const files = await Promise.all(
        listing.items.map(async item => ({ name: item.name, url: await getDownloadURL(item) }))
      );
      setUploadedFiles(files.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      // Folder may not exist yet (no headshots uploaded at all) — treat as empty, not an error.
      setUploadedFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => { loadCandidates(); loadUploadedFiles(); }, [loadCandidates, loadUploadedFiles]);

  const uploadedNames = new Set(uploadedFiles.map(f => f.name));

  function candidateStatus(c) {
    if (!c.photo_filename) return { label: "No filename set in sheet", tone: "muted" };
    if (uploadedNames.has(c.photo_filename)) return { label: "Photo uploaded", tone: "good" };
    return { label: `Sheet says "${c.photo_filename}" but no matching file is uploaded`, tone: "warn" };
  }

  function selectCandidate(name) {
    setSelectedName(name);
    setJustUploaded(null);
    setUploadError(null);
    if (!name) { setFilename(""); return; }
    const ext = pendingFile ? "." + (pendingFile.name.split(".").pop() || "jpg") : ".jpg";
    setFilename(slugify(name) + ext);
  }

  function handleFile(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    setPendingFile(file);
    setJustUploaded(null);
    setUploadError(null);
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl(URL.createObjectURL(file));
    if (selectedName) {
      const ext = "." + (file.name.split(".").pop() || "jpg");
      setFilename(slugify(selectedName) + ext);
    }
  }

  async function handleUpload() {
    if (!pendingFile || !filename.trim()) return;
    setProgress(0);
    setUploadError(null);
    try {
      const storageRef = ref(storage, `${FOLDER}/${filename.trim()}`);
      const task = uploadBytesResumable(storageRef, pendingFile, { contentType: pendingFile.type });
      await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          resolve
        );
      });
      setJustUploaded(filename.trim());
      setPendingFile(null);
      setPendingPreviewUrl(null);
      setProgress(null);
      loadUploadedFiles();
    } catch (err) {
      setUploadError(err.message || "Upload failed. Confirm storage.rules has been deployed and you're signed in as a manager or administrator.");
      setProgress(null);
    }
  }

  async function handleDelete(name) {
    setDeletingName(name);
    try {
      await deleteObject(ref(storage, `${FOLDER}/${name}`));
      setUploadedFiles(prev => prev.filter(f => f.name !== name));
    } catch (err) {
      setListError(err.message || "Delete failed.");
    } finally {
      setDeletingName(null);
    }
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14,
    border: `2px solid ${BORDER}`, borderRadius: 8, fontFamily: "inherit", color: CHARCOAL, background: "#fff",
  };
  const cardStyle = { background: "#f3f4f0", border: `2px solid ${BORDER}`, borderRadius: 10, padding: 18, marginBottom: 20 };

  return (
    <div>
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 900, color: CHARCOAL }}>Upload a headshot</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#666" }}>
          Pick the candidate, drop in a photo, then copy the filename below into that candidate's
          <strong> Photo Filename</strong> column (N) in the Candidates sheet — that's what tells
          Candidate Cards which file belongs to which person.
        </p>

        {loadingCandidates ? (
          <p style={{ fontSize: 13, color: "#888" }}>Loading candidates…</p>
        ) : listError ? (
          <p style={{ fontSize: 13, color: "#c41e1e" }}>{listError}</p>
        ) : (
          <select value={selectedName} onChange={e => selectCandidate(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
            <option value="">Select a candidate…</option>
            {candidates.map(c => {
              const status = candidateStatus(c);
              const icon = status.tone === "good" ? "✓" : status.tone === "warn" ? "⚠" : "—";
              return (
                <option key={c.candidate_name} value={c.candidate_name}>
                  {icon} {c.candidate_name} — {c.office}
                </option>
              );
            })}
          </select>
        )}

        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
          style={{ border: `1.5px dashed ${TEAL}`, borderRadius: 8, padding: 16, textAlign: "center", marginBottom: 12, display: "flex", alignItems: "center", gap: 16, justifyContent: "center", flexWrap: "wrap" }}
        >
          {pendingPreviewUrl && (
            <img src={pendingPreviewUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: `2px solid ${BORDER}` }} />
          )}
          <div>
            <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>Drag a photo here, or</p>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${TEAL}`, background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              choose a file
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} style={{ display: "none" }} />
          </div>
        </div>

        <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#888", marginBottom: 6 }}>
          Filename (copy this into the sheet)
        </label>
        <input value={filename} onChange={e => setFilename(e.target.value)} style={{ ...inputStyle, marginBottom: 14, fontFamily: "monospace" }} placeholder="lastname-firstname.jpg" />

        <button
          onClick={handleUpload}
          disabled={!pendingFile || !filename.trim() || progress !== null}
          style={{
            background: TEAL, color: "#fff", fontWeight: 900, padding: "11px 22px", borderRadius: 8,
            border: `2px solid ${TEAL_DARK}`, cursor: (!pendingFile || !filename.trim() || progress !== null) ? "not-allowed" : "pointer",
            opacity: (!pendingFile || !filename.trim() || progress !== null) ? 0.5 : 1, fontSize: 15, fontFamily: "inherit",
          }}
        >
          {progress !== null ? `Uploading… ${progress}%` : "Upload headshot"}
        </button>

        {uploadError && <p style={{ fontSize: 13, color: "#c41e1e", marginTop: 10 }}>{uploadError}</p>}
        {justUploaded && (
          <p style={{ fontSize: 13, color: "#0a7a4a", marginTop: 10 }}>
            ✓ Uploaded as <strong style={{ fontFamily: "monospace" }}>{justUploaded}</strong> — now paste that exact filename into the Photo Filename column for this candidate.
          </p>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 900, color: CHARCOAL }}>Uploaded headshots ({uploadedFiles.length})</h3>
        {loadingFiles ? (
          <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>
        ) : uploadedFiles.length === 0 ? (
          <p style={{ fontSize: 13, color: "#888" }}>No headshots uploaded yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14 }}>
            {uploadedFiles.map(f => (
              <div key={f.name} style={{ background: "#fff", border: `2px solid ${BORDER}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
                <img src={f.url} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 6, marginBottom: 8 }} />
                <p style={{ fontSize: 11, fontFamily: "monospace", color: "#555", wordBreak: "break-all", margin: "0 0 8px" }}>{f.name}</p>
                <button
                  onClick={() => handleDelete(f.name)}
                  disabled={deletingName === f.name}
                  style={{ fontSize: 11, fontWeight: 700, color: "#c41e1e", background: "none", border: "1px solid #c41e1e", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  {deletingName === f.name ? "Deleting…" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loadingCandidates && !listError && candidates.some(c => candidateStatus(c).tone === "warn") && (
        <div style={{ background: "#FFF8DC", border: `2px solid ${GOLD}`, borderRadius: 8, padding: "12px 16px" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, margin: "0 0 4px" }}>⚠ Filename mismatch</p>
          <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
            One or more candidates have a Photo Filename in the sheet that doesn't match any uploaded file
            (typo, or the file was deleted here). Check the dropdown above — those show a ⚠.
          </p>
        </div>
      )}
    </div>
  );
}
