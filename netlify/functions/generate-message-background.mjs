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
import { debitGenerationCredits, checkGenerationBalance, generationBlockedPayload } from "./creditHelper.mjs";
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
  return [{ type: "text", text: fullStatic, cache_control: { type: "ephemeral" } }];
}

async function callClaude({ dynamicPrompt, maxTokens, system }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
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

  try {
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      console.error(`[generate-message-background] job ${jobId} not found`);
      return;
    }
    const job = jobSnap.data();
    const { uid, orgId, groups } = job;

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
        await debitGenerationCredits(app, {
          orgId, uid,
          functionName: "generate-message-background",
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          cacheCreationTokens: u.cache_creation_input_tokens,
          cacheReadTokens: u.cache_read_input_tokens,
        });
      }

      return {
        platformIds: group.platformIds,
        data: claudeResult.data,
        creditWarning: balanceCheck.warning ? generationBlockedPayload(balanceCheck.balance).message : null,
        usageWarning: usage.warning ? { used: usage.used, limit: usage.limit, remaining: usage.remaining } : null,
      };
    };

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
