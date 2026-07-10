// netlify/functions/rapid-response.mjs
// Rapid Response article analysis — modern Netlify Functions runtime (ESM)
//
// Auth:       requires a valid Firebase ID token (any signed-in user)
// Rate limit: 50/day (user), 100/day (manager), 200/day (administrator)
// SSRF guard: blocks fetch_and_analyze from hitting internal/private network addresses

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { parse as parseHtml } from "node-html-parser";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";

// Transition period: both the new custom domain and the legacy Netlify
// subdomain are accepted. Browsers only honor a single exact-match origin
// in this header (no comma lists, no wildcarding with credentials), so we
// reflect back whichever allowed origin actually made the request.
// TODO: drop ALLOWED_ORIGINS[1] (legacy netlify.app) once the old domain
// is fully retired and nothing still links to it.
const ALLOWED_ORIGINS = [
  "https://arizonacoalition.net",
  "https://az-coalition-2026-election.netlify.app",
];
function corsHeaders(req) {
  const origin = req.headers.get("origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowOrigin, "Content-Type": "application/json" };
}
function optionsHeaders(req) {
  const origin = req.headers.get("origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowOrigin, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}

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

async function requireSignedIn(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  return decoded.uid;
}

function isUrlAllowed(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0") return false;
  if (host === "169.254.169.254") return false;
  if (host.endsWith(".internal") || host.endsWith(".local")) return false;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = parseInt(ipv4[1], 10), b = parseInt(ipv4[2], 10);
    if (a === 127) return false;
    if (a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
  }
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false;
  return true;
}

// Strips a fetched page down to its readable text before it gets sent to
// Claude as "article text." This used to be a chain of regexes
// (.replace(/<script...>.../gi, " ") etc.) — CodeQL flagged that as
// js/bad-tag-filter: a regex can't reliably parse HTML, so a page with
// nested, malformed, or adversarially-crafted markup (e.g. a <script> tag
// commented-out or split across what the regex expects as one match)
// could leave script/style content sitting in pageText, which then goes
// straight into the analysis prompt as if it were article body text.
// This now uses a real HTML parser (node-html-parser) to walk the actual
// DOM tree and remove non-content elements by node, which is not
// foolable by clever markup the way a regex match is.
// Fixed July 2026 security pass.
function extractReadableText(html) {
  const root = parseHtml(html, {
    lowerCaseTagName: true,
    comment: false,
  });
  root.querySelectorAll("script, style, nav, header, footer").forEach(el => el.remove());
  return root.textContent
    // Decode &amp; LAST. If this ran first, a double-encoded sequence like
    // "&amp;lt;" would resolve to a literal "<" — reintroducing something
    // tag-shaped after the parser has already produced plain text, with no
    // second pass to catch it. Decoding &amp; last keeps a double-escaped
    // input safely at "&lt;" instead of "<". (CodeQL: js/double-escaping)
    // Kept from the original implementation — this part was not the flagged
    // issue and stays unchanged.
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

const ANALYSIS_PROMPT = (text) => `You are a political research analyst. Analyze this article and extract structured information.

Article text:
${text.substring(0, 8000)}

RESPOND ONLY WITH VALID JSON. No markdown, no backticks, no explanation.
Format:
{
  "title": "article headline",
  "publication": "outlet name",
  "date": "publication date",
  "reporter": "reporter name or names",
  "summary": "2-3 sentence summary of the article",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "people": [{"name": "Full Name", "role": "title or role"}],
  "quotes": [{"text": "exact quote text without attribution", "speaker": "name"}],
  "issueArea": "one of: education/vouchers, utility rates, housing, water, elections, healthcare, economy/jobs, immigration, other"
}`;

// Search tab (Handoff #16 punch list): a web_search-backed picklist so staff
// without a URL in hand yet can still find something to analyze, without
// leaving Rapid Response. Reuses this same function/action-dispatch pattern
// (fetch_and_analyze / analyze_text already live here) rather than standing
// up a separate endpoint. Claude both runs the search AND writes the
// structured picklist itself in one call — Anthropic's web_search tool only
// returns url/title/page_age/encrypted_content, no snippet or publication
// name, so those two fields are Claude's own summary of what it found.
const SEARCH_PROMPT = (query) => `You are a research assistant helping a political campaign staffer find recent news coverage.

Search the web for: ${query}

Identify up to 5 of the most relevant, most recent news articles or reports you find. For each one, note the outlet/publication name, its publication date if you can determine one, and write a one-sentence snippet describing what it covers.

RESPOND ONLY WITH VALID JSON once you are done searching. No markdown, no backticks, no explanation outside the JSON.
Format:
{
  "results": [
    {"title": "article headline", "url": "https://...", "publication": "outlet name", "date": "date or \"Unknown\"", "snippet": "one sentence describing what the article covers"}
  ]
}
If you find fewer than 5 relevant results, return however many you found. If you find none, return {"results": []}.`;

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: optionsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[rapid-response] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    // ── Auth ────────────────────────────────────────────────────────────────
    let uid;
    try {
      uid = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), { status: 401, headers: corsHeaders(req) });
    }

    // ── Rate limit ──────────────────────────────────────────────────────────
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    const { action, url, text, manualMeta } = body;

    // ── fetch_and_analyze ───────────────────────────────────────────────────
    if (action === "fetch_and_analyze") {
      if (!isUrlAllowed(url)) {
        return new Response(JSON.stringify({ error: "invalid_url" }), { status: 400, headers: corsHeaders(req) });
      }

      let pageText = "";
      let fetchOk = false;
      try {
        const pageRes = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          redirect: "follow",
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          pageText = extractReadableText(html);
          if (pageText.length > 300) fetchOk = true;
        }
      } catch { fetchOk = false; }

      if (!fetchOk) return new Response(JSON.stringify({ error: "scrape_failed" }), { status: 422, headers: corsHeaders(req) });

      const analysisRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 2000, messages: [{ role: "user", content: ANALYSIS_PROMPT(pageText) }] }),
      });

      const analysisData = await analysisRes.json();
      if (usage.warning) analysisData.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };
      return new Response(JSON.stringify({ result: analysisData }), { status: 200, headers: corsHeaders(req) });
    }

    // ── search ──────────────────────────────────────────────────────────────
    if (action === "search") {
      const query = (body.query || "").trim();
      if (!query) {
        return new Response(JSON.stringify({ error: "missing_query" }), { status: 400, headers: corsHeaders(req) });
      }

      // Member vs Admin/Manager search depth — how many web searches Claude
      // may run for this one request, not a separate daily budget (that's
      // still the shared per-user dailyCalls limit from rateLimitHelper,
      // already checked above via `usage`).
      const isPrivileged = usage.role === "administrator" || usage.role === "manager";
      const maxSearchUses = isPrivileged ? 5 : 3;

      const searchRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1500,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearchUses }],
          messages: [{ role: "user", content: SEARCH_PROMPT(query) }],
        }),
      });

      const searchData = await searchRes.json();
      if (searchData.error) {
        return new Response(JSON.stringify({ error: "search_failed" }), { status: 502, headers: corsHeaders(req) });
      }

      const rawText = (searchData.content || []).filter(b => b.type === "text").map(b => b.text || "").join("");
      const cleaned = rawText.replace(/```json|```/g, "").trim();

      let results = [];
      try {
        const parsed = JSON.parse(cleaned);
        results = Array.isArray(parsed.results) ? parsed.results.slice(0, 5) : [];
      } catch {
        return new Response(JSON.stringify({ error: "search_failed" }), { status: 502, headers: corsHeaders(req) });
      }

      const payload = { results };
      if (usage.warning) payload.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };
      return new Response(JSON.stringify(payload), { status: 200, headers: corsHeaders(req) });
    }

    // ── analyze_text ────────────────────────────────────────────────────────
    if (action === "analyze_text") {
      const meta = manualMeta || {};
      const prompt = `You are a political research analyst. Analyze this article and extract structured information.

Known publication info (use if provided, otherwise extract from text):
Title: ${meta.title || "extract from text"}
Publication: ${meta.pub || "extract from text"}
Date: ${meta.date || "extract from text"}
Reporter: ${meta.reporter || "extract from text"}

Article text:
${text.substring(0, 8000)}

RESPOND ONLY WITH VALID JSON. No markdown, no backticks, no explanation.
Format:
{
  "title": "article headline",
  "publication": "outlet name",
  "date": "publication date",
  "reporter": "reporter name or names",
  "summary": "2-3 sentence summary of the article",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "people": [{"name": "Full Name", "role": "title or role"}],
  "quotes": [{"text": "exact quote text without attribution", "speaker": "name"}],
  "issueArea": "one of: education/vouchers, utility rates, housing, water, elections, healthcare, economy/jobs, immigration, other"
}`;

      const analysisRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
      });

      const analysisData = await analysisRes.json();
      if (usage.warning) analysisData.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };
      return new Response(JSON.stringify({ result: analysisData }), { status: 200, headers: corsHeaders(req) });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders(req) });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
