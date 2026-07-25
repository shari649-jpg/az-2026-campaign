// netlify/functions/rateLimitHelper.mjs
// Shared rate-limit logic for all AI-calling functions.
//
// Limits:
//   user          → 50 calls / day
//   manager       → 100 calls / day
//   administrator → 200 calls / day
//
// Warning is surfaced at 75% of the limit.
// Counter resets at UTC midnight (date comparison).
// Fields written to users/{uid}: dailyCalls (number), dailyCallsDate (YYYY-MM-DD string)
//
// Same-day override (Handoff #15, decision #9): an Administrator can grant a
// user extra calls for just today via AdminPage's "+N today" control, which
// writes dailyLimitOverride (number) and dailyLimitOverrideDate (YYYY-MM-DD)
// on the same user doc. It's added to the base limit only when
// dailyLimitOverrideDate matches today; once the date rolls over, the stale
// override is actively cleared below rather than just ignored, so it can't
// accidentally come back to life if a rollover-detection edge case ever
// misfires.

import admin from "firebase-admin";

const LIMITS = {
  administrator: 200,
  manager:       100,
  user:          50,
};

const WARNING_THRESHOLD = 0.75;

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Check and increment the rate limit counter for a user.
 *
 * @param {object} app      - Firebase Admin app instance
 * @param {string} uid      - The authenticated user's UID
 * @returns {object} result
 *   result.blocked        - true if the user has hit their limit (caller should return 429)
 *   result.used           - calls used today (after increment)
 *   result.limit          - this user's effective daily limit (base + today's override, if any)
 *   result.remaining      - calls remaining
 *   result.warning        - true if >= 75% used (caller should include usageWarning in response)
 *   result.blockedPayload - ready-made 429 response body if blocked
 *   result.role           - the user's role ("user" | "manager" | "administrator"), for callers that need it without a second Firestore read
 */
// SECURITY/COST FIX (this session): previously this did a plain read
// (ref.get()) followed by a separate write (ref.update()), with no
// atomicity between them. Multiple concurrent requests from the same uid —
// trivially producible by opening several tabs, or by anyone scripting
// parallel calls — could all read the SAME storedCalls value before any of
// their updates landed, so all of them would pass the "storedCalls >=
// limit" check simultaneously and each proceed to a real, billed Claude
// call. That's a direct cost-overrun vector, not just a theoretical race:
// the effective daily limit for a burst of N concurrent requests was N
// calls higher than the stated limit, not "at most the limit." Wrapping
// the read+check+write in a single db.runTransaction() makes Firestore
// serialize concurrent attempts against the same document — each one
// re-reads the latest committed count, so the limit is now actually the
// limit regardless of how many requests arrive at once.
export async function checkAndIncrementRateLimit(app, uid) {
  const db     = admin.firestore(app);
  const ref    = db.doc(`users/${uid}`);
  const today  = todayUTC();

  return db.runTransaction(async (tx) => {
    // Read current state
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    const role        = data.role || "user";
    const baseLimit   = LIMITS[role] ?? LIMITS.user;
    const storedDate  = data.dailyCallsDate || "";
    const storedCalls = storedDate === today ? (data.dailyCalls || 0) : 0;

    // Same-day override only counts if it was granted today; otherwise it's
    // stale from a previous day and gets wiped out in the update below.
    const hasFreshOverride = data.dailyLimitOverrideDate === today;
    const override = hasFreshOverride ? (data.dailyLimitOverride || 0) : 0;
    const limit = baseLimit + override;
    const staleOverrideFields = (!hasFreshOverride && (data.dailyLimitOverride || data.dailyLimitOverrideDate))
      ? { dailyLimitOverride: 0, dailyLimitOverrideDate: "" }
      : {};

    // Check BEFORE incrementing — block if already at or over limit
    if (storedCalls >= limit) {
      if (Object.keys(staleOverrideFields).length) tx.update(ref, staleOverrideFields);
      return {
        blocked: true,
        used:    storedCalls,
        limit,
        remaining: 0,
        warning: false,
        role,
        blockedPayload: {
          error:     "rate_limit_exceeded",
          used:      storedCalls,
          limit,
          remaining: 0,
          message:   `You've reached your daily limit of ${limit} AI calls. Your limit resets at midnight UTC. Contact an administrator if you need more access today.`,
        },
      };
    }

    // Increment
    const newCount = storedCalls + 1;
    const updateData = {
      ...staleOverrideFields,
      ...(storedDate === today
        ? { dailyCalls: admin.firestore.FieldValue.increment(1) }
        : { dailyCalls: 1, dailyCallsDate: today }),
    };

    tx.update(ref, updateData);

    const remaining = limit - newCount;
    const warning   = newCount >= Math.floor(limit * WARNING_THRESHOLD);

    return {
      blocked:  false,
      used:     newCount,
      limit,
      remaining,
      warning,
      role,
      blockedPayload: null,
    };
  });
}
