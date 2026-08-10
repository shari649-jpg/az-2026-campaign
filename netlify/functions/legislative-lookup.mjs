// netlify/functions/legislative-lookup.mjs
//
// Shared LegiScan fetch/lookup helpers. Extracted out of bill-votes.mjs
// (Aug 2026) so resolve-bill.mjs and bill-votes.mjs share the SAME,
// already-debugged lookup logic rather than hand-copied versions that
// could drift out of sync.
//
// AUG 2026 REARCHITECTURE — CONGRESS.GOV DROPPED, SEARCH-FIRST DESIGN
// ────────────────────────────────────────────────────────────────────────
// This file previously also wrapped Congress.gov's API and a
// findLegiscanSessionIds()/findLegiscanBill() pair that scanned every
// session's master list to translate a Congress.gov-style bill identifier
// (guessed by Perplexity, from memory) into a real LegiScan bill_id.
//
// That whole approach is gone. The new pipeline starts from LegiScan's own
// real full-text search (legiscanSearch(), below) — Perplexity is no
// longer asked to identify a bill by number at all, only to reformulate a
// query when the raw search comes up empty (see resolve-bill.mjs). Because
// search already returns a real bill_id directly, there's no more need to
// (a) guess which session a bill lives in — getBill(id) returns session_id
// on the record itself — or (b) verify a Perplexity guess against
// Congress.gov, since every candidate now comes from LegiScan's own index
// in the first place, not from an LLM's memory.
//
// Net effect: Congress.gov is no longer used anywhere in the bill-lookup
// feature (CONGRESS_API_KEY is unused here — direct decision, Aug 2026,
// since LegiScan's own subject tags cover the same informational role the
// official CRS Policy Area tag did, and nothing in this feature depends on
// CRS specifically). The HR/HB naming-trap table
// (BILLTYPE_TO_LEGISCAN_PREFIX) and congressToStartYear() are gone too —
// they only existed to translate INTO Congress.gov's schema, which nothing
// needs anymore now that both search and detail are LegiScan-only, for
// both federal and state bills.
//
// This module does NOT do auth, rate-limiting, or credit gating — same
// pattern as perplexity-search.mjs. Callers are responsible for that.
//
// Modern Netlify Functions runtime (ESM).

const LEGISCAN_API_BASE = "https://api.legiscan.com/";

export async function legiscanFetch(op, params = {}) {
  const apiKey = process.env.LEGISCAN_API_KEY;
  if (!apiKey) throw new Error("LEGISCAN_API_KEY not configured — set it in Netlify's environment variables.");
  const url = new URL(LEGISCAN_API_BASE);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("op", op);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url.toString());
  const loggedUrl = url.toString().replace(apiKey, "[REDACTED]");
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error(`[legislative-lookup] LegiScan HTTP error ${response.status}: ${loggedUrl} — ${errText}`);
    throw new Error(`LegiScan API error: ${response.status}`);
  }
  const data = await response.json();
  if (data.status !== "OK") {
    console.warn(`[legislative-lookup] LegiScan status=ERROR: ${loggedUrl} — ${JSON.stringify(data.alert)}`);
    return null;
  }
  return data;
}

// ── Full-text bill search (op=getSearch) — the new front door for
// resolve-bill.mjs, replacing Perplexity-recalls-a-bill-number entirely.
// ────────────────────────────────────────────────────────────────────────
// Confirmed against LegiScan's own API User Manual (not guessed): state
// is a two-letter state abbreviation OR "US" for Congress OR "ALL" for a
// nationwide search; query is a full-text query (LegiScan supports real
// search operators — AND/OR/NOT/ADJ/+/-); results are relevance-scored
// 0-100, up to 50 per page, sorted by relevance (not recency — resolve-
// bill.mjs re-sorts by last_action_date itself, since that's what "most
// recent first" should actually mean for a person browsing results, not a
// coarser "which year" grouping).
//
// The manual's own example JSON renders each numbered result as a
// "0"/"1"/"2"... keyed object nested under searchresult (the same pattern
// masterlist already uses elsewhere in this file's callers), but at least
// one third-party normalized schema documents searchresult.results as a
// plain array. Handled defensively here — try array first, fall back to
// numbered-object — and a real sample is logged on first use so this can
// be confirmed/adjusted from actual production output, same "log real
// output, calibrate after one real call" convention already used for
// getSessionPeople and getRollCall in bill-votes.mjs. Don't remove that
// logging until it's actually been confirmed against a live response.
export async function legiscanSearch(state, query) {
  const data = await legiscanFetch("getSearch", { state, query });
  const searchresult = data?.searchresult || {};
  let items;
  if (Array.isArray(searchresult.results)) {
    items = searchresult.results;
  } else if (searchresult.results && typeof searchresult.results === "object") {
    items = Object.values(searchresult.results);
  } else {
    // Older/alternate shape: numbered keys directly under searchresult,
    // sibling to "summary" — same pattern as getMasterList's masterlist.
    items = Object.keys(searchresult)
      .filter(k => k !== "summary")
      .map(k => searchresult[k]);
  }
  if (items.length > 0) {
    console.log(`[legislative-lookup] LegiScan getSearch sample (first 3 of ${items.length}) for state=${state} query="${query}":`, JSON.stringify(items.slice(0, 3)));
  }
  return items; // each: { relevance, state, bill_number, bill_id, url, last_action_date, last_action, title, ... }
}
