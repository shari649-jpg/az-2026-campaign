import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { storage, auth, db } from "../firebase";

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

  // Aug 27 2026 — plain <select> replaced with a type-to-filter combobox (direct
  // ask: "let me type into the select candidate field rather than scrolling
  // forever"). Track the selected candidate's id (not just name) since that's
  // what the Firestore write-through below needs, and names aren't guaranteed
  // unique the way a doc id is.
  const [selectedId, setSelectedId] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [showCandidateList, setShowCandidateList] = useState(false);
  const [stateFilter, setStateFilter] = useState(""); // "" = all states

  const [filename, setFilename] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState(null);
  const [progress, setProgress] = useState(null); // 0-100 while uploading
  const [uploadError, setUploadError] = useState(null);
  const [linkError, setLinkError] = useState(null); // Firestore write-through failed, but the upload itself succeeded
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

  // Real bug fix (Aug 27 2026): this read `c.photo_filename` (snake_case)
  // everywhere, but the actual Firestore field — confirmed against
  // scripts/migrate-candidates-to-firestore.mjs, the source of truth for what
  // the migration actually wrote — is `photoFilename` (camelCase), the same key
  // AdminPage.jsx's own candidate edit form reads and writes. The snake_case
  // read was always undefined, so every candidate always showed "No filename
  // set" here regardless of their real state. Fixed to read the real field.
  function candidateStatus(c) {
    if (!c.photoFilename) return { label: "No photo filename set", tone: "muted" };
    if (uploadedNames.has(c.photoFilename)) return { label: "Photo uploaded", tone: "good" };
    return { label: `Firestore says "${c.photoFilename}" but no matching file is uploaded`, tone: "warn" };
  }

  // Distinct states present in the loaded candidate list, for the state filter
  // (Aug 27 2026 — direct ask). Sorted, blank/undefined states excluded.
  const availableStates = useMemo(() => {
    const set = new Set(candidates.map(c => c.state).filter(Boolean));
    return [...set].sort();
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    let list = candidates;
    if (stateFilter) list = list.filter(c => c.state === stateFilter);
    if (candidateQuery.trim()) {
      const q = candidateQuery.trim().toLowerCase();
      list = list.filter(c => c.candidate_name.toLowerCase().includes(q));
    }
    return list;
  }, [candidates, stateFilter, candidateQuery]);

  function selectCandidate(c) {
    setSelectedId(c.id);
    setSelectedName(c.candidate_name);
    setCandidateQuery(c.candidate_name);
    setShowCandidateList(false);
    setJustUploaded(null);
    setUploadError(null);
    setLinkError(null);
    const ext = pendingFile ? "." + (pendingFile.name.split(".").pop() || "jpg") : ".jpg";
    setFilename(slugify(c.candidate_name) + ext);
  }

  function clearSelection() {
    setSelectedId("");
    setSelectedName("");
    setFilename("");
  }

  function handleFile(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    setPendingFile(file);
    setJustUploaded(null);
    setUploadError(null);
    setLinkError(null);
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
    setLinkError(null);
    const trimmed = filename.trim();
    try {
      const storageRef = ref(storage, `${FOLDER}/${trimmed}`);
      const task = uploadBytesResumable(storageRef, pendingFile, { contentType: pendingFile.type });
      await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          resolve
        );
      });
      setJustUploaded(trimmed);
      setPendingFile(null);
      setPendingPreviewUrl(null);
      setProgress(null);
      loadUploadedFiles();

      // Automatic write-through (Aug 27 2026) — this is the actual fix for
      // "the filename isn't populating into the candidate": that instruction
      // used to say to copy the filename into a Google Sheet column, which
      // stopped being read for this data back when query-candidates.mjs was
      // rewired to Firestore. Rather than just correct the instructions to
      // point at the (still manual) Candidates tab, this writes the filename
      // straight to the candidate's Firestore doc — no copy-paste step at all.
      if (selectedId) {
        try {
          await updateDoc(doc(db, "candidates", selectedId), { photoFilename: trimmed });
          setCandidates(prev => prev.map(c => c.id === selectedId ? { ...c, photoFilename: trimmed } : c));
        } catch (err) {
          setLinkError(
            `Photo uploaded, but couldn't automatically link it to ${selectedName}'s record (${err.message || "unknown error"}). ` +
            `You can set it manually on the Candidates tab — Photo Filename field.`
          );
        }
      }
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
          Pick the candidate and drop in a photo. The filename below is generated automatically, and
          once the upload finishes it's saved straight to that candidate's record — nothing to copy or paste.
        </p>

        {loadingCandidates ? (
          <p style={{ fontSize: 13, color: "#888" }}>Loading candidates…</p>
        ) : listError ? (
          <p style={{ fontSize: 13, color: "#c41e1e" }}>{listError}</p>
        ) : (
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            {availableStates.length > 1 && (
              <select
                value={stateFilter}
                onChange={e => setStateFilter(e.target.value)}
                style={{ ...inputStyle, width: "auto", minWidth: 120, flexShrink: 0 }}
              >
                <option value="">All states</option>
                {availableStates.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}

            <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
              <input
                value={candidateQuery}
                onChange={e => { setCandidateQuery(e.target.value); setShowCandidateList(true); if (!e.target.value) clearSelection(); }}
                onFocus={() => setShowCandidateList(true)}
                onBlur={() => setTimeout(() => setShowCandidateList(false), 150)}
                placeholder="Type a candidate's name…"
                style={inputStyle}
              />
              {showCandidateList && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
                  background: "#fff", border: `2px solid ${BORDER}`, borderRadius: 8,
                  maxHeight: 280, overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                }}>
                  {filteredCandidates.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 13, color: "#888" }}>No matching candidates.</div>
                  ) : filteredCandidates.map(c => {
                    const status = candidateStatus(c);
                    const icon = status.tone === "good" ? "✓" : status.tone === "warn" ? "⚠" : "—";
                    return (
                      <div
                        key={c.id || c.candidate_name}
                        onMouseDown={() => selectCandidate(c)}
                        style={{
                          padding: "9px 12px", fontSize: 13, cursor: "pointer",
                          background: selectedId === c.id ? "#eef6f6" : "#fff",
                          borderBottom: `1px solid ${BORDER}`,
                        }}
                      >
                        {icon} {c.candidate_name} — {c.office}{c.state ? ` (${c.state})` : ""}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
          style={{
            border: `2.5px dashed ${TEAL}`, borderRadius: 10, padding: 36, textAlign: "center",
            marginBottom: 12, minHeight: 200, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 14, background: "#fafdfd",
          }}
        >
          {pendingPreviewUrl && (
            <img src={pendingPreviewUrl} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: `2px solid ${BORDER}` }} />
          )}
          <div>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 10px" }}>Drag a photo anywhere in this box, or</p>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ padding: "9px 20px", borderRadius: 6, border: `1px solid ${TEAL}`, background: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              choose a file
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} style={{ display: "none" }} />
          </div>
        </div>

        <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#888", marginBottom: 6 }}>
          Filename
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
        {linkError && <p style={{ fontSize: 13, color: "#8A5A00", marginTop: 10 }}>⚠ {linkError}</p>}
        {justUploaded && !linkError && (
          <p style={{ fontSize: 13, color: "#0a7a4a", marginTop: 10 }}>
            ✓ Uploaded as <strong style={{ fontFamily: "monospace" }}>{justUploaded}</strong>
            {selectedId ? ` and linked to ${selectedName}'s record.` : " — select a candidate before uploading to link it automatically."}
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
            One or more candidates have a Photo Filename saved that doesn't match any uploaded file
            (typo, or the file was deleted here). Check the picker above — those show a ⚠.
          </p>
        </div>
      )}
    </div>
  );
}
