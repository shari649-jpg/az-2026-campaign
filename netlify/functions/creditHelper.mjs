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

export function creditsForTokens(inputTokens, outputTokens, cacheCreationTokens = 0, cacheReadTokens = 0, multiplier = 1) {
  // UPDATED (Aug 2026, prompt caching): cacheCreationTokens/cacheReadTokens
  // are new parameters, weighted by their real price relative to base
  // input price, confirmed via Anthropic's published pricing: a 5-minute
  // cache write costs 1.25x base input price, a cache read costs 0.1x base
  // input price. inputTokens/outputTokens keep today's existing 1x-each
  // weighting unchanged (a known, pre-existing simplification — output is
  // really ~5x input price for Sonnet — not something this change fixes).
  // Without this weighting, a caller passing only Claude's separate,
  // smaller `usage.input_tokens` field (which, once caching is live, only
  // covers tokens after the last cache breakpoint) without ever reading
  // the cache fields would silently charge the org less than what
  // Anthropic actually bills for that call.
  const weighted = (inputTokens || 0)
    + (outputTokens || 0)
    + (cacheCreationTokens || 0) * 1.25
    + (cacheReadTokens || 0) * 0.1;
  const base = weighted <= 0 ? 1 : Math.ceil(weighted / TOKENS_PER_CREDIT); // never bill zero for a real call
  // UPDATED (Aug 22 2026, sales-sheet decision): premium-capability
  // multiplier, applied AFTER the token-cost ceiling, not before —
  // deliberately, so it lands on the same whole numbers the sales sheet
  // publishes (≈7 credits x 3 = ≈21 for Rebuttal, 30 x 3 = 90 for a full
  // Rapid Response campaign), rather than a slightly different number
  // from multiplying pre-ceiling token counts. This is a VALUE premium,
  // not a cost pass-through — Rebuttal and Rapid Response are priced
  // higher than their real token cost on purpose, because nothing else on
  // the market offers either (see the sales sheet's own "How We Compare"
  // table), not because they're more expensive to run. Defaults to 1
  // (no premium) so every other caller is completely unaffected.
  return Math.ceil(base * multiplier);
}

/**
 * Pre-call gate. Checked BEFORE spending any tokens on a generation call.
 *
 * @param {object} app          - Firebase Admin app instance
 * @param {string|null} orgId   - the org to check (null = skip, fail-open — no block, no warning)
 * @param {string} functionName - calling function's name, for log context (e.g. "generate-rebuttal"). Optional, defaults to "unknown" so this never throws if a caller omits it.
 * @returns {Promise<{blocked: boolean, warning: boolean, balance: number|null}>}
 */
export async function checkGenerationBalance(app, orgId, functionName = "unknown") {
  if (!orgId) {
    return { blocked: false, warning: false, balance: null };
  }
  const db = admin.firestore(app);
  const orgSnap = await db.doc(`orgs/${orgId}`).get();
  const balance = orgSnap.exists ? (orgSnap.data()?.credits?.generationBalance ?? 0) : 0;
  const result = {
    blocked: balance <= 0,
    warning: balance > 0 && balance <= GENERATION_WARNING_THRESHOLD,
    balance,
  };
  // Real server-side logging (added Aug 8 2026 after a real incident: a
  // user was blocked despite the org showing a positive balance minutes
  // earlier, and there was NOTHING in the function logs to actually
  // investigate — the block just returned a 402 to the browser with no
  // trace of what checkGenerationBalance had actually seen at that
  // moment). Logs every check, not just blocks, so a future incident has
  // a real trail: orgId, functionName, the exact balance read, and the
  // decision made from it. If a block happens again with a balance that
  // doesn't match what the Admin panel shows, this log line is the first
  // place to look — it'll show whether checkGenerationBalance itself saw
  // a stale/wrong value, or whether the balance had genuinely already
  // been spent (this is a SHARED org-wide pool, not per-user — another
  // staffer generating concurrently can spend it between when someone
  // "confirms" a balance and when their own request actually runs).
  if (result.blocked) {
    console.warn(`[creditHelper] BLOCKED: ${functionName} org=${orgId} balance=${balance} — generation refused, no tokens spent.`);
  } else if (result.warning) {
    console.log(`[creditHelper] check: ${functionName} org=${orgId} balance=${balance} — allowed, WARNING (≤${GENERATION_WARNING_THRESHOLD}).`);
  } else {
    console.log(`[creditHelper] check: ${functionName} org=${orgId} balance=${balance} — allowed.`);
  }
  return result;
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
 * @param {number} [params.cacheCreationTokens] - Aug 2026, prompt caching. Tokens written to a new cache entry this call (Claude's usage.cache_creation_input_tokens). Omit/0 for a non-caching caller.
 * @param {number} [params.cacheReadTokens] - Aug 2026, prompt caching. Tokens read from an existing cache entry this call (Claude's usage.cache_read_input_tokens). Omit/0 for a non-caching caller.
 * @param {number} [params.multiplier] - Aug 22 2026, premium-capability pricing. 3 for generate-rebuttal and rapid-response's analysis actions (Rebuttal/Rapid Response — see creditsForTokens' own comment for why). Omit/1 for every standard-rate caller.
 * @returns {Promise<{debited: boolean, credits?: number, reason?: string}>}
 */
export async function debitGenerationCredits(app, { orgId, uid, functionName, inputTokens, outputTokens, cacheCreationTokens = 0, cacheReadTokens = 0, multiplier = 1 }) {
  if (!orgId) {
    console.warn(`[creditHelper] ${functionName}: uid=${uid || "none"} has no orgId — generation not debited (pre-org-migration or individual account).`);
    return { debited: false, reason: "no_org" };
  }
  const credits = creditsForTokens(inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, multiplier);
  const db = admin.firestore(app);
  const orgRef = db.doc(`orgs/${orgId}`);
  // New (Aug 22 2026): every debit also writes an immutable per-call ledger
  // entry to orgs/{orgId}/creditTransactions/{autoId}, in the SAME
  // transaction as the balance decrement — mirrors the atomic
  // balance-plus-audit-record pattern grant-credits.mjs already uses for
  // creditGrants. Closes a real, confirmed gap: before this, the only
  // thing that existed was a single running generationBalance number —
  // nothing recorded WHICH call spent WHAT, WHEN, or by WHOM, so neither a
  // customer asking "what did I generate on Tuesday" nor an admin asking
  // "when is this account actually active" could be answered from
  // anywhere in the app. functionName (already passed by every caller,
  // e.g. "generate-message", "rapid-response:analyze_text") doubles as the
  // tool label here — no call site needs to change.
  const txnRef = orgRef.collection("creditTransactions").doc();
  try {
    // Nested-object write required for a real Firestore merge into
    // credits.generationBalance — see grant-credits.mjs / check-transcription.mjs's
    // Aug 5 bug-fix comment for why a dotted-string key would silently
    // create a literal "credits.generationBalance"-named field instead.
    await db.runTransaction(async (tx) => {
      tx.set(orgRef, { credits: { generationBalance: admin.firestore.FieldValue.increment(-credits) } }, { merge: true });
      tx.set(txnRef, {
        credits,
        multiplier,
        functionName,
        uid: uid || null,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        cacheCreationTokens: cacheCreationTokens || 0,
        cacheReadTokens: cacheReadTokens || 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    const cacheNote = (cacheCreationTokens || cacheReadTokens) ? `, cache: ${cacheCreationTokens || 0} written + ${cacheReadTokens || 0} read` : "";
    const multiplierNote = multiplier !== 1 ? `, ${multiplier}x premium applied` : "";
    console.log(`[creditHelper] ${functionName}: debited ${credits} credit(s) from org=${orgId} uid=${uid || "none"} (${inputTokens || 0}+${outputTokens || 0} tokens${cacheNote}${multiplierNote})`);
    return { debited: true, credits };
  } catch (err) {
    console.error(`[creditHelper] ${functionName}: debit FAILED for org=${orgId} uid=${uid || "none"} —`, err.message);
    return { debited: false, reason: "error" };
  }
}
