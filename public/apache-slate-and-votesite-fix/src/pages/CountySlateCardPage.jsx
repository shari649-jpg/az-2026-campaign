// src/pages/CountySlateCardPage.jsx
//
// Fully public — no login, no AppShell. Reached via /county-pages/:slug
// (see App.jsx's public routes). Shows one county's slate card in a
// phone-first viewer that a voter can pull up quickly — a shareable link and
// a QR code both land here.
//
// LEGAL: the slate card's "Paid for by …" language is a legal requirement.
// This page never edits, crops, re-typesets, or overlays the card. It shows
// the county's own published pages as images rendered from their original
// PDF (full page, uncropped), and offers the untouched original PDF for
// download. Do not add anything that covers or trims the card image.
//
// Data (which counties have a card, file paths, alt text) lives in
// src/data/countyMaterials.js — see the how-to at the top of that file.
//
// Design intent: discreet and fast. Minimal chrome, plain white page, the
// card is the whole page. Everything else (share link / QR) is tucked into
// a collapsed section below the card so it doesn't crowd the card for a
// voter who just wants to read it.
//
// Language: ?lang=es (or ?lang=en) in the URL wins; otherwise Spanish is
// chosen if the phone's language is Spanish; otherwise the first page. The
// toggle updates the URL, so the share link / QR always points at the
// language currently showing.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { COUNTY_MATERIALS } from "../data/countyMaterials";

export default function CountySlateCardPage() {
  const { slug } = useParams();
  const entry = COUNTY_MATERIALS[slug];
  const card = entry?.slateCard;

  useEffect(() => {
    const prev = document.title;
    document.title = card ? `Slate Card ${card.year} · ${entry.countyName} County` : "Slate Card";
    return () => { document.title = prev; };
  }, [card, entry]);

  if (!card) return <NotFound />;
  return <CardViewer slug={slug} entry={entry} card={card} />;
}

function NotFound() {
  return (
    <Shell>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--purple)", margin: "0 0 10px" }}>
        No slate card here yet
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-mid)", margin: "0 0 20px" }}>
        This county hasn't added a slate card. You can still find its website on the County Pages list.
      </p>
      <Link to="/county-pages" style={primaryBtn}>← County Pages</Link>
    </Shell>
  );
}

function CardViewer({ slug, entry, card }) {
  const [params, setParams] = useSearchParams();
  // Each page has an `id` (defaults to its lang, so Mohave is unchanged).
  // `card.param` is the URL parameter that selects a page: "lang" by default,
  // "side" for a card whose pages are front/back rather than languages.
  const param = card.param || "lang";
  const isLangToggle = param === "lang";
  const idOf = p => p.id || p.lang;
  const pageId = useMemo(() => {
    const ids = card.pages.map(idOf);
    const fromUrl = params.get(param);
    if (fromUrl && ids.includes(fromUrl)) return fromUrl;
    const phone = (typeof navigator !== "undefined" && navigator.language) || "en";
    if (isLangToggle && phone.toLowerCase().startsWith("es") && ids.includes("es")) return "es";
    return ids[0];
  }, [params, card, param, isLangToggle]);

  const page = card.pages.find(p => idOf(p) === pageId) || card.pages[0];
  const lang = page.lang;
  const [zoomed, setZoomed] = useState(false);

  function chooseLang(next) {
    const p = new URLSearchParams(params);
    p.set(param, next);
    setParams(p, { replace: true });
  }

  const isEs = lang === "es";
  const t = isEs
    ? { back: "Páginas de condados", zoomIn: "Ampliar", zoomOut: "Reducir", pdf: "Abrir PDF", hint: "Pellizque para ampliar, o use el botón Ampliar.", title: "Tarjeta de Candidatos", county: "Condado de", share: "Compartir esta tarjeta" }
    : { back: "County Pages", zoomIn: "Zoom in", zoomOut: "Zoom out", pdf: "Open PDF", hint: "Pinch to zoom, or use the Zoom button.", title: "Slate Card", county: "County", share: "Share this card" };

  return (
    <Shell wide>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <Link to="/county-pages" style={{ fontSize: 14, fontWeight: 700, color: "var(--teal)", textDecoration: "none", padding: "8px 0" }}>
          ← {t.back}
        </Link>
        {card.pages.length > 1 && (
          <div role="group" aria-label={isLangToggle ? "Language" : "Card side"} style={{ display: "inline-flex", border: "2px solid var(--purple)", borderRadius: 10, overflow: "hidden" }}>
            {card.pages.map(p => (
              <button
                key={idOf(p)}
                type="button"
                onClick={() => chooseLang(idOf(p))}
                aria-pressed={idOf(p) === pageId}
                lang={p.lang}
                style={{
                  fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer",
                  padding: "8px 16px", border: "none",
                  background: idOf(p) === pageId ? "var(--purple)" : "#fff",
                  color: idOf(p) === pageId ? "#fff" : "var(--purple)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--purple)", margin: "0 0 4px", lineHeight: 1.25 }}>
        {t.title} {card.year}
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-mute)", margin: "0 0 12px", lineHeight: 1.4 }}>
        {entry.committee}
      </p>

      {/* The card. Full page, uncropped, nothing overlaid. */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflowX: zoomed ? "auto" : "hidden", background: "#fff", WebkitOverflowScrolling: "touch" }}>
        <img
          key={page.image}
          src={page.image}
          alt={page.alt}
          lang={page.lang}
          width={page.width}
          height={page.height}
          style={{ display: "block", width: zoomed ? "200%" : "100%", maxWidth: "none", height: "auto" }}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "14px 0 6px" }}>
        <button type="button" onClick={() => setZoomed(z => !z)} aria-pressed={zoomed} style={secondaryBtn}>
          {zoomed ? t.zoomOut : t.zoomIn}
        </button>
        {card.pdf && (
          <a href={card.pdf} target="_blank" rel="noreferrer" style={secondaryBtn}>
            {t.pdf} ↗
          </a>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-mute)", margin: "0 0 22px" }}>{t.hint}</p>

      <SharePanel slug={slug} param={param} pageId={pageId} label={t.share} isEs={isEs} />
    </Shell>
  );
}

function SharePanel({ slug, param, pageId, label, isEs }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/county-pages/${slug}?${param}=${pageId}` : "";
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then(d => { if (!cancelled) setQr(d); })
      .catch(() => { if (!cancelled) setQr(null); });
    return () => { cancelled = true; };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      inputRef.current?.select();
      try { document.execCommand("copy"); } catch { /* user can copy manually */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    try { await navigator.share({ title: document.title, url }); } catch { /* cancelled */ }
  }

  const words = isEs
    ? { link: "Enlace a esta tarjeta", copy: "Copiar enlace", copied: "Copiado ✓", share: "Compartir…", qr: "Código QR", dl: "Descargar código QR", note: "El enlace y el código QR abren la tarjeta en el idioma que se muestra arriba." }
    : { link: "Link to this card", copy: "Copy link", copied: "Copied ✓", share: "Share…", qr: "QR code", dl: "Download QR code", note: param === "lang"
        ? "The link and QR code open the card in the language showing above. Switch languages above to get the other one."
        : "The link and QR code open the side of the card showing above. Switch sides above to get the other one." };

  return (
    <details style={{ border: "2px solid var(--surface-alt)", borderRadius: 10, padding: "0 16px", background: "#fff" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--purple)", padding: "14px 0", fontSize: 15 }}>
        {label}
      </summary>
      <div style={{ padding: "0 0 18px" }}>
        <label htmlFor="slate-link" style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-mid)", marginBottom: 6 }}>
          {words.link}
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <input
            id="slate-link"
            ref={inputRef}
            readOnly
            value={url}
            onFocus={e => e.target.select()}
            style={{ flex: "1 1 220px", minWidth: 0, fontSize: 15, padding: "10px 12px", border: "2px solid var(--border)", borderRadius: 8, fontFamily: "inherit", color: "var(--text)" }}
          />
          <button type="button" onClick={copy} style={secondaryBtn}>{copied ? words.copied : words.copy}</button>
          {canShare && <button type="button" onClick={share} style={secondaryBtn}>{words.share}</button>}
        </div>

        {qr && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-mid)", marginBottom: 8 }}>{words.qr}</div>
            <img src={qr} alt={`${words.qr}: ${url}`} width={220} height={220} style={{ display: "inline-block", border: "1px solid var(--border)", borderRadius: 6 }} />
            <div style={{ marginTop: 10 }}>
              <a href={qr} download={`${slug}-slate-card-${pageId}-qr.png`} style={secondaryBtn}>{words.dl}</a>
            </div>
          </div>
        )}
        <p style={{ fontSize: 12.5, color: "var(--text-mute)", lineHeight: 1.5, margin: "14px 0 0" }}>{words.note}</p>
      </div>
    </details>
  );
}

function Shell({ children, wide }) {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "var(--text)", fontFamily: "var(--font-body)" }}>
      <main style={{ maxWidth: wide ? 820 : 560, margin: "0 auto", padding: "16px 16px 48px" }}>
        {children}
      </main>
    </div>
  );
}

const primaryBtn = {
  display: "inline-block", fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: "#fff",
  background: "var(--purple)", textDecoration: "none", padding: "12px 20px", borderRadius: 10,
};

const secondaryBtn = {
  display: "inline-block", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer",
  color: "var(--purple)", background: "#fff", textDecoration: "none",
  padding: "10px 16px", border: "2px solid var(--purple)", borderRadius: 10,
};
