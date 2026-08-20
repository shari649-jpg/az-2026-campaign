// netlify/functions/stripe-webhook.mjs
//
// WHAT THIS DOES (Aug 2026, individual-tier build)
// ────────────────────────────────────────────────────────────────────────
// Stripe calls this directly when a Checkout Session completes — there's
// no Firebase ID token involved at all (Stripe isn't a signed-in user of
// this app). The ENTIRE trust boundary here is the Stripe signature
// verification below; nothing else gates this endpoint. Get that wrong
// and anyone on the internet can POST a fake "payment succeeded" event
// and grant themselves free credits — this is the single most
// security-sensitive function in the individual-tier build, more so than
// anything auth-token-based, because there's no token to check at all.
//
// SIGNATURE VERIFICATION REQUIRES THE RAW BODY — this is the one function
// in this codebase that must NOT call req.json() before verifying.
// Stripe signs the exact raw bytes it sent; JSON.stringify(JSON.parse(x))
// is not guaranteed to reproduce those bytes byte-for-byte (key order,
// whitespace), so parsing first and re-verifying against the parsed-then-
// re-stringified version would silently break verification. req.text()
// is called first and that exact string is what gets passed to
// stripe.webhooks.constructEvent() — never JSON.parse'd before that call.
//
// IDEMPOTENCY — Stripe explicitly documents at-least-once delivery: the
// same event can arrive more than once (retries, redelivery). Without a
// guard, a person's card could get charged once but their account
// credited twice. processedStripeEvents/{event.id} is written inside the
// SAME transaction as the credit grant — if an event's ID is already
// there, this returns 200 immediately and does nothing else, rather than
// re-crediting. See firestore.rules — this collection is Admin-
// SDK-only, `allow write: if false` for clients, same audit-trail pattern
// as orgs/{orgId}/creditGrants.
//
// PRICING IS RE-VALIDATED, NOT JUST TRUSTED FROM METADATA — the credits
// amount in session.metadata was set by THIS APP at checkout-creation
// time (create-checkout-session.mjs), not by the payer, so it isn't
// attacker-controlled in any normal flow. Still cross-checked against the
// same CREDIT_PACKS table as a defense-in-depth integrity check (same
// instinct as this app's vote-count integrity check elsewhere) — a
// mismatch is logged as a warning and the AUTHORITATIVE table value is
// used, not metadata's, but doesn't block crediting a real paying
// customer over what's more likely a bug than an attack.
//
// Modern Netlify Functions runtime (ESM).

import admin from "firebase-admin";
import Stripe from "stripe";
import { readFileSync } from "node:fs";

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

// Same authoritative pack table as create-checkout-session.mjs — kept in
// sync manually (two files, not a shared import) since one is browser-
// reachable business logic and this one is a webhook; duplicating a
// small constant table is a smaller risk than the two ever needing to
// diverge in structure. If a pack is ever added/changed, update BOTH.
const CREDIT_PACKS = {
  starter:  { credits: 500,  amountCents: 2000  },
  standard: { credits: 2000, amountCents: 7000  },
  value:    { credits: 5000, amountCents: 15000 },
  // "addon" (Aug 2026) — see create-checkout-session.mjs's header on why
  // this is separate from the three above, and why it's the only pack
  // where session.metadata.quantity can be >1.
  addon:    { credits: 5000, amountCents: 15000 },
};

export default async function (req) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not configured.");
    return new Response("Server configuration error.", { status: 500 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[stripe-webhook] admin init:", err.message);
    return new Response("Server configuration error.", { status: 500 });
  }

  // Raw body FIRST, before anything else touches the request — see file
  // header. The signature covers these exact bytes.
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err.message);
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  const db = admin.firestore(app);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { uid, orgId, packId } = session.metadata || {};

      if (!uid || !orgId || !packId || !CREDIT_PACKS[packId]) {
        console.error(`[stripe-webhook] checkout.session.completed with missing/invalid metadata — session ${session.id}, metadata:`, session.metadata);
        // Still 200 — this is a data problem on our side (a session that
        // somehow didn't get proper metadata), not something Stripe
        // should keep retrying forever. Logged loudly for manual follow-up.
        return new Response(JSON.stringify({ received: true, warning: "missing metadata, not processed" }), { status: 200 });
      }

      const pack = CREDIT_PACKS[packId];
      // Quantity (Aug 2026, "addon" pack only) — defaults to 1 for the
      // three original packs, which never send this field at all.
      // Same not-attacker-controlled reasoning as credits/packId above:
      // this was set by create-checkout-session.mjs, not the payer.
      const quantity = Math.max(1, Number.parseInt(session.metadata.quantity, 10) || 1);
      const totalCredits = pack.credits * quantity;
      const totalAmountCents = pack.amountCents * quantity;

      // Defense-in-depth cross-check — see file header. Warn, don't block.
      const metadataCredits = Number(session.metadata.credits) * quantity;
      if (metadataCredits !== totalCredits) {
        console.warn(`[stripe-webhook] metadata.credits×quantity (${metadataCredits}) doesn't match CREDIT_PACKS["${packId}"].credits×quantity (${totalCredits}) for session ${session.id} — using the authoritative table value.`);
      }
      if (typeof session.amount_total === "number" && session.amount_total !== totalAmountCents) {
        console.warn(`[stripe-webhook] session.amount_total (${session.amount_total}) doesn't match CREDIT_PACKS["${packId}"].amountCents×quantity (${totalAmountCents}) for session ${session.id}.`);
      }

      const orgRef = db.doc(`orgs/${orgId}`);
      const userRef = db.doc(`users/${uid}`);
      const eventRef = db.doc(`processedStripeEvents/${event.id}`);
      const grantRef = orgRef.collection("creditGrants").doc();

      await db.runTransaction(async (tx) => {
        const eventSnap = await tx.get(eventRef);
        if (eventSnap.exists) {
          // Already processed — Stripe's at-least-once delivery means
          // this is expected, not an error. No-op.
          return;
        }
        // Nested object, NOT a dotted string key — see grant-credits.mjs's
        // Aug 5 bug-fix note on why this specific shape matters: Firestore
        // stores { "credits.generationBalance": x } as a literal field
        // NAMED "credits.generationBalance", not a nested map, which was
        // invisible to every read site expecting a real nested object.
        tx.set(orgRef, { credits: { generationBalance: admin.firestore.FieldValue.increment(totalCredits) } }, { merge: true });
        tx.set(userRef, { requiresPurchase: false }, { merge: true });
        tx.set(grantRef, {
          amount: totalCredits,
          creditType: "generation",
          reason: quantity > 1 ? `Credit pack purchase (${packId} × ${quantity})` : `Credit pack purchase (${packId})`,
          source: "stripe_purchase",
          stripeSessionId: session.id,
          stripeEventId: event.id,
          stripeCustomerId: session.customer || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(eventRef, {
          type: event.type,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log(`[stripe-webhook] credited ${totalCredits} generation credits to org ${orgId} (uid ${uid}, session ${session.id}, pack ${packId} × ${quantity}).`);
    } else {
      // Every other event type — acknowledged, no-op. Logged so it's
      // visible in Netlify's logs if something unexpected starts arriving
      // (e.g. checkout.session.expired, which isn't handled specially
      // yet — an abandoned checkout just leaves requiresPurchase true,
      // which is correct: nothing was paid, nothing should unlock).
      console.log(`[stripe-webhook] received unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (err) {
    console.error("[stripe-webhook] processing error:", err);
    // 500 here is deliberate — Stripe will retry a 5xx, which is what we
    // want for a real processing failure (vs. the 200-with-warning cases
    // above, which are data problems that retrying won't fix).
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
