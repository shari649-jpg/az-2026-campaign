import { useState, useRef, useEffect, useId } from "react";

/**
 * HelpTooltip — the 🕵️‍♂️ help pop-up used throughout the Comms Hub.
 *
 * Tap/click the icon to open a small panel with page-specific help text.
 * Click outside, press Escape, or hit the × to close. Works the same on
 * touch and desktop (no hover-only behavior, so it holds up on mobile).
 *
 * Usage:
 *   import HelpTooltip from "../common/HelpTooltip";
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
 *   align     "start" | "center" | "end" (default "start") — horizontal anchor.
 *             Use "end" for triggers sitting near the right edge of the page
 *             (e.g. in a header) so the panel doesn't run off-screen.
 */
export default function HelpTooltip({ text, label = "Help", placement = "bottom", align = "start" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
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

  const vertical =
    placement === "top" ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" };

  const horizontal =
    align === "end" ? { right: 0 } :
    align === "center" ? { left: "50%", transform: "translateX(-50%)" } :
    { left: 0 };

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
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

      {open && (
        <div
          id={panelId}
          role="tooltip"
          className="fade-in"
          style={{
            position: "absolute",
            zIndex: 60,
            ...vertical,
            ...horizontal,
            width: "min(280px, 82vw)",
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
        </div>
      )}
    </span>
  );
}
