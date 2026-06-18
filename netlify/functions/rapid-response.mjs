// netlify/functions/rapid-response.mjs
// Rapid Response article analysis.
//
// Actions:
//   fetch_and_analyze — fetches a URL, scrapes the text, passes to Claude for structured analysis
//   analyze_text      — takes pasted text + manual metadata, passes to Claude for structured analysis
//
// Auth: requires a valid Firebase ID token from a signed-in coalition member.
// Also blocks fetch_and_analyze from being pointed at internal/private network
// addresses (basic SSRF guard) since this endpoint fetches arbitrary user-supplied URLs.
//
// Modern Netlify Functions runtime (ESM)

import admin from "firebase-admin";

const CORS_ORIGIN = "https://az-coalition-2026-election.netlify.app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Content-Type": "application/json",
};

const OPTIONS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON env var not set");
  const credential = admin.credential.cert(JSON.parse(json));
  return admin.initializeApp({ credential });
}

async function requireSignedIn(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  return decoded.uid;
}

// Basic SSRF guard: only allow http(s) URLs pointed at public hostnames.
// Blocks localhost, link-local/metadata addresses, and the private IPv4 ranges.
// Not exhaustive (doesn't resolve DNS to check the IP a hostname resolves to),
// but stops the obvious cases of someone pasting an internal/metadata URL.
function isUrlAllowed(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();

  if (host === "localhost" || host === "0.0.0.0") return false;
  if (host === "169.254.169.254") return false; // cloud metadata endpoints (AWS/GCP/Azure-style)
  if (host.endsWith(".internal") || host.endsWith(".local")) return false;

  // Private / loopback / link-local IPv4 ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = parseInt(ipv4[1], 10);
    const b = parseInt(ipv4[2], 10);
    if (a === 127) return false;               // loopback
    if (a === 10) return false;                 // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false;   // 192.168.0.0/16
    if (a === 169 && b === 254) return false;   // link-local
  }

  // IPv6 loopback / link-local
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return false;
  }

  return true;
}

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: OPTIONS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[rapid-response] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server is not configured for auth yet." }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    try {
      await requireSignedIn(app, idToken);
    } catch (err) {
      const status = err.message === "unauthenticated" ? 401 : 403;
      return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), {
        status,
        headers: CORS_HEADERS,
      });
    }

    const { action, url, text, manualMeta } = body;

    // ── Action: fetch_and_analyze ─────────────────────────────────────────
    if (action === "fetch_and_analyze") {
      if (!isUrlAllowed(url)) {
        return new Response(JSON.stringify({ error: "invalid_url" }), {
          status: 400,
          headers: CORS_HEADERS,
        });
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
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .trim();

          if (pageText.length > 300) fetchOk = true;
        }
      } catch (fetchErr) {
        fetchOk = false;
      }

      if (!fetchOk) {
        return new Response(JSON.stringify({ error: "scrape_failed" }), {
          status: 422,
          headers: CORS_HEADERS,
        });
      }

      const analysisRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `You are a political research analyst. Analyze this article and extract structured information.

Article text:
${pageText.substring(0, 8000)}

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
}`,
          }],
        }),
      });

      const analysisData = await analysisRes.json();
      return new Response(JSON.stringify({ result: analysisData }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // ── Action: analyze_text ──────────────────────────────────────────────
    if (action === "analyze_text") {
      const meta = manualMeta || {};

      const analysisRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `You are a political research analyst. Analyze this article and extract structured information.

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
}`,
          }],
        }),
      });

      const analysisData = await analysisRes.json();
      return new Response(JSON.stringify({ result: analysisData }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: CORS_HEADERS,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
