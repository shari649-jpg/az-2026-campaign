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
 *   result.limit          - this user's daily limit
 *   result.remaining      - calls remaining
 *   result.warning        - true if >= 75% used (caller should include usageWarning in response)
 *   result.blockedPayload - ready-made 429 response body if blocked
 */
export async function checkAndIncrementRateLimit(app, uid) {
  const db     = admin.firestore(app);
  const ref    = db.doc(`users/${uid}`);
  const today  = todayUTC();

  // Read current state
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};

  const role        = data.role || "user";
  const limit       = LIMITS[role] ?? LIMITS.user;
  const storedDate  = data.dailyCallsDate || "";
  const storedCalls = storedDate === today ? (data.dailyCalls || 0) : 0;

  // Check BEFORE incrementing — block if already at or over limit
  if (storedCalls >= limit) {
    return {
      blocked: true,
      used:    storedCalls,
      limit,
      remaining: 0,
      warning: false,
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
  const updateData = storedDate === today
    ? { dailyCalls: admin.firestore.FieldValue.increment(1) }
    : { dailyCalls: 1, dailyCallsDate: today };

  await ref.update(updateData);

  const remaining = limit - newCount;
  const warning   = newCount >= Math.floor(limit * WARNING_THRESHOLD);

  return {
    blocked:  false,
    used:     newCount,
    limit,
    remaining,
    warning,
    blockedPayload: null,
  };
}
