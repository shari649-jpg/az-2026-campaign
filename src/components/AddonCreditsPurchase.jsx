import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { startAddonCheckout, ADDON_CREDITS_PER_BATCH, ADDON_PRICE_PER_BATCH, ADDON_MAX_QUANTITY } from "../lib/creditTopUp";

const TEAL = "var(--teal)";

// Shared "Buy add-on credits" widget (Aug 2026, Batch 5 self-serve
// top-up) — used by both ProfilePage.jsx (org-of-one) and AdminPage.jsx's
// OrgAdminPanel (org admins, their own org) rather than duplicating the
// same quantity stepper + checkout-redirect + post-purchase polling logic
// in both places. create-checkout-session.mjs independently re-checks
// server-side who's actually allowed to buy "addon" credits — this
// component doesn't gate who SEES it; each caller only renders it where
// that's already known to be appropriate (see each caller's own comment).
//
// onRefreshBalance: async () => boolean — called on each poll tick after
// a successful redirect (?purchase=success). Must re-fetch the caller's
// own credit balance and return true once it detects the balance actually
// changed (so polling can stop early), or false otherwise. This
// component has no idea where/how each page stores its balance, so it
// can't do the re-fetch itself.
export default function AddonCreditsPurchase({ returnPath, onRefreshBalance }) {
  const { user } = useAuth();
  const location = useLocation();
  const [quantity, setQuantity] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);
  const [pollGaveUp, setPollGaveUp] = useState(false);
  const pollAttempts = useRef(0);

  const params = new URLSearchParams(location.search);
  const justSucceeded = params.get("purchase") === "success";
  const justCancelled = params.get("purchase") === "cancelled";

  // Same 2s/~30s polling shape as AuthGuard's PurchaseRequiredScreen —
  // Stripe's webhook is asynchronous and can genuinely land after the
  // browser is already back on this page, so a single refetch on mount
  // isn't reliable.
  useEffect(() => {
    if (!justSucceeded) return;
    setPolling(true);
    pollAttempts.current = 0;
    const interval = setInterval(async () => {
      pollAttempts.current += 1;
      const changed = await onRefreshBalance?.();
      if (changed) {
        clearInterval(interval);
        setPolling(false);
        return;
      }
      if (pollAttempts.current >= 15) { // ~30s at 2s intervals
        clearInterval(interval);
        setPolling(false);
        setPollGaveUp(true);
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justSucceeded]);

  async function handleBuy() {
    setPurchasing(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      await startAddonCheckout({ idToken, quantity, returnPath });
      // Redirects away on success — nothing else runs from here.
    } catch (err) {
      setError(err.message || "Couldn't start checkout.");
      setPurchasing(false);
    }
  }

  const totalCredits = quantity * ADDON_CREDITS_PER_BATCH;
  const totalPrice = quantity * ADDON_PRICE_PER_BATCH;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#888", marginBottom: 10 }}>
        Buy Add-On Credits
      </div>
      <p style={{ fontSize: 13, color: "#888", marginTop: 0, marginBottom: 12 }}>
        $0.03/credit, sold in 5,000-credit batches — no discount for buying more, just more batches.
      </p>

      {polling && (
        <div style={{ fontSize: 13, color: TEAL, marginBottom: 12 }}>⏳ Confirming your payment…</div>
      )}
      {pollGaveUp && (
        <div style={{ background: "#fff7ed", border: "1px solid #f5c842", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#7a4f00", marginBottom: 12 }}>
          Still waiting on confirmation from your bank/card — if you already completed checkout, wait a moment and refresh this page.
        </div>
      )}
      {justCancelled && !pollGaveUp && (
        <p style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>Checkout was cancelled — pick a quantity below to try again.</p>
      )}
      {error && (
        <div style={{ background: "#fdf2f2", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e", marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={purchasing || quantity <= 1}
            style={{ width: 30, height: 30, borderRadius: 6, border: "1.5px solid #ccc", background: "#fff", cursor: purchasing || quantity <= 1 ? "not-allowed" : "pointer", fontSize: 16, lineHeight: 1, fontFamily: "inherit" }}>
            −
          </button>
          <span style={{ minWidth: 28, textAlign: "center", fontWeight: 700 }}>{quantity}</span>
          <button type="button" onClick={() => setQuantity(q => Math.min(ADDON_MAX_QUANTITY, q + 1))} disabled={purchasing || quantity >= ADDON_MAX_QUANTITY}
            style={{ width: 30, height: 30, borderRadius: 6, border: "1.5px solid #ccc", background: "#fff", cursor: purchasing || quantity >= ADDON_MAX_QUANTITY ? "not-allowed" : "pointer", fontSize: 16, lineHeight: 1, fontFamily: "inherit" }}>
            +
          </button>
          <span style={{ fontSize: 13, color: "#888" }}>
            batch{quantity > 1 ? "es" : ""} ({totalCredits.toLocaleString()} credits)
          </span>
        </div>

        <button
          onClick={handleBuy}
          disabled={purchasing}
          style={{
            background: TEAL, color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 20px", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
            cursor: purchasing ? "not-allowed" : "pointer", opacity: purchasing ? 0.7 : 1,
          }}
        >
          {purchasing ? "…" : `Buy for $${totalPrice.toLocaleString()}`}
        </button>
      </div>
    </div>
  );
}
