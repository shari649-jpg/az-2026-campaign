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
export async function checkAndIncrementRateLimit(app, uid) {
  const db     = admin.firestore(app);
  const ref    = db.doc(`users/${uid}`);
  const today  = todayUTC();

  // Read current state
  const snap = await ref.get();
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
    if (Object.keys(staleOverrideFields).length) await ref.update(staleOverrideFields).catch(() => {});
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

  await ref.update(updateData);

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
}
