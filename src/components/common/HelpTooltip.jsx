import { useState, useRef, useEffect, useLayoutEffect, useId } from "react";
import { createPortal } from "react-dom";

const PANEL_WIDTH = 280;
const GAP = 8;
const EDGE_MARGIN = 8;

/**
 * HelpTooltip — the 🕵️‍♂️ help pop-up used throughout the Comms Hub.
 *
 * Tap/click the icon to open a small panel with page-specific help text.
 * Click outside, press Escape, or hit the × to close. Works the same on
 * touch and desktop (no hover-only behavior, so it holds up on mobile).
 *
 * The panel renders in a portal (document.body) with fixed positioning
 * calculated from the trigger's on-screen location — not as an absolutely
 * positioned child of the trigger. This matters because several cards in
 * the app (e.g. PlatformCard) use `overflow: hidden` for rounded corners;
 * a normal absolutely-positioned popover would get clipped the moment it
 * tried to extend past that container's edge. Portaling to <body> sidesteps
 * that entirely, and it also guarantees the panel always renders above
 * everything else regardless of local z-index/stacking contexts.
 *
 * Usage:
 *   import HelpTooltip from "../../components/common/HelpTooltip";
 *   import { HELP } from "../../lib/helpContent";
 *
 *   <label>
 *     Issue
 *     <HelpTooltip text={HELP.messageMachine.issue} label="Help: Issue field" />
 *   </label>
 *
 * Props:
 *   text      (required) string or node — the help copy shown in the panel.
 *   label     accessible name for the trigger button, e.g. "Help: Issue field".
 *             Defaults to "Help" — worth overriding on pages with several
 *             tooltips so screen-reader users can tell them apart.
 *   placement "top" | "bottom" (default "bottom") — which side the panel opens on.
 *   align     "start" | "center" | "end" (default "start") — horizontal anchor,
 *             relative to the trigger icon itself. Use "end" for triggers
 *             sitting near the right edge of the page (e.g. in a header) so
 *             the panel doesn't run off-screen. The panel also clamps itself
 *             to stay fully on-screen regardless of this setting.
 */
export default function HelpTooltip({ text, label = "Help", placement = "bottom", align = "start" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();

  const updatePosition = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(PANEL_WIDTH, vw - EDGE_MARGIN * 2);

    let left =
      align === "end" ? rect.right - width :
      align === "center" ? rect.left + rect.width / 2 - width / 2 :
      rect.left;
    left = Math.max(EDGE_MARGIN, Math.min(left, vw - width - EDGE_MARGIN));

    const growUp = placement === "top";
    const top = growUp ? rect.top - GAP : rect.bottom + GAP;

    setCoords({ top, left, width, growUp });
  };

  // Recalculate whenever it opens, and keep it glued to the trigger while
  // open (page scroll, window resize, a modal above it scrolling, etc).
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align, placement]);

  useEffect(() => {
    if (!open) return;

    function handleOutside(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          marginLeft: 4,
          fontSize: 14,
          lineHeight: 1,
          background: open ? "var(--teal-light)" : "transparent",
          border: `1.5px solid ${open ? "var(--teal)" : "var(--border)"}`,
          borderRadius: "50%",
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      >
        <span aria-hidden="true">🕵️‍♂️</span>
      </button>

      {open && coords && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="tooltip"
          className="fade-in"
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            width: coords.width,
            transform: coords.growUp ? "translateY(-100%)" : "none",
            zIndex: 1000,
            background: "#fff",
            color: "var(--text)",
            border: "1.5px solid var(--teal)",
            borderTop: "4px solid var(--gold)",
            borderRadius: "var(--radius)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
            padding: "12px 30px 12px 14px",
            fontSize: 13,
            lineHeight: 1.55,
            fontFamily: "var(--font-body)",
          }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              setOpen(false);
              btnRef.current?.focus();
            }}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              border: "none",
              background: "transparent",
              color: "var(--text-mute)",
              cursor: "pointer",
              fontSize: 15,
              lineHeight: 1,
            }}
          >
            ×
          </button>
          {text}
        </div>,
        document.body
      )}
    </span>
  );
}
