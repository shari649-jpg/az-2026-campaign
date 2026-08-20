// src/lib/creditTopUp.js
// Shared "start an add-on credit top-up checkout" helper (Aug 2026,
// Batch 5). Used by both ProfilePage.jsx (org-of-one accounts) and
// AdminPage.jsx's OrgAdminPanel (org admins, for their own org) so the
// fetch/redirect logic isn't duplicated across both call sites.
//
// This is the "addon" pack from create-checkout-session.mjs — $0.03/
// credit, sold only in 5,000-credit batches, quantity multiplies
// linearly with no stepped discount, per the Aug 2026 pricing decision.
// Authorization (org-of-one OR org admin) is enforced server-side in
// create-checkout-session.mjs, not here — this helper doesn't gate who
// can call it, each page only renders the UI that calls it where that's
// already known to be appropriate.
export const ADDON_CREDITS_PER_BATCH = 5000;
export const ADDON_PRICE_PER_BATCH = 150; // dollars
export const ADDON_MAX_QUANTITY = 20; // mirrors create-checkout-session.mjs's MAX_ADDON_QUANTITY

export async function startAddonCheckout({ idToken, quantity, returnPath }) {
  const res = await fetch("/.netlify/functions/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, packId: "addon", quantity, returnPath }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error || "Couldn't start checkout.");
  }
  window.location.href = data.url; // full redirect to Stripe's hosted page
}
