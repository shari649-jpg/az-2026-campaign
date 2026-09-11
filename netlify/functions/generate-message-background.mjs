// netlify/functions/generate-message-background.mjs
// The "-background" filename suffix is what tells Netlify to run this as
// a Background Function: invoking it returns an empty HTTP 202 almost
// immediately, and the handler itself then keeps running for up to 15
// minutes, completely decoupled from that response. There is no way to
// return the generated text on this same request — see
// start-message-generation.mjs's header comment for the full two-function
// design and why. Invoked ONLY by that function, with { jobId }; not
// reachable usefully from a browser directly (no auth token is presented
// here at all — trust is entirely in the already-authorized job doc that
// function created, same as check-transcription.mjs trusting its own
// already-created transcriptionJobs/{id} record rather than re-checking
// caller identity on every poll).
//
// Real per-group rate-limit and credit enforcement — THE authoritative
// checks, not the fast-fail courtesy in start-message-generation.mjs. This
// preserves the exact metering behavior generate-message.mjs had before
// this rearchitecture: each platform group still consumes its own daily-
// call slot and its own credit debit, computed from its own real token
// usage — only the transport/timeout mechanism changed, not what a
// generation costs a user or an org.
//
// PROMPT CACHING (Aug 2026). Each group now arrives as { staticSystem,
// dynamicPrompt } instead of one flat { prompt, system } — see
// buildPromptParts() in message-machine.jsx for exactly what's in each
// half. staticSystem (guardrails, platform-voice guide, JSON-format
// instructions, and the mode's own fixed intro/style-guide text) is sent
// as a cache_control-tagged block in Claude's `system` array; dynamicPrompt
// (Issue/Content, Focal Point, Audience, Voice, Style, Tone, Frame, County,
// the platform list) is the `messages` user-turn content, never cached.
// Confirmed against Anthropic's current docs at implementation time: no
// special beta header is required for standard 5-minute ephemeral
// caching, `system` just needs to be an array of content blocks with
// `cache_control: {type:"ephemeral"}` on the block that should be cached,
// and the minimum cacheable prompt length for this app's model
// (claude-sonnet-4-5-20250929) is 1,024 tokens — comfortably below the
// real ~2,000+-token static block this app sends (confirmed from real
// production logs the same day this was built). This one FIXED a real,
// pre-existing bug as a side effect, not a new one introduced: the old
// buildPrompt() embedded FACTUAL_ACCURACY_GUARDRAIL and
// AI_TELL_PHRASING_BAN directly inside the user-message prompt text AND
// (because the client never sent a separate `system` field) this file's
// own missingPieces safety net re-appended both into `system` too —
// meaning every call sent that guardrail text twice. Now that staticSystem
// is a real, separate field containing the guardrails and dynamicPrompt
// deliberately does not, that duplication is gone.
//
// CREDIT CHARGING — see creditHelper.mjs's own comments for the full
// reasoning, but the short version: Claude's response usage object
// reports cache_creation_input_tokens and cache_read_input_tokens
// SEPARATELY from input_tokens (which, once caching is live, only covers
// tokens after the last cache breakpoint — not the full request). Passing
// only input_tokens/output_tokens to debitGenerationCredits() the way this
// file did before caching would have silently undercharged every org
// relative to its real Anthropic bill the moment this shipped. Both cache
// fields are read from the real response below and passed through.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";
import { debitGenerationCredits, checkGenerationBalance, generationBlockedPayload, multiplierForOrigin } from "./creditHelper.mjs";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../src/lib/guardrails.js";
import { AI_TELL_PHRASING_BAN } from "../../src/lib/messageRules.js";

const GENERATION_MODEL = process.env.GENERATION_MODEL || "claude-sonnet-4-5-20250929";
const MAX_TOKENS_CEILING = 8000;

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

// Builds the effective, cache_control-tagged `system` ARRAY (not a plain
// string anymore) from a group's staticSystem. The missingPieces safety
// net is kept — same defense-in-depth reasoning generate-message.mjs
// always had (never fully trust the client) — but now checks against the
// real staticSystem field, which under normal operation already contains
// both guardrails, so this should be a no-op in practice, not the thing
// actually adding them.
//
// IMPORTANT: cache_control goes on the LAST block that should be part of
// the cached prefix. There's only one static block here, so it goes on
// that one, always — if missingPieces ever has to append something (the
// safety-net case), it's appended INSIDE the same block's text, before
// the cache_control tag is applied, not as a second block, so the cache
// key still covers the complete static content, not just part of it.
function buildEffectiveSystem(staticSystem) {
  const ss = typeof staticSystem === "string" ? staticSystem : "";
  const missingPieces = [
    !ss.includes("FACTUAL ACCURACY:") ? FACTUAL_ACCURACY_GUARDRAIL : null,
    !ss.includes("AVOID AI-SOUNDING PHRASING:") ? AI_TELL_PHRASING_BAN : null,
  ].filter(Boolean);
  const fullStatic = [ss, ...missingPieces].filter(Boolean).join("\n\n");
  // ttl: "1h" (Sept 2026) — was the default 5-minute ephemeral cache.
  // CONFIRMED from real creditTransactions data (Sept 2026 gap analysis):
  // 80 of 195 generateAll calls over 3 weeks landed in a 6-59 minute gap
  // since the previous call, and every single one of those 80 recorded a
  // real cache MISS (cacheReadTokens = 0) — a 5-minute TTL was measurably
  // too short for real usage patterns. UNCONFIRMED, verify before relying
  // on this in production: the exact current Anthropic beta header name/
  // pricing for extended cache TTL — this reflects best understanding at
  // implementation time, not a live-checked call (no network access to
  // Anthropic's docs from the build environment). Requires the matching
  // "anthropic-beta": "extended-cache-ttl-2025-04-11" header on the
  // request that sends this — see callClaude() below.
  return [{ type: "text", text: fullStatic, cache_control: { type: "ephemeral", ttl: "1h" } }];
}

async function callClaude({ dynamicPrompt, maxTokens, system }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    // anthropic-beta (Sept 2026) — required alongside buildEffectiveSystem()'s
    // ttl: "1h" above; see that function's comment for the same
    // UNCONFIRMED-verify-before-relying-on-this flag.
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-beta": "extended-cache-ttl-2025-04-11" },
    body: JSON.stringify({
      model: GENERATION_MODEL,
      max_tokens: Math.min(maxTokens || 1000, MAX_TOKENS_CEILING),
      messages: [{ role: "user", content: dynamicPrompt }],
      system,
    }),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

// Cache warm-up (Sept 2026, un-consolidation). All groups in one job share
// byte-identical staticSystem — it depends only on msgMode, never on which
// platform(s) are in a group (confirmed: buildPromptParts() in
// message-machine.jsx builds staticSystem before it ever looks at the
// platforms param). Once un-consolidation went to one group per platform,
// that means up to 6 requests now fire at once (Promise.all below) instead
// of 1-3 — and Anthropic's cache is only READABLE once a request finishes
// WRITING it. Requests fired at the same instant have no guarantee a
// sibling's write has landed yet — real risk of several of them missing
// the cache simultaneously ("thundering herd"), confirmed as a concern in
// this project's own prior caching work, not a new worry invented here.
//
// Fix: fire one small, cheap request containing ONLY the static block
// first, with a trivial max_tokens and a throwaway instruction, and AWAIT
// its full completion before firing the real per-platform groups. A
// completed response guarantees the input was fully processed (and so the
// cache write landed) — a more reliable signal than guessing at a fixed
// delay. The real groups fire together immediately after, all benefiting
// from the now-warm cache, rather than picking two platforms to go first
// at the expense of the rest's timing.
//
// Best-effort only: if this call fails for any reason, the real groups
// still run normally below — they just don't get the head start. A failed
// warm-up should never block or fail the actual generation.
//
// Billed to the job's own org/uid (Sept 2026) — this call costs real
// tokens (cache-write pricing on the static block, plus a handful of
// output tokens), same as every other real API call in this file. Passed
// through debitGenerationCredits() exactly like a real group's result
// would be, rather than left unbilled — matches this file's own
// established principle (see the CREDIT CHARGING header comment) that
// silently skipping a real cost is an undercharge, not a discount.
async function warmCache(staticSystem, { app, orgId, uid }) {
  try {
    const result = await callClaude({
      dynamicPrompt: "Reply with the single word OK.",
      maxTokens: 8,
      system: buildEffectiveSystem(staticSystem),
    });
    if (result.ok && result.data.usage) {
      const u = result.data.usage;
      await debitGenerationCredits(app, {
        orgId, uid,
        functionName: "generate-message-background-warmup",
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheCreationTokens: u.cache_creation_input_tokens,
        cacheReadTokens: u.cache_read_input_tokens,
        // multiplier: 1, always — deliberately NOT multiplierForOrigin(origin).
        // The Rapid Response 3x premium prices the feature's value to the
        // user; this call delivers no value to them directly, it's pure
        // internal plumbing, so it's billed to the org at cost regardless
        // of what triggered the job.
        multiplier: 1,
      });
    }
  } catch (err) {
    console.warn(`[generate-message-background] cache warm-up call failed (non-fatal, real groups proceed without it): ${err.message}`);
  }
}

export default async function (req) {
  const t0 = Date.now();
  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[generate-message-background] admin init:", err.message);
    return;
  }
  const db = admin.firestore(app);

  let jobId;
  try {
    ({ jobId } = await req.json());
  } catch {
    console.error("[generate-message-background] malformed invocation body");
    return;
  }
  if (!jobId) {
    console.error("[generate-message-background] missing jobId");
    return;
  }

  const jobRef = db.doc(`generationJobs/${jobId}`);

  // Idempotency guard (Aug 26 2026 — closes the standing to-do item first
  // flagged in Handoff #39 §9). Before this, nothing stopped a second
  // invocation of this function with the same jobId — a Netlify retry or
  // a client bug — from running every group's Claude call and credit
  // debit a second time for one job. Higher stakes than when first
  // flagged, since a double-debited job can now also carry the 3x Rapid
  // Response premium multiplier (§3, Handoff #41) — a bigger dollar
  // amount at risk than before.
  //
  // Firestore transactions are atomic against concurrent reads on the
  // same document, so two near-simultaneous invocations racing to read
  // "pending" can't both win: whichever transaction commits first flips
  // status to "processing"; the other invocation's transaction re-reads
  // the doc, sees "processing" (not "pending"), and bails before any
  // Claude call or credit debit happens. A genuinely-not-found job also
  // bails cleanly rather than throwing.
  let claim;
  try {
    claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      if (!snap.exists) return { ok: false, reason: "not_found" };
      const status = snap.data().status;
      if (status !== "pending") return { ok: false, reason: status };
      tx.set(jobRef, {
        status: "processing",
        claimedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { ok: true, job: snap.data() };
    });
  } catch (err) {
    console.error(`[generate-message-background] claim transaction failed for job=${jobId}:`, err.message);
    return;
  }

  if (!claim.ok) {
    console.warn(`[generate-message-background] job=${jobId} skipped — status was "${claim.reason}", not "pending" (this is exactly the duplicate-invocation case the claim transaction exists to catch, not necessarily an error)`);
    return;
  }

  try {
    const job = claim.job;
    const { uid, orgId, groups, origin } = job;

    // Groups run in PARALLEL (Promise.all), not sequentially — this
    // matters and is worth being explicit about: PLATFORM_GROUPS exists
    // specifically because parallel calls beat sequential ones on real
    // latency (Handoff #36). A first pass of this function processed
    // groups in a sequential for-loop, which would have quietly traded
    // that latency win away — total wait would become the SUM of every
    // group's call time instead of the slowest one, even though nothing
    // about the 15-minute Background Function budget required that.
    // Running them concurrently here is safe: checkAndIncrementRateLimit
    // is already an atomic Firestore transaction (built specifically to
    // handle concurrent requests correctly — see that function's own
    // header comment), so N groups checking/incrementing at once behave
    // exactly as N genuinely concurrent client requests would have before
    // this rearchitecture, not differently.
    const processGroup = async (group) => {
      const usage = await checkAndIncrementRateLimit(app, uid);
      if (usage.blocked) {
        return { platformIds: group.platformIds, error: "rate_limit_exceeded", limitData: usage.blockedPayload };
      }

      const balanceCheck = await checkGenerationBalance(app, orgId, "generate-message-background");
      if (balanceCheck.blocked) {
        return { platformIds: group.platformIds, error: "credits_exhausted", creditMessage: generationBlockedPayload(balanceCheck.balance).message };
      }

      const effectiveSystem = buildEffectiveSystem(group.staticSystem);
      let claudeResult;
      try {
        claudeResult = await callClaude({ dynamicPrompt: group.dynamicPrompt, maxTokens: group.maxTokens, system: effectiveSystem });
      } catch (err) {
        console.error(`[generate-message-background] Claude call failed for job=${jobId} group=${group.platformIds.join(",")}:`, err.message);
        return { platformIds: group.platformIds, error: "server_error", message: err.message };
      }

      if (!claudeResult.ok) {
        return { platformIds: group.platformIds, error: "server_error", message: claudeResult.data?.error?.message || "Claude API request failed." };
      }

      if (claudeResult.data.usage) {
        const u = claudeResult.data.usage;
        // origin (Aug 22 2026) — read from the job doc (see
        // start-message-generation.mjs's comment for why it's persisted
        // there rather than passed directly to this invocation).
        // multiplierForOrigin() maps it to the 3x Rapid Response premium;
        // the vast majority of jobs have no origin and get the default 1x.
        await debitGenerationCredits(app, {
          orgId, uid,
          functionName: "generate-message-background",
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          cacheCreationTokens: u.cache_creation_input_tokens,
          cacheReadTokens: u.cache_read_input_tokens,
          multiplier: multiplierForOrigin(origin),
        });
      }

      return {
        platformIds: group.platformIds,
        data: claudeResult.data,
        creditWarning: balanceCheck.warning ? generationBlockedPayload(balanceCheck.balance).message : null,
        usageWarning: usage.warning ? { used: usage.used, limit: usage.limit, remaining: usage.remaining } : null,
      };
    };

    // Fire the cache warm-up first, and actually wait for it — see
    // warmCache()'s own comment for why. Only bother when there's more
    // than one group to warm the cache FOR; a single-group job (e.g. one
    // platform selected) gets nothing from priming a cache it's about to
    // be the only reader of anyway. All groups share the same
    // staticSystem (see buildPromptParts()), so warming with groups[0]'s
    // copy warms it for all of them.
    if (groups.length > 1) {
      await warmCache(groups[0].staticSystem, { app, orgId, uid });
    }

    const groupResults = await Promise.all(groups.map(processGroup));

    await jobRef.set({
      status: "complete",
      groupResults,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`[generate-message-background] job=${jobId} done in ${Date.now() - t0}ms, ${groupResults.length} group(s)`);
  } catch (err) {
    console.error(`[generate-message-background] job=${jobId} FAILED:`, err.message);
    try {
      await jobRef.set({ status: "error", error: err.message || "Generation failed." }, { merge: true });
    } catch {}
  }
}
