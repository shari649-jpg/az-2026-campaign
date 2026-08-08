// netlify/functions/creditHelper.mjs
// Shared generation-credit logic (Aug 2026 TODO items 7/8, plus the
// warn/lockout enforcement decided this session). Two independent pieces:
//
// 1. checkGenerationBalance() — a PRE-CALL gate, checked before spending
//    any tokens. Blocks the call outright once an org's generationBalance
//    is at or below zero, and flags a warning once it's positive but at or
//    under GENERATION_WARNING_THRESHOLD. This implements the prepaid-
//    credit-pool design already decided in the Scope Punch List ("Stripe —
//    prepaid credits, warn, self-serve top-up, hard lockout": warn as
//    balance gets low, hard-block at zero) — mirrors the submission-time
//    gate start-transcription.mjs already uses for the transcription pool.
//
// 2. debitGenerationCredits() — a POST-CALL debit, using the ACTUAL token
//    usage from Claude's response (Anthropic's usage.input_tokens/
//    output_tokens), since real cost isn't known until the response
//    arrives. Mirrors check-transcription.mjs's "bill on real, known cost"
//    pattern. Runs regardless of whether the pre-call gate warned — the
//    gate only blocks at ≤0, so a call between 1 and
//    GENERATION_WARNING_THRESHOLD credits still generates and still debits
//    normally.
//
// ⚠️ HOW AN ORG ADDS BALANCE ONCE BLOCKED — READ BEFORE ASSUMING THIS IS
// SELF-SERVE: there is NO Stripe top-up flow built yet. The self-serve
// purchase flow described in the Scope Punch List ("Section 3.5") is
// planned but explicitly NOT built — it needs a real Stripe account, which
// doesn't exist as of this writing, and building it was deliberately
// deferred rather than rushed in without one. Until that exists, the ONLY
// way to unblock a zero-balance org is an Administrator manually granting
// comp credits via grant-credits.mjs (Admin panel → Orgs tab → "Grant comp
// credits") — this path requires no Stripe account and already works
// today. The blocked-request error message below points staff at that
// path explicitly, on purpose, so nobody hits a dead end. When Stripe
// top-up eventually ships, update that message to point there instead (or
// in addition).
//
// Rate: 1,000 tokens = 1 credit (confirmed decision, Handoff #32/#33's
// TODO). Ceiling-rounds and never bills zero credits for a real call — a
// very short exchange still costs at least 1 credit — matching the same
// two conventions check-transcription.mjs already uses for its 4-minutes-
// per-credit transcription rule, so the two credit pools behave
// consistently even though they meter different things.
//
// Both functions silently no-op / fail open (log a warning, don't throw or
// block) when the calling user/storm has no orgId yet — matches the
// fail-open pattern already used throughout this app's org-scoping (storms,
// saved_campaigns, etc.) for pre-org-migration or individual accounts,
// rather than treating missing org data as a reason to block a generation.
// debitGenerationCredits() also never throws on a real billing failure —
// logged, not surfaced to the caller, since the person is waiting on
// already-generated text at that point.

import admin from "firebase-admin";

const TOKENS_PER_CREDIT = 1000;
// Confirmed this session — warn once an org's remaining generationBalance
// drops to or under this many credits, while still letting the call
// through. Distinct from the hard block, which only fires at ≤0.
const GENERATION_WARNING_THRESHOLD = 500;

export function creditsForTokens(inputTokens, outputTokens) {
  const total = (inputTokens || 0) + (outputTokens || 0);
  if (total <= 0) return 1; // never bill zero for a real call
  return Math.ceil(total / TOKENS_PER_CREDIT);
}

/**
 * Pre-call gate. Checked BEFORE spending any tokens on a generation call.
 *
 * @param {object} app          - Firebase Admin app instance
 * @param {string|null} orgId   - the org to check (null = skip, fail-open — no block, no warning)
 * @returns {Promise<{blocked: boolean, warning: boolean, balance: number|null}>}
 */
export async function checkGenerationBalance(app, orgId) {
  if (!orgId) {
    return { blocked: false, warning: false, balance: null };
  }
  const db = admin.firestore(app);
  const orgSnap = await db.doc(`orgs/${orgId}`).get();
  const balance = orgSnap.exists ? (orgSnap.data()?.credits?.generationBalance ?? 0) : 0;
  return {
    blocked: balance <= 0,
    warning: balance > 0 && balance <= GENERATION_WARNING_THRESHOLD,
    balance,
  };
}

// Shared error payload for a blocked call — same shape returned by every
// generation function so the frontend can handle it identically everywhere,
// same convention as the existing rate-limit blockedPayload in
// rateLimitHelper.mjs. Points explicitly at the Admin-granted comp-credits
// path since that's the ONLY way to resolve this today (see file header).
export function generationBlockedPayload(balance) {
  return {
    error: "generation_credits_exhausted",
    balance,
    message: "Your organization's AI-generation credits are used up. An Administrator can add more from the Admin panel's Orgs tab (\"Grant comp credits\") — no Stripe account is needed for this. Self-serve credit purchase isn't built yet; contact your Administrator directly.",
  };
}

// Shared warning payload, attached to a successful response the same way
// usageWarning already is (rateLimitHelper.mjs's 75%-of-daily-limit
// pattern) — this is the second, independent warning: org credit balance,
// not personal daily call count.
export function generationWarningPayload(balance) {
  return {
    balance,
    threshold: GENERATION_WARNING_THRESHOLD,
    message: `Your organization has ${balance} AI-generation credit(s) left (warning threshold: ${GENERATION_WARNING_THRESHOLD}). An Administrator can add more from the Admin panel's Orgs tab.`,
  };
}

/**
 * POST-CALL debit for generationBalance, based on real token usage. Runs
 * after checkGenerationBalance() has already let the call through (or
 * wasn't checked at all, for a caller not yet updated to use the gate) —
 * this function does not re-check the balance itself, it just spends
 * against it. Never throws — a billing failure is logged, not surfaced to
 * the caller, since the person is waiting on their already-generated text.
 *
 * @param {object} app          - Firebase Admin app instance
 * @param {object} params
 * @param {string|null} params.orgId        - the org to debit (null = skip, no-op)
 * @param {string|null} params.uid          - the requesting user's uid, for logging only (null for public/unauthenticated callers)
 * @param {string} params.functionName      - calling function's name, for log prefixing (e.g. "generate-message")
 * @param {number} params.inputTokens
 * @param {number} params.outputTokens
 * @returns {Promise<{debited: boolean, credits?: number, reason?: string}>}
 */
export async function debitGenerationCredits(app, { orgId, uid, functionName, inputTokens, outputTokens }) {
  if (!orgId) {
    console.warn(`[creditHelper] ${functionName}: uid=${uid || "none"} has no orgId — generation not debited (pre-org-migration or individual account).`);
    return { debited: false, reason: "no_org" };
  }
  const credits = creditsForTokens(inputTokens, outputTokens);
  const db = admin.firestore(app);
  const orgRef = db.doc(`orgs/${orgId}`);
  try {
    // Nested-object write required for a real Firestore merge into
    // credits.generationBalance — see grant-credits.mjs / check-transcription.mjs's
    // Aug 5 bug-fix comment for why a dotted-string key would silently
    // create a literal "credits.generationBalance"-named field instead.
    await db.runTransaction(async (tx) => {
      tx.set(orgRef, { credits: { generationBalance: admin.firestore.FieldValue.increment(-credits) } }, { merge: true });
    });
    console.log(`[creditHelper] ${functionName}: debited ${credits} credit(s) from org=${orgId} uid=${uid || "none"} (${inputTokens || 0}+${outputTokens || 0} tokens)`);
    return { debited: true, credits };
  } catch (err) {
    console.error(`[creditHelper] ${functionName}: debit FAILED for org=${orgId} uid=${uid || "none"} —`, err.message);
    return { debited: false, reason: "error" };
  }
}
