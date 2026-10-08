// netlify/functions/socialPostingWebhook.mjs
//
// Stripe → socialPosting/{uid}. Called from stripe-webhook.mjs BEFORE its
// credit-pack logic; returns { handled: true } for Social Posting events so
// the credit-pack code never sees them, and { handled: false } for
// everything else (the existing flow is untouched).
//
// EVENTS HANDLED (all must be enabled on the Stripe webhook endpoint):
//   checkout.session.completed      (only mode "subscription" + metadata.kind "social_posting")
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//
// This is the ONLY code that sets socialPosting/{uid}.status. A payment
// that fails or is refunded flips status away from "active" via
// customer.subscription.updated, and social-publish.mjs re-reads status on
// every call, so posting locks as soon as this runs.
//
// IDEMPOTENCY: every event id is recorded in processedStripeEvents/{id}
// inside the same transaction as the write (same pattern as the credit-pack
// path). STALE EVENTS: Stripe doesn't guarantee ordering, so subscription.*
// writes are skipped if a newer one was already applied (lastSubEventCreated).

import admin from "firebase-admin";
import { mapStripeStatus, MAX_PROFILES, uploadPostRequest } from "./socialPostingHelper.mjs";

const SUB_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function clampQty(n) {
  const q = Number.parseInt(n, 10);
  if (!Number.isInteger(q)) return 1;
  return Math.min(MAX_PROFILES, Math.max(1, q));
}

export async function handleSocialPostingEvent(db, event) {
  const obj = event.data.object;
  const isCheckout =
    event.type === "checkout.session.completed" &&
    obj.mode === "subscription" &&
    obj.metadata?.kind === "social_posting";
  const isSub = SUB_EVENTS.has(event.type) && obj.metadata?.kind === "social_posting";
  if (!isCheckout && !isSub) return { handled: false };

  const uid = obj.metadata?.uid;
  if (!uid) {
    console.error(`[social-webhook] ${event.type} ${obj.id} has kind=social_posting but no uid — not processed.`);
    return { handled: true };
  }

  let update;
  if (isCheckout) {
    // A session can complete before the money has actually arrived (delayed
    // payment methods). Only unlock on "paid"; the subscription.updated event
    // covers the delayed case.
    if (obj.payment_status !== "paid") {
      console.log(`[social-webhook] checkout ${obj.id} completed with payment_status=${obj.payment_status}; waiting for subscription event.`);
      return { handled: true };
    }
    update = {
      status: "active",
      profilesPaid: clampQty(obj.metadata.quantity),
      stripeSubscriptionId: obj.subscription || null,
      stripeCustomerId: obj.customer || null,
    };
  } else {
    const periodEnd = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end ?? null;
    update = {
      status: event.type === "customer.subscription.deleted" ? "canceled" : mapStripeStatus(obj.status),
      profilesPaid: clampQty(obj.items?.data?.[0]?.quantity),
      stripeSubscriptionId: obj.id,
      stripeCustomerId: obj.customer || null,
      cancelAtPeriodEnd: !!obj.cancel_at_period_end,
      currentPeriodEnd: periodEnd ? admin.firestore.Timestamp.fromMillis(periodEnd * 1000) : null,
    };
  }

  const socialRef = db.doc(`socialPosting/${uid}`);
  const eventRef = db.doc(`processedStripeEvents/${event.id}`);

  let applied = false;
  await db.runTransaction(async (tx) => {
    const [eventSnap, socialSnap] = await Promise.all([tx.get(eventRef), tx.get(socialRef)]);
    if (eventSnap.exists) return; // already processed

    // Stale guard applies to the checkout event too: a late-delivered
    // checkout.session.completed must not flip a later past_due/canceled
    // back to active. The subscription.* events carry the same information.
    const existing = socialSnap.data() || {};
    const stale = existing.lastSubEventCreated && event.created < existing.lastSubEventCreated;
    if (!stale) {
      tx.set(socialRef, {
        ...update,
        lastSubEventCreated: event.created,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      applied = true;
    } else {
      console.log(`[social-webhook] skipping stale ${event.type} (${event.created} < ${existing.lastSubEventCreated}) for uid ${uid}.`);
    }
    tx.set(eventRef, { type: event.type, processedAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  if (applied) console.log(`[social-webhook] ${event.type} applied for uid ${uid}: status=${update.status}, profiles=${update.profilesPaid}.`);

  // When a subscription is finally deleted, free the Upload-Post profile
  // slots (they're a limited, paid-for resource). Best-effort: a failure here
  // must not make Stripe retry the whole event, so it's logged, not thrown.
  // The delete endpoint/path is taken from Upload-Post's docs
  // (DELETE /uploadposts/users {username}) but has not been exercised live —
  // if it fails, delete the profile by hand in Upload-Post's dashboard.
  if (event.type === "customer.subscription.deleted") {
    try {
      const doc = (await socialRef.get()).data() || {};
      const profiles = Object.values(doc.uploadPostProfiles || {});
      for (const username of profiles) {
        const r = await uploadPostRequest("/uploadposts/users", { method: "DELETE", json: { username } });
        if (!r.ok) console.error(`[social-webhook] couldn't delete Upload-Post profile ${username}: ${r.status}`, r.data);
      }
      if (profiles.length) await socialRef.update({ uploadPostProfiles: admin.firestore.FieldValue.delete() });
    } catch (err) {
      console.error("[social-webhook] profile cleanup failed (non-fatal):", err.message);
    }
  }

  return { handled: true };
}
