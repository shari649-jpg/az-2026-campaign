// netlify/functions/rapid-response.mjs
// Rapid Response article analysis — modern Netlify Functions runtime (ESM)
//
// Auth:       requires a valid Firebase ID token (any signed-in user)
// Rate limit: 50/day (user), 100/day (manager), 200/day (administrator)
// SSRF guard: blocks fetch_and_analyze from hitting internal/private network addresses

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";

const CORS_ORIGIN = "https://az-coalition-2026-election.netlify.app";
const CORS_HEADERS = { "Access-Control-Allow-Origin": CORS_ORIGIN, "Content-Type": "application/json" };
const OPTIONS_HEADERS = { "Access-Control-Allow-Origin": CORS_ORIGIN, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };

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

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: OPTIONS_HEADERS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[rapid-response] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: CORS_HEADERS });
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
      return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), { status: 401, headers: CORS_HEADERS });
    }

    // ── Rate limit ──────────────────────────────────────────────────────────
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: CORS_HEADERS });
    }

    const { action, url, text, manualMeta } = body;

    // ── fetch_and_analyze ───────────────────────────────────────────────────
    if (action === "fetch_and_analyze") {
      if (!isUrlAllowed(url)) {
        return new Response(JSON.stringify({ error: "invalid_url" }), { status: 400, headers: CORS_HEADERS });
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
          pageText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s{3,}/g, "\n\n")
            .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
            .trim();
          if (pageText.length > 300) fetchOk = true;
        }
      } catch { fetchOk = false; }

      if (!fetchOk) return new Response(JSON.stringify({ error: "scrape_failed" }), { status: 422, headers: CORS_HEADERS });

      const analysisRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 2000, messages: [{ role: "user", content: ANALYSIS_PROMPT(pageText) }] }),
      });

      const analysisData = await analysisRes.json();
      if (usage.warning) analysisData.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };
      return new Response(JSON.stringify({ result: analysisData }), { status: 200, headers: CORS_HEADERS });
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
      return new Response(JSON.stringify({ result: analysisData }), { status: 200, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS_HEADERS });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
  }
}
