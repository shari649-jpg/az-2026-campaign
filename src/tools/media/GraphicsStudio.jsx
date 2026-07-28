import { useState, useRef, useEffect, useCallback } from "react";

const B = {
  teal:       "var(--teal)",
  tealDark:   "var(--teal-mid)",
  tealLight:  "var(--teal-light)",
  gold:       "var(--gold)",
  goldDark:   "#c9a000",
  turquoise:  "var(--turquoise)",
  charcoal:   "var(--charcoal)",
  terracotta: "var(--terracotta)",
  bg:         "var(--bg)",
  surface:    "#ffffff",
  surfaceAlt: "#f3f4f0",
  border:     "var(--border)",
  borderStrong: "var(--teal)",
  text:       "#1A1A1A",
  textMid:    "var(--text-mid)",
  textMute:   "#888580",
};

const CANVAS_SIZE = 1080;

const TEMPLATES = [
  {
    id: "sunrise",
    label: "Sunrise",
    description: "Clean white · dark text · ocean blue highlights",
    preview: { bg: "#ffffff", text: "#241A14", highlight: "#1C87A8", chip: "#1C87A8", chipText: "#ffffff" },
    canvas: { bg: "#ffffff", text: "#241A14", highlight: "#1C87A8", chip: "#1C87A8", chipText: "#ffffff" },
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Bright ocean blue · white text · yellow highlights",
    preview: { bg: "#1C87A8", text: "#ffffff", highlight: "#FFD166", chip: "#FFD166", chipText: "#14304A" },
    canvas: { bg: "#1C87A8", text: "#ffffff", highlight: "#FFD166", chip: "#FFD166", chipText: "#14304A" },
  },
  {
    id: "charcoal",
    label: "Charcoal",
    description: "Deep navy charcoal · white text · yellow highlights",
    preview: { bg: "#232B3D", text: "#ffffff", highlight: "#FFD166", chip: "#FFD166", chipText: "#14304A" },
    canvas: { bg: "#232B3D", text: "#ffffff", highlight: "#FFD166", chip: "#FFD166", chipText: "#14304A" },
  },
  {
    id: "breaking",
    label: "Breaking",
    description: "Black · white text · terracotta highlights",
    preview: { bg: "#111111", text: "#ffffff", highlight: "#D9613F", chip: "#D9613F", chipText: "#ffffff" },
    canvas: { bg: "#111111", text: "#ffffff", highlight: "#D9613F", chip: "#D9613F", chipText: "#ffffff" },
  },
  {
    id: "gold",
    label: "Gold",
    description: "Bold bright yellow · dark text · ocean blue highlights",
    preview: { bg: "#FFD166", text: "#241A14", highlight: "#1C87A8", chip: "#1C87A8", chipText: "#ffffff" },
    canvas: { bg: "#FFD166", text: "#241A14", highlight: "#1C87A8", chip: "#1C87A8", chipText: "#ffffff" },
  },
];

const LABEL_PRESETS = ["Arizona", "Breaking", "Custom", "None"];

// Convert a hex color to an rgba() string at a given alpha — used so watermark/slide-number
// opacity adapts to each template's own text color instead of assuming a dark background.
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Parse text — words wrapped in *asterisks* get highlight color
function parseHighlights(text) {
  const parts = [];
  const regex = /\*([^*]+)\*/g;
  let last = 0, m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), highlight: false });
    parts.push({ text: m[1], highlight: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), highlight: false });
  return parts;
}

// Draw a single card on a canvas context
function drawCard(ctx, { text, label, template, size = CANVAS_SIZE, slideIndex = null, slideTotal = null }) {
  const T = template.canvas;
  const pad = Math.round(size * 0.074);
  const fontSize = Math.round(size * 0.068);
  const lineHeight = fontSize * 1.22;
  const handleFontSize = Math.round(size * 0.028);

  ctx.clearRect(0, 0, size, size);

  // Background
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, size, size);

  // Accent bar — thin line at top
  ctx.fillStyle = T.highlight;
  ctx.fillRect(0, 0, size, Math.round(size * 0.006));

  // Label chip
  let textStartY = pad + fontSize;
  if (label && label !== "None" && label.trim()) {
    const chipFontSize = Math.round(size * 0.032);
    ctx.font = `900 ${chipFontSize}px 'Atkinson Hyperlegible', Arial, sans-serif`;
    const chipText = label.toUpperCase();
    const chipW = ctx.measureText(chipText).width + chipFontSize * 1.2;
    const chipH = chipFontSize * 1.6;
    const chipX = pad;
    const chipY = pad;

    // Chip background
    ctx.fillStyle = T.chip;
    ctx.beginPath();
    ctx.roundRect(chipX, chipY, chipW, chipH, 6);
    ctx.fill();

    // Chip text
    ctx.fillStyle = T.chipText;
    ctx.textBaseline = "middle";
    ctx.fillText(chipText, chipX + chipFontSize * 0.6, chipY + chipH / 2);

    textStartY = chipY + chipH + Math.round(size * 0.06);
  }

  // Main text — parse highlights, word-wrap manually
  ctx.font = `900 ${fontSize}px 'Atkinson Hyperlegible', Arial, sans-serif`;
  ctx.textBaseline = "top";

  const maxWidth = size - pad * 2;
  const parts = parseHighlights(text || "");

  // Build word list with highlight flag
  const words = [];
  parts.forEach(part => {
    part.text.split(/(\s+)/).forEach(chunk => {
      if (chunk) words.push({ word: chunk, highlight: part.highlight });
    });
  });

  // Measure and wrap into lines
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;

  words.forEach(item => {
    const w = ctx.measureText(item.word).width;
    if (currentWidth + w > maxWidth && currentLine.length > 0 && item.word.trim()) {
      lines.push(currentLine);
      currentLine = [item];
      currentWidth = w;
    } else {
      currentLine.push(item);
      currentWidth += w;
    }
  });
  if (currentLine.length) lines.push(currentLine);

  // Draw lines
  let y = textStartY;
  lines.forEach(line => {
    let x = pad;
    line.forEach(item => {
      ctx.fillStyle = item.highlight ? T.highlight : T.text;
      ctx.fillText(item.word, x, y);
      x += ctx.measureText(item.word).width;
    });
    y += lineHeight;
  });

  // Handle / watermark — bottom right
  ctx.font = `700 ${handleFontSize}px 'Atkinson Hyperlegible', Arial, sans-serif`;
  ctx.fillStyle = hexToRgba(T.text, 0.45);
  ctx.textBaseline = "bottom";
  ctx.textAlign = "right";
  ctx.fillText("@ArizonaCoalition", size - pad, size - pad);
  ctx.textAlign = "left";

  // Slide number — bottom left (carousel mode only)
  if (slideIndex != null && slideTotal != null) {
    ctx.font = `900 ${handleFontSize}px 'Atkinson Hyperlegible', Arial, sans-serif`;
    ctx.fillStyle = hexToRgba(T.text, 0.7);
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(`${slideIndex}/${slideTotal}`, pad, size - pad);
  }
}

// Single canvas preview card
function CanvasPreview({ text, label, template, size = 280, slideIndex = null, slideTotal = null }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Load font then draw
    document.fonts.ready.then(() => {
      drawCard(ctx, { text, label, template, size: canvas.width, slideIndex, slideTotal });
    });
  }, [text, label, template, slideIndex, slideTotal]);

  return (
    <canvas
      ref={ref}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      style={{ width: size, height: size, borderRadius: 8, display: "block", border: `2px solid ${B.border}` }}
    />
  );
}

export default function GraphicsStudio() {
  const [mode, setMode]           = useState("single"); // single | carousel
  const [templateId, setTemplateId] = useState("charcoal");
  const [labelPreset, setLabelPreset] = useState("None");
  const [customLabel, setCustomLabel] = useState("");
  const [singleText, setSingleText]   = useState("");
  const [slides, setSlides]           = useState(["", "", "", ""]);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded]   = useState(null);

  const template = TEMPLATES.find(t => t.id === templateId);
  const activeLabel = labelPreset === "Custom" ? customLabel : labelPreset === "None" ? "" : labelPreset;

  const updateSlide = (idx, val) => {
    setSlides(prev => { const n = [...prev]; n[idx] = val; return n; });
  };

  // Download a single canvas as PNG
  const downloadCanvas = useCallback((text, label, tmpl, filename, slideIndex = null, slideTotal = null) => {
    return new Promise(resolve => {
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext("2d");
      document.fonts.ready.then(() => {
        drawCard(ctx, { text, label, template: tmpl, size: CANVAS_SIZE, slideIndex, slideTotal });
        canvas.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          resolve();
        }, "image/png");
      });
    });
  }, []);

  const downloadSingle = async () => {
    if (!singleText.trim()) return;
    setDownloading(true);
    await downloadCanvas(singleText, activeLabel, template, `az-coalition-card.png`);
    setDownloading(false);
    setDownloaded("single");
    setTimeout(() => setDownloaded(null), 3000);
  };

  const downloadCarousel = async () => {
    const filledIndices = slides.map((s, i) => s.trim() ? i : null).filter(i => i !== null);
    if (filledIndices.length === 0) return;
    setDownloading(true);
    const total = filledIndices.length;
    for (let n = 0; n < filledIndices.length; n++) {
      const i = filledIndices[n];
      await downloadCanvas(slides[i], activeLabel, template, `az-coalition-slide-${n + 1}.png`, n + 1, total);
      await new Promise(r => setTimeout(r, 200)); // small delay between downloads
    }
    setDownloading(false);
    setDownloaded("carousel");
    setTimeout(() => setDownloaded(null), 3000);
  };

  const inputStyle = {
    width: "100%", padding: "12px 14px",
    fontSize: 16, lineHeight: 1.5,
    border: `2px solid ${B.border}`, borderRadius: 8,
    fontFamily: "inherit", color: B.text, background: B.surface,
    resize: "vertical",
  };
  const labelStyle = {
    display: "block", fontSize: 13, fontWeight: 900,
    letterSpacing: "0.07em", textTransform: "uppercase",
    color: B.textMid, marginBottom: 8,
  };
  const btnPrimary = {
    background: B.teal, color: "#fff", fontWeight: 900,
    padding: "13px 24px", borderRadius: 8,
    border: `2px solid ${B.tealDark}`, cursor: "pointer",
    fontSize: 16, fontFamily: "inherit",
  };
  const btnSecondary = {
    background: B.surface, color: B.text, fontWeight: 700,
    padding: "10px 18px", borderRadius: 8,
    border: `2px solid ${B.border}`, cursor: "pointer",
    fontSize: 15, fontFamily: "inherit",
  };

  return (
    <div style={{ fontFamily: "'Atkinson Hyperlegible', Georgia, serif" }}>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
        {[
          { id: "single",   label: "🖼️ Single Card" },
          { id: "carousel", label: "📱 4-Slide Carousel" },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              ...btnSecondary,
              background: mode === m.id ? B.teal : B.surface,
              color: mode === m.id ? "#fff" : B.text,
              border: `2px solid ${mode === m.id ? B.tealDark : B.border}`,
              fontWeight: 900, fontSize: 15,
            }}
          >{m.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>

        {/* ── Left: Controls ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

          {/* Template picker */}
          <div style={{ background: B.surfaceAlt, border: `2px solid ${B.border}`, borderRadius: 10, padding: 20 }}>
            <label style={labelStyle}>Template</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {TEMPLATES.map(t => {
                const active = templateId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "10px 14px", borderRadius: 8,
                      border: active ? `2px solid ${B.teal}` : `2px solid ${B.border}`,
                      background: active ? B.tealLight : B.surface,
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    }}
                  >
                    {/* Color swatch */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                      background: t.preview.bg, border: "2px solid rgba(0,0,0,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ color: t.preview.highlight, fontSize: 16, fontWeight: 900 }}>A</span>
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 900, color: B.text, marginBottom: 2 }}>{t.label}</p>
                      <p style={{ fontSize: 12, color: B.textMute }}>{t.description}</p>
                    </div>
                    {active && <span style={{ marginLeft: "auto", color: B.teal, fontSize: 18 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Label chip */}
          <div style={{ background: B.surfaceAlt, border: `2px solid ${B.border}`, borderRadius: 10, padding: 20 }}>
            <label style={labelStyle}>Label Chip <span style={{ fontWeight: 400, fontSize: 12, textTransform: "none", letterSpacing: 0, color: B.textMute }}>(top-left badge)</span></label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: labelPreset === "Custom" ? 12 : 0 }}>
              {LABEL_PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => setLabelPreset(p)}
                  style={{
                    padding: "6px 14px", borderRadius: 6, fontSize: 14, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                    border: labelPreset === p ? `2px solid ${B.teal}` : `2px solid ${B.border}`,
                    background: labelPreset === p ? B.teal : B.surface,
                    color: labelPreset === p ? "#fff" : B.textMid,
                  }}
                >{p}</button>
              ))}
            </div>
            {labelPreset === "Custom" && (
              <input
                type="text"
                placeholder='e.g. "CAUGHT IN 4K" or "DID YOU KNOW"'
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value.toUpperCase())}
                style={{ ...inputStyle, fontSize: 14, marginTop: 10 }}
                maxLength={30}
              />
            )}
          </div>

          {/* Highlight hint */}
          <div style={{ background: "#fffdf0", border: `2px solid ${B.gold}`, borderRadius: 8, padding: "12px 16px" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: B.charcoal, marginBottom: 4 }}>✨ Highlight words</p>
            <p style={{ fontSize: 13, color: B.textMid, lineHeight: 1.5 }}>
              Wrap words in <code style={{ background: "rgba(0,0,0,0.07)", padding: "1px 5px", borderRadius: 3 }}>*asterisks*</code> to color them in the template's accent color.
              <br/>Example: <em>Arizona families <strong>*deserve better*</strong> than this</em>
            </p>
          </div>

          {/* Text input(s) */}
          {mode === "single" ? (
            <div>
              <label style={labelStyle}>Card Text</label>
              <textarea
                rows={5}
                placeholder={"Arizona families *deserve better*.\n\nTell your rep to vote NO on HB 2345."}
                value={singleText}
                onChange={e => setSingleText(e.target.value)}
                style={inputStyle}
              />
              <p style={{ fontSize: 12, color: B.textMute, marginTop: 6 }}>{singleText.length} characters</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {slides.map((s, i) => (
                <div key={i}>
                  <label style={{ ...labelStyle, color: B.teal }}>
                    Slide {i + 1}{i === 0 ? " — Hook" : i === slides.length - 1 ? " — Call to Action" : ""}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={
                      i === 0 ? "*Arizona families* are being left behind." :
                      i === 1 ? "Here's what's at stake…" :
                      i === 2 ? "The facts they don't want you to see…" :
                      "Take action. Visit azcoalition.org"
                    }
                    value={s}
                    onChange={e => updateSlide(i, e.target.value)}
                    style={{ ...inputStyle, fontSize: 15 }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Download button */}
          <button
            onClick={mode === "single" ? downloadSingle : downloadCarousel}
            disabled={downloading || (mode === "single" ? !singleText.trim() : !slides.some(s => s.trim()))}
            style={{
              ...btnPrimary, fontSize: 17, padding: "15px 24px",
              opacity: (downloading || (mode === "single" ? !singleText.trim() : !slides.some(s => s.trim()))) ? 0.5 : 1,
              cursor: (downloading || (mode === "single" ? !singleText.trim() : !slides.some(s => s.trim()))) ? "not-allowed" : "pointer",
            }}
          >
            {downloading
              ? "Generating…"
              : downloaded
              ? "✓ Downloaded!"
              : mode === "single"
              ? "↓ Download Card (PNG)"
              : "↓ Download All Slides"}
          </button>

          {mode === "carousel" && (
            <p style={{ fontSize: 13, color: B.textMute, marginTop: -10 }}>
              Each filled slide downloads as a separate PNG — saves to your device one at a time.
            </p>
          )}
        </div>

        {/* ── Right: Live Preview ── */}
        <div style={{ position: "sticky", top: 90 }}>
          <label style={{ ...labelStyle, marginBottom: 14 }}>Live Preview</label>
          {mode === "single" ? (
            <CanvasPreview
              text={singleText || "Your text will appear here.\n\nWrap *words* in asterisks to highlight them."}
              label={activeLabel}
              template={template}
              size={Math.min(380, 500)}
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(() => {
                const filledIndices = slides.map((s, i) => s.trim() ? i : null).filter(i => i !== null);
                const total = filledIndices.length;
                return slides.map((s, i) => {
                  const numberInSet = filledIndices.indexOf(i) + 1; // 0 if not filled
                  return (
                    <div key={i}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: B.textMute, marginBottom: 6, letterSpacing: "0.05em" }}>
                        SLIDE {i + 1}
                      </p>
                      <CanvasPreview
                        text={s || `Slide ${i + 1}`}
                        label={activeLabel}
                        template={template}
                        size={170}
                        slideIndex={numberInSet > 0 ? numberInSet : i + 1}
                        slideTotal={total > 0 ? total : slides.length}
                      />
                    </div>
                  );
                });
              })()}
            </div>
          )}
          <p style={{ fontSize: 12, color: B.textMute, marginTop: 12 }}>
            Downloads at 1080×1080px — optimized for Instagram, Facebook & Threads.
          </p>
        </div>
      </div>
    </div>
  );
}
