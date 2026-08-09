// netlify/functions/perplexity-search.mjs
//
// WHAT THIS IS
// ────────────────────────────────────────────────────────────────────────
// A thin, generic wrapper around Perplexity's Sonar API. Deliberately NOT
// an HTTP-facing Netlify function itself (no `export default`, no auth, no
// CORS) — this is a shared MODULE, imported by whichever actual endpoint
// needs live search (resolve-bill.mjs today; the Research/Issues live-
// search integration and the BS Monitor rebuild are both scoped to reuse
// this same module later rather than each rolling their own Perplexity
// call, per the "one shared service, build once" decision). Same pattern
// as rateLimitHelper.mjs / creditHelper.mjs — a helper other functions
// import, not something the browser talks to directly.
//
// AUTH / RATE-LIMIT / CREDIT GATING IS THE CALLER'S JOB, NOT THIS FILE'S.
// This module has no idea who's calling it or whether they're allowed to.
// Every real endpoint that imports callPerplexity() below is responsible
// for its own requireSignedIn + checkAndIncrementRateLimit +
// checkGenerationBalance, exactly like every Claude-calling function
// already does. See resolve-bill.mjs for the reference pattern.
//
// COST — THIS IS A REAL, PAID CALL, UNLIKE CONGRESS.GOV/LEGISCAN
// ────────────────────────────────────────────────────────────────────────
// Perplexity Sonar is metered — real money per call, unlike Congress.gov
// or LegiScan (both free). Decided (Aug 2026): callers debit this against
// the SAME org.credits.generationBalance pool Claude generation calls
// already use — creditHelper.mjs's creditsForTokens()/debitGenerationCredits()
// are pure token math with nothing Anthropic-specific in them, so they
// work unmodified here. One balance, one warning/lockout system, nothing
// new for a Manager to watch. Perplexity's response uses OpenAI-compatible
// field names (usage.prompt_tokens / usage.completion_tokens) — NOT
// Anthropic's usage.input_tokens / usage.output_tokens naming — callers
// must map these correctly when calling debitGenerationCredits(). Getting
// this wrong wouldn't error, it would just silently debit 0 credits every
// time (undefined + undefined => creditsForTokens returns 1, the "never
// bill zero" floor — an under-charge, not a crash, so it's easy to miss;
// double-check the field names if debits look suspiciously flat later).
//
// Note also: Perplexity separately bills a per-request "search context
// size" fee (Low/Medium/High) on top of token cost, which the simple
// tokens/1000=1-credit conversion doesn't capture precisely — same known
// approximation the existing system already accepts for Claude billing
// (it doesn't try to match real dollars exactly either), not a new gap
// introduced here.
//
// SETUP REQUIRED
// ────────────────────────────────────────────────────────────────────────
// 1. Sign up for a Perplexity API key at https://www.perplexity.ai/settings/api
//    (self-serve, requires a Perplexity account).
// 2. Add it as a Netlify env var: PERPLEXITY_API_KEY.
//
// Modern Netlify Functions runtime (ESM). Uses Node's built-in fetch —
// same as every other function in this codebase, no new dependency.

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// "sonar" (not sonar-pro/sonar-reasoning-pro/sonar-deep-research) — the
// cheapest tier, sufficient for a resolver/lookup task like identifying a
// bill or listing a handful of relevant ones. Revisit if a future
// consumer of this shared module (BS Monitor, deeper Research queries)
// genuinely needs multi-source synthesis quality sonar-pro provides —
// don't upgrade the shared default for one caller's needs without
// checking the others aren't paying more as a side effect.
const DEFAULT_MODEL = "sonar";

const MAX_TOKENS_CEILING = 2000; // generous for a resolver-style task; same "cap well above the sane default, not tight against it" reasoning as generate-message.mjs's ceiling

/**
 * Call Perplexity's Sonar API. Generic — takes messages, returns the raw
 * parsed response so callers can read choices[0].message.content AND
 * usage.prompt_tokens/usage.completion_tokens themselves (needed for
 * credit debiting). Does not do JSON-shape enforcement or retries — a
 * caller wanting strict JSON output should instruct that in its own
 * system/user prompt (Perplexity's chat-completions format supports this
 * the same way Claude's does) and parse defensively, same as this app
 * already does elsewhere for structured Claude output.
 *
 * @param {object} params
 * @param {string} params.system     - system prompt
 * @param {string} params.query      - the user-facing query/question
 * @param {string} [params.model]    - defaults to "sonar"
 * @param {number} [params.maxTokens] - defaults to 800, capped at MAX_TOKENS_CEILING
 * @returns {Promise<object>} the raw parsed Perplexity response body
 * @throws if the fetch itself fails or Perplexity returns a non-2xx status
 */
export async function callPerplexity({ system, query, model, maxTokens }) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY not configured — set it in Netlify's environment variables.");
  }

  const response = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: query },
      ],
      max_tokens: Math.min(maxTokens || 800, MAX_TOKENS_CEILING),
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Perplexity API error: ${response.status} ${errText}`.trim());
  }

  return response.json();
}

/**
 * Convenience helper: extract the assistant's text content from a raw
 * Perplexity response (OpenAI-compatible shape). Returns "" rather than
 * throwing if the shape is unexpected, so a caller can check for an empty
 * string and handle it (same "fail into an empty/handleable state, don't
 * crash the response" convention used elsewhere in this app, e.g.
 * PromptSandboxPage.jsx's judgeUnavailable handling).
 */
export function extractPerplexityText(rawResponse) {
  return rawResponse?.choices?.[0]?.message?.content || "";
}
