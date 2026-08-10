// netlify/functions/legislative-lookup.mjs
//
// Shared LegiScan + Congress.gov fetch/lookup helpers. Extracted out of
// bill-votes.mjs (Aug 2026) so resolve-bill.mjs can reuse the SAME,
// already-debugged session/bill lookup logic to verify Perplexity's
// suggestions before showing them — see resolve-bill.mjs's header for why
// that verification step exists. Splitting this out matters because a
// second hand-copied version of this logic would silently drift out of
// sync with real bug fixes made here (the multi-session search fix, the
// HR/HB naming-trap table) the next time one of them gets updated but not
// the other.
//
// This module does NOT do auth, rate-limiting, or credit gating — same
// pattern as perplexity-search.mjs. Callers are responsible for that.
//
// Modern Netlify Functions runtime (ESM).

const CONGRESS_API_BASE = "https://api.congress.gov/v3";
const LEGISCAN_API_BASE = "https://api.legiscan.com/";

export async function congressFetch(path, params = {}) {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) throw new Error("CONGRESS_API_KEY not configured — set it in Netlify's environment variables.");
  const url = new URL(`${CONGRESS_API_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url.toString());
  if (!response.ok) {
    if (response.status === 404) return null;
    const errText = await response.text().catch(() => "");
    throw new Error(`Congress.gov API error: ${response.status} ${errText}`.trim());
  }
  return response.json();
}

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

// Congress.gov billType -> LegiScan bill-number prefix. See
// bill-votes.mjs's original header for the confirmed HR/HB naming trap —
// Congress.gov's "H.R." (a House Bill) becomes LegiScan's "HB", while
// LegiScan's OWN "HR" means House Resolution, something else entirely.
export const BILLTYPE_TO_LEGISCAN_PREFIX = {
  HR: "HB",
  S: "SB",
  HRES: "HR",
  SRES: "SR",
  HJRES: "HJR",
  SJRES: "SJR",
  HCONRES: "HCR",
  SCONRES: "SCR",
};

// A Congress numbered N started in the calendar year 1789 + (N-1)*2.
export function congressToStartYear(congress) {
  return 1789 + (congress - 1) * 2;
}

// Returns ALL LegiScan session_ids matching a target year, not just the
// first — a state can have more than one session tagged to the same
// calendar year (a regular session plus special session(s)), and a bill
// can live in any of them.
export async function findLegiscanSessionIds(state, targetYear) {
  const data = await legiscanFetch("getSessionList", { state });
  const sessions = data?.sessions || [];
  const matches = sessions.filter(s => s.year_start === targetYear);
  if (matches.length === 0) {
    console.warn(`[legislative-lookup] no LegiScan ${state} session found for target year_start=${targetYear}.`);
  }
  return matches.map(s => s.session_id);
}

// Searches every candidate session (see above) for the bill, in order,
// returning the session it actually lived in plus its LegiScan bill_id.
export async function findLegiscanBill(sessionIds, legiscanBillNumber) {
  for (const sessionId of sessionIds) {
    const data = await legiscanFetch("getMasterList", { id: sessionId });
    const masterlist = data?.masterlist || {};
    for (const key of Object.keys(masterlist)) {
      const entry = masterlist[key];
      if (entry?.number && entry.number.toUpperCase() === legiscanBillNumber.toUpperCase()) {
        return { sessionId, billId: entry.bill_id };
      }
    }
  }
  return null;
}

// ── Verification helper for resolve-bill.mjs ──────────────────────────
// Given a bill identifier Perplexity claimed exists, checks it against
// the REAL authoritative source and returns the bill's real title (and
// existence) — NOT vote data, just enough to confirm "this bill is real"
// and show its actual title instead of trusting Perplexity's own summary
// wording, which is exactly what caught it hallucinating a title for
// HB2401 (a real bill number, but for an unrelated fuel-formulations
// bill, not the ESA/voucher bill Perplexity described — confirmed via
// Perplexity's own explanation: it confused an A.R.S. statute citation
// number with a bill number).
export async function verifyBillExists(bill) {
  try {
    if (bill.level === "federal") {
      const billTypePath = String(bill.billType).toLowerCase();
      const result = await congressFetch(`/bill/${bill.congress}/${billTypePath}/${bill.billNumber}`);
      if (!result?.bill) return { verified: false };
      return { verified: true, realTitle: result.bill.title };
    } else {
      const sessionIds = await findLegiscanSessionIds(bill.state, bill.year);
      if (sessionIds.length === 0) return { verified: false };
      const legiscanBillNumber = `${bill.billType}${bill.billNumber}`; // state mode billType is already LegiScan-native, no translation needed
      const found = await findLegiscanBill(sessionIds, legiscanBillNumber);
      if (!found) return { verified: false };
      const billResult = await legiscanFetch("getBill", { id: found.billId });
      if (!billResult?.bill) return { verified: false };
      return { verified: true, realTitle: billResult.bill.title };
    }
  } catch (err) {
    console.error(`[legislative-lookup] verifyBillExists error for ${JSON.stringify(bill)}:`, err.message);
    return { verified: false }; // fail closed — an unverifiable bill doesn't get shown as if it were confirmed real
  }
}
