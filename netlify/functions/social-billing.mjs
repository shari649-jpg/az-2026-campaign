// netlify/functions/social-billing.mjs
//
// Billing for the Social Posting feature: $5 / profile / month, a real Stripe
// SUBSCRIPTION (mode "subscription"), not the one-time credit packs that
// create-checkout-session.mjs sells.
//
// ACTIONS (POST JSON, signed-in user):
//   { action: "checkout", quantity }  → Stripe Checkout URL for a new subscription
//   { action: "add_profile" }         → +1 profile on an ACTIVE subscription
//                                       (prorated; no new checkout needed)
//   { action: "portal" }              → Stripe billing-portal URL (cancel,
//                                       update card, invoices)
//
// This function never marks anything active. Only the Stripe webhook does
// (socialPostingWebhook.mjs) after Stripe confirms payment — so a user can't
// unlock posting by calling this endpoint, hitting the success URL, or
// editing anything in the browser.
//
// PRICE IS SERVER-SIDE: the client sends only a quantity, bounded 1..MAX_PROFILES.

import admin from "firebase-admin";
import Stripe from "stripe";
import {
  corsHeaders, reply, getAdminApp, requireSignedIn,
  PRICE_PER_PROFILE_CENTS, MAX_PROFILES,
} from "./socialPostingHelper.mjs";

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[social-billing] admin init:", err.message);
    return reply(req, 500, { error: "Server configuration error." });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("[social-billing] STRIPE_SECRET_KEY not configured.");
    return reply(req, 500, { error: "Payments aren't configured yet. Contact an Administrator." });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    let decoded;
    try { decoded = await requireSignedIn(app, req, body.idToken); }
    catch { return reply(req, 401, { error: "You must be signed in." }); }
    const uid = decoded.uid;

    const db = admin.firestore(app);
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) return reply(req, 404, { error: "No profile found for this account." });
    const userData = userSnap.data();
    if (userData.disabled === true) return reply(req, 403, { error: "This account is disabled." });

    const ref = db.doc(`socialPosting/${uid}`);
    const social = (await ref.get()).data() || {};
    const siteUrl = process.env.SITE_URL || "https://arizonacoalition.net";

    // ── per-user Stripe Customer (see socialPostingHelper.mjs header on why
    //    this is NOT the org's shared customer) ─────────────────────────────
    async function ensureCustomer() {
      if (social.stripeCustomerId) return social.stripeCustomerId;
      const customer = await stripe.customers.create({
        email: decoded.email || userData.email || undefined,
        name: userData.fullName || undefined,
        metadata: { uid, kind: "social_posting" },
      });
      await ref.set({ stripeCustomerId: customer.id }, { merge: true });
      return customer.id;
    }

    // ── checkout ──────────────────────────────────────────────────────────
    if (body.action === "checkout") {
      if (social.status === "active" || social.status === "past_due") {
        return reply(req, 409, { error: social.status === "past_due"
          ? "Your last payment didn't go through. Use Manage billing to update your card."
          : "You already have an active subscription. Use Add a profile to add more." });
      }
      const quantity = Number.parseInt(body.quantity, 10);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PROFILES) {
        return reply(req, 400, { error: `Choose between 1 and ${MAX_PROFILES} profiles.` });
      }
      const customer = await ensureCustomer();

      // Double-subscription guard: our Firestore doc can lag Stripe by a few
      // seconds (webhook delay). If Stripe already has a live Social Posting
      // subscription for this customer, don't start a second one.
      const existing = await stripe.subscriptions.list({ customer, status: "all", limit: 20 });
      const live = existing.data.find((s) =>
        s.metadata?.kind === "social_posting" && ["active", "trialing", "past_due", "incomplete", "unpaid"].includes(s.status));
      if (live) {
        return reply(req, 409, { error: live.status === "incomplete"
          ? "A checkout is already in progress for your account. Finish it, or wait a few minutes and try again."
          : "You already have a Social Posting subscription — give it a moment to appear, or refresh this page." });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "Social Posting — per profile" },
            unit_amount: PRICE_PER_PROFILE_CENTS,
            recurring: { interval: "month" },
          },
          quantity,
        }],
        // Read back by socialPostingWebhook.mjs. Set on BOTH the session and
        // the subscription: later subscription.* events carry only the
        // subscription's metadata.
        metadata: { uid, kind: "social_posting", quantity: String(quantity) },
        subscription_data: { metadata: { uid, kind: "social_posting" } },
        success_url: `${siteUrl}/profile?social=success`,
        cancel_url: `${siteUrl}/profile?social=cancelled`,
      });
      return reply(req, 200, { url: session.url });
    }

    // ── add one more profile to an active subscription ────────────────────
    if (body.action === "add_profile") {
      if (social.status !== "active" || !social.stripeSubscriptionId) {
        return reply(req, 409, { error: "You need an active subscription first." });
      }
      if (social.cancelAtPeriodEnd) {
        return reply(req, 409, { error: "Your subscription is set to cancel. Resume it in Manage billing before adding profiles." });
      }
      const current = Number(social.profilesPaid) || 1;
      if (current >= MAX_PROFILES) {
        return reply(req, 400, { error: `You've reached the maximum of ${MAX_PROFILES} profiles.` });
      }
      const sub = await stripe.subscriptions.retrieve(social.stripeSubscriptionId);
      const item = sub.items?.data?.[0];
      if (!item) return reply(req, 500, { error: "Couldn't find your subscription item." });
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, quantity: current + 1 }],
        proration_behavior: "create_prorations",
      });
      // profilesPaid is updated by the webhook (customer.subscription.updated),
      // not here — one place decides what's paid for.
      return reply(req, 200, { ok: true, requested: current + 1 });
    }

    // ── billing portal (cancel / card / invoices) ─────────────────────────
    if (body.action === "portal") {
      if (!social.stripeCustomerId) return reply(req, 404, { error: "No billing account yet." });
      const portal = await stripe.billingPortal.sessions.create({
        customer: social.stripeCustomerId,
        return_url: `${siteUrl}/profile`,
      });
      return reply(req, 200, { url: portal.url });
    }

    return reply(req, 400, { error: "Unknown action." });
  } catch (err) {
    console.error("[social-billing] error:", err);
    // Stripe's own messages are safe to show (they mask keys) and are what
    // actually tells you what to fix; anything else gets only a short code.
    const detail = typeof err?.type === "string" && err.type.startsWith("Stripe") && err.message
      ? `Stripe said: ${String(err.message).slice(0, 300)}`
      : (err?.code ? `Error code: ${String(err.code).slice(0, 60)}` : "");
    return reply(req, 500, { error: `Something went wrong with billing. Please try again.${detail ? " " + detail : ""}` });
  }
}
