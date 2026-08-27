import { useState, useRef, useEffect, useCallback } from "react";
import { ref, getDownloadURL } from "firebase/storage";
import { storage, auth } from "../../firebase";

const B = {
  teal:        "var(--teal)",
  tealDark:    "var(--teal-mid)",
  tealLight:   "var(--teal-light)",
  gold:        "var(--gold)",
  border:      "var(--border)",
  bg:          "var(--bg)",
  surface:     "#ffffff",
  surfaceAlt:  "#f3f4f0",
  text:        "#1A1A1A",
  textMid:     "var(--text-mid)",
  textMute:    "#888580",
};

// Card palette — chosen for visual impact (per earlier design pass), not the strict brand guide.
// Locked to a single accent (bright yellow) per explicit feedback; more can be reintroduced later.
const CARD = {
  dusk: "#1C87A8",
  duskDeep: "#125E78",
  brightGold: "#FFD166",
  ink: "#241A14",
};
const ACCENT = CARD.brightGold;

// Party-based color schemes (Aug 27 2026) — explicit ask: "navy blue for Democrats
// coloring." Only Democrat was specified, so Republican/Independent/no-party all fall
// back to the existing teal scheme rather than guessing colors that weren't asked for —
// flagged in the handoff notes for a real decision later if wanted.
const SCHEMES = {
  democrat: { c1: "#14213D", c2: "#0B1526" },
  default:  { c1: CARD.dusk, c2: CARD.duskDeep },
};
function getScheme(party) {
  return (party || "").trim().toUpperCase() === "D" ? SCHEMES.democrat : SCHEMES.default;
}
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const CANVAS_SIZE = 1080;
const FOOTER_PCT = 0.07; // reserved height at the bottom for the compliance footer bar
const MIN_PHOTO_DIMENSION = 1000; // px — safe floor so uploaded headshots don't look blurry
const DESERT_PLACEHOLDER_URL = "/desert-placeholder.jpg";

const TEMPLATES = [
  { id: "split",     label: "Split" },
  { id: "fullbleed", label: "Full Bleed" },
];

function contrastText(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? CARD.ink : "#ffffff";
}

function partyLabel(party) {
  const p = (party || "").trim().toUpperCase();
  if (p === "D") return "Democrat";
  if (p === "R") return "Republican";
  if (p === "I") return "Independent";
  return null;
}

// Draws an image into (x,y,w,h) with object-fit: cover behavior, biased vertically by posYPercent
// (0 = anchor top of source, 50 = centered, 100 = anchor bottom) — needed because headshots are
// tall/narrow and some template slots are short/wide, so a naive centered crop clips heads.
function drawImageCover(ctx, img, x, y, w, h, posYPercent = 50) {
  const srcRatio = img.width / img.height;
  const destRatio = w / h;
  let sx, sy, sw, sh;
  if (srcRatio > destRatio) {
    sh = img.height;
    sw = sh * destRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / destRatio;
    sx = 0;
    sy = (img.height - sh) * (posYPercent / 100);
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Picks the largest font size (within [minSize,maxSize]) at which `text` fits inside
// maxWidth, given a font spec template like `800 SIZEpx Arial, sans-serif` (SIZE gets
// substituted in). Used for "ARIZONA" in the new corner layout (Aug 27 2026) — its box
// width is a function of the photo size, which is itself adjustable, so a hardcoded
// font size risks overflowing or under-filling the space; measuring is safer than guessing.
function fitFontSize(ctx, text, fontTemplate, maxWidth, minSize, maxSize) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = fontTemplate.replace("SIZE", size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

// Draws "Party · Office · District" as one line, each segment independently sized
// (Aug 27 2026 — explicit ask: Democrat as plain text inline with office/district,
// not a pill; office and district each get their own size slider). Segments that
// don't apply (no party selected, district hidden) are skipped without leaving a
// stray separator. Returns the line's height so callers can advance their y-cursor.
function drawPartyOfficeDistrictLine(ctx, { party_label, office, district, showDistrict, x, y, officeSize, districtSize, color = "#ffffff" }) {
  const segments = [];
  if (party_label) segments.push({ text: party_label, size: officeSize });
  if (office) segments.push({ text: office, size: officeSize });
  if (showDistrict && district) segments.push({ text: district, size: districtSize });
  if (segments.length === 0) return 0;

  let cx = x;
  const maxSize = Math.max(...segments.map(s => s.size));
  segments.forEach((seg, i) => {
    ctx.font = `700 ${seg.size}px Arial, sans-serif`;
    ctx.fillStyle = i === 0 ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.85)";
    ctx.fillText(seg.text, cx, y + maxSize * 0.85);
    cx += ctx.measureText(seg.text).width;
    if (i < segments.length - 1) {
      ctx.font = `400 ${maxSize}px Arial, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      const sep = "  \u00b7  ";
      ctx.fillText(sep, cx, y + maxSize * 0.85);
      cx += ctx.measureText(sep).width;
    }
  });
  return maxSize * 1.3;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawPill(ctx, { text, x, y, bg, color, fontSize, size }) {
  ctx.font = `900 ${fontSize}px 'Atkinson Hyperlegible', Arial, sans-serif`;
  const label = text.toUpperCase();
  const padX = fontSize * 0.7;
  const w = ctx.measureText(label).width + padX * 2;
  const h = fontSize * 1.9;
  ctx.fillStyle = bg;
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label, x + padX, y + h / 2 + fontSize * 0.04);
  return h;
}

// Priority tags — up to 3 short callouts across the bottom of the card, just above the
// compliance footer. Was Banner-template-only; ported here (Aug 26 2026) so the feature
// doesn't just disappear along with Banner — both remaining templates now support it.
// `minY` (Aug 26 2026 fix) — the main content's y-cursor after everything else is drawn.
// Priority tags default to a fixed near-bottom position, but that position doesn't know
// about the main content's own flow — a long name + full tagline + a "Vote" pill can all
// stack up and reach further down than the tags' default spot, which would otherwise
// silently overlap. Passing minY lets this function push the tags below whatever's already
// there instead of assuming there's always room.
function drawPriorityTags(ctx, { tags = [], size, pad, minY = 0, tagsFontScale = 1 }) {
  const filledTags = tags.filter(t => t && t.trim());
  if (filledTags.length === 0) return;
  const boxH = size * 0.06;
  const defaultLy = size - size * FOOTER_PCT - boxH - size * 0.03;
  const ly = Math.max(defaultLy, minY + size * 0.02);
  const gap = size * 0.02;
  const boxW = (size - pad * 2 - gap * (filledTags.length - 1)) / filledTags.length;
  const tagFontSize = Math.round(size * 0.016 * tagsFontScale);
  filledTags.forEach((tag, i) => {
    const bx = pad + i * (boxW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRectPath(ctx, bx, ly, boxW, boxH, size * 0.006);
    ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(bx, ly, boxW, size * 0.004);
    ctx.font = `700 ${tagFontSize}px Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tag.trim().toUpperCase(), bx + boxW / 2, ly + boxH / 2, boxW - 8);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });
}

function drawCompianceFooter(ctx, size, light) {
  const h = size * FOOTER_PCT;
  const y = size - h;
  ctx.fillStyle = light ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.3)";
  ctx.fillRect(0, y, size, h);
  const fontSize = Math.round(size * 0.017);
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = light ? "rgba(36,26,20,0.75)" : "rgba(255,255,255,0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("iwillvote.com  \u2022  Voter Hotline 833-VOTE-4-AZ", size / 2, y + h / 2);
  ctx.textAlign = "left";
}

function drawPlaceholder(ctx, img, x, y, w, h, showLabel, size) {
  if (img) {
    drawImageCover(ctx, img, x, y, w, h, 40);
  } else {
    ctx.fillStyle = "#cfcfcf";
    ctx.fillRect(x, y, w, h);
  }
  const grad = ctx.createLinearGradient(0, y + h * 0.65, 0, y + h);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  if (showLabel) {
    const fontSize = Math.round(size * 0.014);
    ctx.font = `800 ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("PHOTO COMING SOON", x + w / 2, y + h - h * 0.06);
    ctx.textAlign = "left";
  }
}

// Draws whichever template is active. `img` is the resolved photo (candidate headshot or the
// desert placeholder), already loaded — or null while still loading.
function drawCandidateCard(ctx, opts) {
  const {
    template, img, hasRealPhoto, name, office, district, showDistrict,
    party, tagline, tags = [], nameFontScale = 1, taglineFontScale = 1,
    officeFontScale = 1, districtFontScale = 1, tagsFontScale = 1,
    offsetX = 0, offsetY = 0, photoPosY = 50, showPlaceholderLabel = true,
    size = CANVAS_SIZE,
  } = opts;

  const scheme = getScheme(party);

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = scheme.c1;
  ctx.fillRect(0, 0, size, size);

  const party_label = partyLabel(party);
  const pad = size * 0.08;

  if (template === "split") {
    // Rebuilt again (Aug 27 2026, second pass) — the previous full-width-photo-band
    // version wasn't right either: the photo needs to stay in a top corner, with
    // ARIZONA and the office/district sitting across from it at the same height, not
    // spanning the full width above the photo. ARIZONA itself is a fixed design
    // element (never resized by the person using this), so instead of guessing a
    // font size, it's measured to fill exactly as much of that corner's width as it
    // can — see fitFontSize(). Everything else (VOTE banner, name, tagline, tags)
    // stacks full-width below this top row, largest at the bottom, per direct
    // instruction on ordering.
    const cornerH = size * 0.42;
    const photoW = cornerH; // roughly square corner box — much closer to a natural
                            // head-and-shoulders crop than the old tall/narrow or
                            // full-width-short bands tried previously.

    // Base gradient across the whole card first — the photo box below overwrites
    // its own corner; the rest of the card shows this gradient straight through.
    const baseGrad = ctx.createLinearGradient(0, 0, size, size);
    baseGrad.addColorStop(0, scheme.c1);
    baseGrad.addColorStop(1, scheme.c2);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, size, size);

    if (hasRealPhoto) drawImageCover(ctx, img, 0, 0, photoW, cornerH, photoPosY);
    else drawPlaceholder(ctx, img, 0, 0, photoW, cornerH, showPlaceholderLabel, size);

    // Divider accents — vertical between photo and the ARIZONA block, horizontal
    // between the top corner row and the stacked content below.
    ctx.fillStyle = ACCENT;
    ctx.fillRect(photoW - size * 0.004, 0, size * 0.008, cornerH);
    ctx.fillRect(0, cornerH - size * 0.004, size, size * 0.008);

    // ARIZONA + "Party · Office · District", vertically centered in the space
    // across from the photo. ARIZONA's size is measured to fill that width, not
    // hardcoded. Party is now plain text on the same line as office/district
    // (Aug 27 2026) — no longer its own pill.
    const rcX = photoW + size * 0.05;
    const rcMaxW = size - photoW - size * 0.1;
    const azSize = fitFontSize(ctx, "ARIZONA", "800 SIZEpx Arial, sans-serif", rcMaxW, size * 0.05, size * 0.15);
    const officeSize = Math.round(size * 0.03 * officeFontScale);
    const districtSize = Math.round(size * 0.03 * districtFontScale);
    const hasOfficeLine = !!(party_label || office || (showDistrict && district));
    const lineH = Math.max(officeSize, districtSize) * 1.3;
    const blockH = azSize * 1.05 + (hasOfficeLine ? size * 0.025 + lineH : 0);
    let blockY = (cornerH - blockH) / 2;

    ctx.font = `800 ${azSize}px Arial, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText("ARIZONA", rcX + offsetX, blockY + azSize * 0.85);
    blockY += azSize * 1.05 + size * 0.025;

    if (hasOfficeLine) {
      drawPartyOfficeDistrictLine(ctx, {
        party_label, office, district, showDistrict,
        x: rcX + offsetX, y: blockY, officeSize, districtSize,
      });
    }

    let x = pad + offsetX;
    let y = cornerH + size * 0.045 + offsetY;
    const maxW = size - pad * 2;

    // "VOTE · NOV 3" as a full-width bold banner.
    const voteBannerH = size * 0.1;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(pad, y, size - pad * 2, voteBannerH);
    ctx.font = `900 ${Math.round(size * 0.052)}px 'Atkinson Hyperlegible', Arial, sans-serif`;
    ctx.fillStyle = contrastText(ACCENT);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VOTE \u00b7 NOV 3", size / 2, y + voteBannerH / 2 + size * 0.003);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    y += voteBannerH + size * 0.03;

    // Candidate name — full width, largest text on the card.
    const nameSize = Math.round(size * 0.08 * nameFontScale);
    ctx.font = `900 ${nameSize}px 'Atkinson Hyperlegible', Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    const nameLines = wrapText(ctx, name || "Candidate name", maxW);
    nameLines.forEach(line => { ctx.fillText(line, x, y + nameSize); y += nameSize * 1.05; });
    y += size * 0.012;

    if (tagline) {
      const taglineSize = Math.round(size * 0.024 * taglineFontScale);
      ctx.font = `italic 400 ${taglineSize}px Georgia, serif`;
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      const tLines = wrapText(ctx, `"${tagline}"`, maxW);
      tLines.forEach(line => { y += taglineSize * 1.2; ctx.fillText(line, x, y); });
      y += size * 0.015;
    }

    drawPriorityTags(ctx, { tags, size, pad, minY: y + size * 0.02, tagsFontScale });

  } else if (template === "fullbleed") {
    // Rebuilt (Aug 27 2026) — ARIZONA moved out of the small top-left caption spot
    // into its own full-width band across the very top of the card, and the photo
    // shifts down to start below that band, per direct instruction. Same
    // Party/Office/District composite line and scheme-based coloring as Split.
    const azSize = Math.round(size * 0.115);
    const bandH = azSize * 1.7;

    ctx.fillStyle = scheme.c1;
    ctx.fillRect(0, 0, size, bandH);
    ctx.font = `800 ${azSize}px Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("ARIZONA", pad, bandH * 0.68);

    const photoY = bandH;
    const photoH = size - bandH;
    if (hasRealPhoto) drawImageCover(ctx, img, 0, photoY, size, photoH, photoPosY);
    else drawPlaceholder(ctx, img, 0, photoY, size, photoH, showPlaceholderLabel, size);

    const grad = ctx.createLinearGradient(0, size * 0.5, 0, size);
    grad.addColorStop(0, hexToRgba(scheme.c1, 0));
    grad.addColorStop(0.55, hexToRgba(scheme.c1, 0.65));
    grad.addColorStop(1, hexToRgba(scheme.c2, 0.95));
    ctx.fillStyle = grad;
    ctx.fillRect(0, photoY, size, size - photoY);

    let x = pad + offsetX;
    let y = size * 0.56 + offsetY;
    const maxW = size - pad * 2;

    const officeSize = Math.round(size * 0.03 * officeFontScale);
    const districtSize = Math.round(size * 0.03 * districtFontScale);
    if (party_label || office || (showDistrict && district)) {
      y += drawPartyOfficeDistrictLine(ctx, {
        party_label, office, district, showDistrict,
        x, y, officeSize, districtSize,
      }) + size * 0.02;
    }

    // "VOTE · NOV 3" full-width banner — unified with Split's treatment (Aug 27 2026)
    // rather than the old separate "VOTE" headline + small date pill.
    const voteBannerH = size * 0.1;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(pad, y, size - pad * 2, voteBannerH);
    ctx.font = `900 ${Math.round(size * 0.052)}px 'Atkinson Hyperlegible', Arial, sans-serif`;
    ctx.fillStyle = contrastText(ACCENT);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VOTE \u00b7 NOV 3", size / 2, y + voteBannerH / 2 + size * 0.003);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    y += voteBannerH + size * 0.02;

    const nameSize = Math.round(size * 0.066 * nameFontScale);
    ctx.font = `900 ${nameSize}px 'Atkinson Hyperlegible', Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    const nameLines = wrapText(ctx, name || "Candidate name", maxW);
    nameLines.forEach(line => { ctx.fillText(line, x, y + nameSize); y += nameSize * 1.05; });
    y += size * 0.01;

    if (tagline) {
      const taglineSize = Math.round(size * 0.022 * taglineFontScale);
      ctx.font = `italic 400 ${taglineSize}px Georgia, serif`;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      const tLines = wrapText(ctx, tagline, maxW);
      tLines.forEach(line => { y += taglineSize * 1.2; ctx.fillText(line, x, y); });
      y += size * 0.014;
    }

    drawPriorityTags(ctx, { tags, size, pad, minY: y + size * 0.02, tagsFontScale });

  }

  drawCompianceFooter(ctx, size, false);
}

function wrapText(ctx, text, maxWidth) {
  const words = (text || "").split(/\s+/);
  const lines = [];
  let current = "";
  words.forEach(word => {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function CanvasPreview({ size = 380, draw }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    document.fonts.ready.then(() => draw(ctx));
  }, [draw]);
  return (
    <canvas
      ref={ref}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      style={{ width: size, height: size, borderRadius: 8, display: "block", border: `2px solid ${B.border}` }}
    />
  );
}

function loadImage(src, crossOrigin = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default function CandidateCards() {
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [candidateError, setCandidateError] = useState(null);
  const [selectedName, setSelectedName] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [showCandidateList, setShowCandidateList] = useState(false);

  const [name, setName] = useState("");
  const [office, setOffice] = useState("");
  const [district, setDistrict] = useState("");
  const [showDistrict, setShowDistrict] = useState(true);
  const [party, setParty] = useState("D");
  const [tagline, setTagline] = useState("");
  const [tags, setTags] = useState(["", "", ""]);

  const [template, setTemplate] = useState("split");
  const [nameFontScale, setNameFontScale] = useState(1);
  const [taglineFontScale, setTaglineFontScale] = useState(1);
  const [officeFontScale, setOfficeFontScale] = useState(1);
  const [districtFontScale, setDistrictFontScale] = useState(1);
  const [tagsFontScale, setTagsFontScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [photoPosY, setPhotoPosY] = useState(18);
  const [previewMode, setPreviewMode] = useState(false);

  const [manualPhotoDataUrl, setManualPhotoDataUrl] = useState(null);
  const [photoWarning, setPhotoWarning] = useState("");
  const [resolvedImg, setResolvedImg] = useState(null); // loaded HTMLImageElement, or null while loading
  const [hasRealPhoto, setHasRealPhoto] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef(null);

  // Load candidate list once
  useEffect(() => {
    (async () => {
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
        setCandidateError(err.message || "Could not load candidates.");
      } finally {
        setLoadingCandidates(false);
      }
    })();
  }, []);

  function selectCandidate(candidateName) {
    setSelectedName(candidateName);
    setCandidateQuery(candidateName);
    setShowCandidateList(false);
    const c = candidates.find(c => c.candidate_name === candidateName);
    if (!c) return;
    setName(c.candidate_name || "");
    setOffice(c.office || "");
    setDistrict(c.district || "");
    setParty(c.party || "D");
    setManualPhotoDataUrl(null); // clear any manual override — defer to the candidate's own headshot
  }

  const filteredCandidates = candidateQuery.trim()
    ? candidates.filter(c => c.candidate_name.toLowerCase().includes(candidateQuery.trim().toLowerCase()))
    : candidates;

  // Resolve which photo to show: manual override > Firebase Storage headshot > null (placeholder)
  useEffect(() => {
    let cancelled = false;
    setResolvedImg(null);

    async function resolve() {
      if (manualPhotoDataUrl) {
        const img = await loadImage(manualPhotoDataUrl, false);
        if (!cancelled) { setResolvedImg(img); setHasRealPhoto(true); }
        return;
      }
      const candidate = candidates.find(c => c.candidate_name === selectedName);
      const filename = candidate?.photo_filename;
      if (filename) {
        try {
          const url = await getDownloadURL(ref(storage, `candidate-headshots/${filename}`));
          const img = await loadImage(url, true);
          if (!cancelled) { setResolvedImg(img); setHasRealPhoto(true); }
          return;
        } catch {
          // no headshot uploaded yet for this candidate — fall through to placeholder
        }
      }
      try {
        const img = await loadImage(DESERT_PLACEHOLDER_URL, false);
        if (!cancelled) { setResolvedImg(img); setHasRealPhoto(false); }
      } catch {
        if (!cancelled) { setResolvedImg(null); setHasRealPhoto(false); }
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [manualPhotoDataUrl, selectedName, candidates]);

  function checkResolution(w, h) {
    if (w < MIN_PHOTO_DIMENSION || h < MIN_PHOTO_DIMENSION) {
      setPhotoWarning(`This photo is ${w}\u00d7${h}px \u2014 for a crisp card, use one at least ${MIN_PHOTO_DIMENSION}\u00d7${MIN_PHOTO_DIMENSION}px (ideally 1500\u00d71500+).`);
    } else {
      setPhotoWarning("");
    }
  }

  function handleFile(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setManualPhotoDataUrl(dataUrl);
      const img = new Image();
      img.onload = () => checkResolution(img.naturalWidth, img.naturalHeight);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  const buildDrawOpts = useCallback((size, forceHideLabel) => ({
    template, img: resolvedImg, hasRealPhoto, name, office, district, showDistrict, party, tagline, tags,
    nameFontScale, taglineFontScale, officeFontScale, districtFontScale, tagsFontScale, offsetX, offsetY, photoPosY,
    showPlaceholderLabel: forceHideLabel ? false : !previewMode,
    size,
  }), [template, resolvedImg, hasRealPhoto, name, office, district, showDistrict, party, tagline, tags,
       nameFontScale, taglineFontScale, officeFontScale, districtFontScale, tagsFontScale, offsetX, offsetY, photoPosY, previewMode]);

  const draw = useCallback((ctx) => {
    drawCandidateCard(ctx, buildDrawOpts(CANVAS_SIZE, false));
  }, [buildDrawOpts]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext("2d");
      await document.fonts.ready;
      // Exported file never carries the "photo coming soon" builder label — force it off.
      drawCandidateCard(ctx, buildDrawOpts(CANVAS_SIZE, true));
      await new Promise(resolve => {
        canvas.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const slug = (name || "candidate").toLowerCase().replace(/[^a-z0-9]+/g, "-");
          a.href = url;
          a.download = `az-coalition-${slug}-${template}.png`;
          a.click();
          URL.revokeObjectURL(url);
          resolve();
        }, "image/png");
      });
    } finally {
      setDownloading(false);
    }
  }

  const inputStyle = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: `2px solid ${B.border}`, borderRadius: 8,
    fontFamily: "inherit", color: B.text, background: B.surface,
  };
  const labelStyle = {
    display: "block", fontSize: 12, fontWeight: 900,
    letterSpacing: "0.05em", textTransform: "uppercase",
    color: B.textMid, marginBottom: 6,
  };
  const sectionStyle = { background: B.surfaceAlt, border: `2px solid ${B.border}`, borderRadius: 10, padding: 18, marginBottom: 16 };

  return (
    <div style={{ fontFamily: "'Atkinson Hyperlegible', Georgia, serif" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

          <div style={sectionStyle}>
            <label style={labelStyle}>Candidate</label>
            {loadingCandidates ? (
              <p style={{ fontSize: 13, color: B.textMute }}>Loading candidates\u2026</p>
            ) : candidateError ? (
              <p style={{ fontSize: 13, color: "#c41e1e" }}>{candidateError}</p>
            ) : (
              <div style={{ position: "relative" }}>
                <input
                  value={candidateQuery}
                  onChange={e => { setCandidateQuery(e.target.value); setShowCandidateList(true); }}
                  onFocus={() => setShowCandidateList(true)}
                  onBlur={() => setTimeout(() => setShowCandidateList(false), 150)}
                  placeholder="Type a name to search\u2026"
                  style={inputStyle}
                />
                {showCandidateList && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                    background: B.surface, border: `2px solid ${B.border}`, borderRadius: 8,
                    marginTop: 4, maxHeight: 260, overflowY: "auto", boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                  }}>
                    {filteredCandidates.length === 0 ? (
                      <div style={{ padding: "10px 12px", fontSize: 13, color: B.textMute }}>No matches</div>
                    ) : (
                      filteredCandidates.map(c => (
                        <div
                          key={c.candidate_name}
                          onMouseDown={e => { e.preventDefault(); selectCandidate(c.candidate_name); }}
                          style={{
                            padding: "9px 12px", fontSize: 13, cursor: "pointer",
                            background: c.candidate_name === selectedName ? B.tealLight : "transparent",
                            borderBottom: `1px solid ${B.border}`,
                          }}
                        >
                          <strong>{c.candidate_name}</strong> — {c.office}{c.district ? ` (${c.district})` : ""}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            <p style={{ fontSize: 11, color: B.textMute, marginTop: 8 }}>
              Pulls Name / Office / District / Party straight from the Candidates sheet. You can still edit them below.
            </p>
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Template</label>
            <div style={{ display: "flex", gap: 8 }}>
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  style={{
                    flex: 1, padding: "8px 6px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                    cursor: "pointer", fontFamily: "inherit",
                    border: template === t.id ? `2px solid ${B.teal}` : `2px solid ${B.border}`,
                    background: template === t.id ? B.tealLight : B.surface,
                    color: template === t.id ? B.teal : B.text,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Photo</label>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
              style={{ border: `1.5px dashed ${B.teal}`, background: B.surface, borderRadius: 8, padding: 14, textAlign: "center", marginBottom: 8 }}
            >
              <p style={{ fontSize: 12, color: B.textMid, marginBottom: 8 }}>Drag a headshot here, or</p>
              <button
                onClick={() => fileRef.current?.click()}
                style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${B.teal}`, background: B.surface, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                choose a file
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} style={{ display: "none" }} />
            </div>
            {photoWarning && (
              <div style={{ padding: "8px 10px", borderRadius: 6, background: "#FFF4E5", border: "1px solid #F0C36D", color: "#8A5A00", fontSize: 11, fontWeight: 600 }}>
                \u26a0\ufe0f {photoWarning}
              </div>
            )}
            {!manualPhotoDataUrl && !hasRealPhoto && selectedName && (
              <p style={{ fontSize: 11, color: "#8A5A00", marginTop: 8 }}>
                No headshot on file for this candidate yet \u2014 showing the placeholder. Upload one to the Admin panel, or drop one in above just for this card.
              </p>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: B.textMid, cursor: "pointer" }}>
              <input type="checkbox" checked={previewMode} onChange={e => setPreviewMode(e.target.checked)} />
              Preview as exported (hide "Photo coming soon")
            </label>
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Card details</label>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: B.textMute }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: B.textMute }}>Office</label>
              <input value={office} onChange={e => setOffice(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: B.textMute }}>District</label>
                <input value={district} onChange={e => setDistrict(e.target.value)} disabled={!showDistrict} style={{ ...inputStyle, opacity: showDistrict ? 1 : 0.5 }} />
              </div>
              <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, paddingBottom: 10 }}>
                <input type="checkbox" checked={showDistrict} onChange={e => setShowDistrict(e.target.checked)} /> show
              </label>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: B.textMute }}>Party</label>
              <select value={party} onChange={e => setParty(e.target.value)} style={inputStyle}>
                <option value="D">Democrat</option>
                <option value="R">Republican</option>
                <option value="I">Independent</option>
                <option value="none">Don't show</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: B.textMute }}>Tagline</label>
              <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Relief for working families." style={inputStyle} />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 11, color: B.textMute }}>Priority tags (shown across the bottom, up to 3)</label>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {tags.map((tag, i) => (
                  <input
                    key={i}
                    value={tag}
                    onChange={e => setTags(prev => prev.map((t, j) => (j === i ? e.target.value : t)))}
                    placeholder={["Housing", "Groceries", "Child Care"][i]}
                    style={{ ...inputStyle, fontSize: 13 }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Type & placement</label>
            <SliderRow label="Photo vertical crop" value={photoPosY} min={0} max={100} onChange={setPhotoPosY} unit="%" B={B} />
            <SliderRow label="Name size" value={Math.round(nameFontScale * 100)} min={60} max={140} onChange={v => setNameFontScale(v / 100)} unit="%" B={B} />
            <SliderRow label="Tagline size" value={Math.round(taglineFontScale * 100)} min={60} max={140} onChange={v => setTaglineFontScale(v / 100)} unit="%" B={B} />
            <SliderRow label="Office size" value={Math.round(officeFontScale * 100)} min={60} max={140} onChange={v => setOfficeFontScale(v / 100)} unit="%" B={B} />
            <SliderRow label="District size" value={Math.round(districtFontScale * 100)} min={60} max={140} onChange={v => setDistrictFontScale(v / 100)} unit="%" B={B} />
            <SliderRow label="Issues size" value={Math.round(tagsFontScale * 100)} min={60} max={140} onChange={v => setTagsFontScale(v / 100)} unit="%" B={B} />
            <SliderRow label="Nudge horizontal" value={offsetX} min={-60} max={60} onChange={setOffsetX} unit="px" B={B} />
            <SliderRow label="Nudge vertical" value={offsetY} min={-60} max={60} onChange={setOffsetY} unit="px" B={B} />
            {(offsetX !== 0 || offsetY !== 0) && (
              <button onClick={() => { setOffsetX(0); setOffsetY(0); }} style={{ fontSize: 12, color: B.teal, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                Reset position
              </button>
            )}
          </div>

          <button
            onClick={handleDownload}
            disabled={downloading || !name.trim()}
            style={{
              background: B.teal, color: "#fff", fontWeight: 900,
              padding: "13px 24px", borderRadius: 8,
              border: `2px solid ${B.tealDark}`, cursor: downloading || !name.trim() ? "not-allowed" : "pointer",
              opacity: downloading || !name.trim() ? 0.5 : 1,
              fontSize: 16, fontFamily: "inherit",
            }}
          >
            {downloading ? "Generating\u2026" : "\u2193 Download Card (PNG)"}
          </button>
        </div>

        <div style={{ position: "sticky", top: 90 }}>
          <label style={{ ...labelStyle, marginBottom: 14 }}>Live Preview</label>
          <CanvasPreview size={Math.min(420, 500)} draw={draw} />
          <p style={{ fontSize: 12, color: B.textMute, marginTop: 12 }}>
            Downloads at 1080\u00d71080px \u2014 optimized for Instagram, Facebook & Threads.
          </p>
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange, unit, B }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: B.textMid, marginBottom: 3 }}>
        <span>{label}</span>
        <span>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: "100%" }} />
    </div>
  );
}
