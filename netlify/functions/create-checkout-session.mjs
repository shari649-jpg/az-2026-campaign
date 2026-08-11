// netlify/functions/create-checkout-session.mjs
//
// WHAT THIS DOES (Aug 2026, individual-tier build)
// ────────────────────────────────────────────────────────────────────────
// Creates a real Stripe Checkout Session (mode: "payment" — one-time, not
// a subscription, per the Aug 2026 pricing decision: individual accounts
// buy credit packs outright, no recurring commitment) and returns its
// hosted URL for the client to redirect to.
//
// Used by TWO different screens that turn out to need identical logic:
//   1. A brand-new individual signup finishing account creation
//      (requiresPurchase: true, set by provision-account.mjs).
//   2. Someone reactivated by an Admin without an org
//      (requiresPurchase: true, set by manage-user.mjs's reactivation
//      action). Same flag, same screen, same checkout — see AuthGuard.jsx.
//
// PRICING IS SERVER-SIDE, ALWAYS — never trust a client-supplied price or
// credit amount. The client sends only a packId; CREDIT_PACKS below is the
// single source of truth for what that actually costs and grants. This
// matters doubly here since Checkout Sessions carry metadata (packId,
// credits) that the webhook trusts when it actually grants credits later —
// if a price could be client-supplied, someone could buy 5,000 credits
// for a penny.
//
// STRIPE CUSTOMER REUSE — every org (including an individual's "org of
// one") gets AT MOST one Stripe Customer, stored as
// orgs/{orgId}.stripeCustomerId. Without this, every purchase would
// create a fresh, disconnected Customer object in Stripe, making it
// impossible to see someone's purchase history as one person over time.
//
// Auth: any signed-in user — this isn't Manager/Admin-gated, since both
// callers above are ordinary individual accounts making their own
// purchase. Still passes through the same daily rate-limit abuse guard
// every other tool uses, even though a Checkout Session costs nothing to
// create unless someone actually completes payment.
//
// Modern Netlify Functions runtime (ESM).

import admin from "firebase-admin";
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";

const ALLOWED_ORIGINS = [
  "https://arizonacoalition.net",
  "https://az-coalition-2026-election.netlify.app",
];
function corsHeaders(req) {
  const origin = req.headers.get("origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin };
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(new URL("./firebase-service-account.json", import.meta.url), "utf8"));
  } catch {
    throw new Error("firebase-service-account.json not found — run `npm run build` to regenerate via scripts/inject-secrets.mjs.");
  }
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function requireSignedIn(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  return admin.auth(app).verifyIdToken(idToken);
}

// ── Credit packs (Aug 2026 pricing decision) ──────────────────────────
// The ONLY source of truth for price/credits. amountCents is what Stripe
// actually charges; never derived from anything client-supplied.
const CREDIT_PACKS = {
  starter:  { name: "Starter Pack — 500 credits",   credits: 500,  amountCents: 2000  }, // $20.00, $0.040/credit
  standard: { name: "Standard Pack — 2,000 credits", credits: 2000, amountCents: 7000  }, // $70.00, $0.035/credit
  value:    { name: "Value Pack — 5,000 credits",    credits: 5000, amountCents: 15000 }, // $150.00, $0.030/credit
};

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders(req), "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[create-checkout-session] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("[create-checkout-session] STRIPE_SECRET_KEY not configured.");
    return new Response(JSON.stringify({ error: "Payments aren't configured yet. Contact an Administrator." }), { status: 500, headers: corsHeaders(req) });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;
    const packId = body.packId;

    if (!CREDIT_PACKS[packId]) {
      return new Response(JSON.stringify({ error: `Unknown pack "${packId}". Valid packs: ${Object.keys(CREDIT_PACKS).join(", ")}.` }), { status: 400, headers: corsHeaders(req) });
    }
    const pack = CREDIT_PACKS[packId];

    let decoded;
    try {
      decoded = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ error: "You must be signed in to purchase credits." }), { status: 401, headers: corsHeaders(req) });
    }
    const uid = decoded.uid;

    // Abuse guard only — a Checkout Session costs nothing to create
    // unless someone actually pays, but this is still a real external API
    // call, not something to leave completely unthrottled.
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    const db = admin.firestore(app);
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
      return new Response(JSON.stringify({ error: "No profile found for this account." }), { status: 404, headers: corsHeaders(req) });
    }
    const userData = userSnap.data();
    const orgId = userData.orgId;
    if (!orgId) {
      // Shouldn't happen by the time someone reaches a purchase screen —
      // every account has an orgId (their own org-of-one, or a real org)
      // by the time provision-account.mjs finishes. Fail closed rather
      // than guess what org to credit.
      return new Response(JSON.stringify({ error: "Your account isn't fully set up yet. Contact an Administrator." }), { status: 400, headers: corsHeaders(req) });
    }

    const orgRef = db.doc(`orgs/${orgId}`);
    const orgSnap = await orgRef.get();
    const orgData = orgSnap.exists ? orgSnap.data() : null;

    // Reuse an existing Stripe Customer for this org if one exists —
    // otherwise every purchase creates a disconnected Customer object,
    // making purchase history impossible to see as one person over time.
    let stripeCustomerId = orgData?.stripeCustomerId || null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: decoded.email || userData.email || undefined,
        name: userData.fullName || undefined,
        metadata: { uid, orgId },
      });
      stripeCustomerId = customer.id;
      await orgRef.set({ stripeCustomerId }, { merge: true });
    }

    const siteUrl = process.env.SITE_URL || "https://arizonacoalition.net";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: pack.name },
          unit_amount: pack.amountCents,
        },
        quantity: 1,
      }],
      // Read back verbatim by stripe-webhook.mjs when the purchase
      // completes — this is how the webhook knows who to credit and how
      // much, without trusting anything the client says at that point
      // (the client isn't even part of that later request; Stripe calls
      // the webhook directly).
      metadata: { uid, orgId, packId, credits: String(pack.credits) },
      success_url: `${siteUrl}/?purchase=success`,
      cancel_url: `${siteUrl}/?purchase=cancelled`,
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[create-checkout-session] error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
