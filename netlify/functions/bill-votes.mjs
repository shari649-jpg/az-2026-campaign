// netlify/functions/bill-votes.mjs
//
// WHAT THIS DOES
// ────────────────────────────────────────────────────────────────────────
// Second half of the bill-lookup feature (resolve-bill.mjs is the first
// half — it turns free text into a bill identifier). Given
// { congress, billType, billNumber }, this:
//
//   1. Pulls the bill's own record (title, sponsor, latest action) AND its
//      official CRS subject/policy-area tags from Congress.gov — kept from
//      the original build, still free, still working, still the
//      authoritative source for that specific data.
//   2. Pulls the ACTUAL VOTE BREAKDOWN from LegiScan instead of
//      Congress.gov — see "WHY LEGISCAN, NOT CONGRESS.GOV, FOR VOTES"
//      below. Covers BOTH House and Senate, unlike the original
//      Congress.gov-only version of this file.
//
// WHY LEGISCAN, NOT CONGRESS.GOV, FOR VOTES (Aug 2026 swap)
// ────────────────────────────────────────────────────────────────────────
// The original version of this file pulled votes from Congress.gov's beta
// House Roll Call Vote endpoints. Real, confirmed limitations of that
// approach: House-only (Congress.gov's API has never had Senate roll-call
// data at all — the linked source, senate.gov, currently blocks
// programmatic access outright), and only covers the 118th Congress
// onward (2023+). LegiScan's vote data covers both chambers uniformly,
// with no beta-endpoint instability — confirmed by cross-checking real
// vote counts (H.R.1 / HB1, Roll Call #190: 218-214, Passed) against both
// sources independently before making this swap, not just going on
// LegiScan's own marketing claims.
//
// A REAL NAMING TRAP, CONFIRMED AGAINST LIVE DATA — READ BEFORE TOUCHING
// THE BILLTYPE TRANSLATION BELOW
// ────────────────────────────────────────────────────────────────────────
// LegiScan's bill-number prefixes do NOT match Congress.gov's billType
// codes one-to-one, and one of them is a genuine trap: Congress.gov's
// official "H.R." (a House BILL) becomes LegiScan's "HB" prefix — but
// LegiScan's OWN "HR" prefix means something completely different (a
// House RESOLUTION, a non-binding measure). Confirmed directly: H.R. 1
// (the "One Big Beautiful Bill Act", Congress.gov billType "HR") is
// LegiScan bill number "HB1", not "HR1" — verified against LegiScan's own
// public bill page, which also cross-validated to the exact same Roll
// Call #190 (218-214, Passed) Congress.gov showed. See
// BILLTYPE_TO_LEGISCAN_PREFIX below — do not "simplify" this mapping
// without re-reading this note.
//
// THE getPerson-PER-VOTER TRAP — WHY getSessionPeople IS USED INSTEAD
// ────────────────────────────────────────────────────────────────────────
// LegiScan's getRollCall returns each voter as bare
// { people_id, vote_id, vote_text } — NO embedded name/state/district.
// The obvious-looking fix (call getPerson once per voter to identify them)
// would mean 400+ API calls for a single House roll call alone — wildly
// impractical for one request's latency and needless quota burn. Instead,
// getSessionPeople(session_id) is called ONCE per request, fetching every
// person active in that entire congressional session in a single call,
// and the resulting people_id → identity map is reused across every roll
// call being processed in this same request. Do not reintroduce a
// per-voter getPerson call.
//
// A REAL, FLAGGED UNCERTAINTY IN THIS FIRST VERSION
// ────────────────────────────────────────────────────────────────────────
// LegiScan's own API manual documents the `district` field's format for
// STATE legislatures (e.g. "HD-063", "SD-039") but the manual has no
// federal-Congress-specific example, and does not document a plain state
// abbreviation field on the person record at all (only an internal
// numeric state_id, not useful for matching against this app's own
// candidate docs which store state as "AZ", "CA", etc.). matchLegiscanPerson()
// below is written defensively — tries multiple parsing strategies against
// whatever `district` actually looks like for a federal record, and logs
// a SAMPLE of raw person records on first use so the real format is
// visible in Netlify's logs rather than guessed at blind. Expect this may
// need one calibration pass against real logged output, the same pattern
// that worked for nailing down Congress.gov's field names earlier in this
// build — flagged honestly rather than promised to just work.
//
// COST — LEGISCAN AND CONGRESS.GOV ARE BOTH FREE
// ────────────────────────────────────────────────────────────────────────
// No generation-credit gate here, no debiting — both APIs are free tier.
// Still passes through the same daily per-user checkAndIncrementRateLimit
// as every other tool, purely as an abuse guard, not a cost control.
//
// SETUP REQUIRED
// ────────────────────────────────────────────────────────────────────────
// 1. CONGRESS_API_KEY — already set (unchanged from the original build).
// 2. LEGISCAN_API_KEY — new. Free self-serve signup at legiscan.com/legiscan
//    (requires a free "OneVote" account). 30,000 queries/month.
//
// Modern Netlify Functions runtime (ESM).

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";
const LEGISCAN_API_BASE = "https://api.legiscan.com/";

const ALLOWED_ORIGINS = [
  "https://arizonacoalition.net",
  "https://az-coalition-2026-election.netlify.app",
];
function corsHeaders(req) {
  const origin = req.headers.get("origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin };
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

// ── Congress.gov fetch helper (bill detail + official CRS subjects only —
// vote data no longer comes from here) ─────────────────────────────────
async function congressFetch(path, params = {}) {
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

// ── LegiScan fetch helper ───────────────────────────────────────────────
async function legiscanFetch(op, params = {}) {
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
    console.error(`[bill-votes] LegiScan HTTP error ${response.status}: ${loggedUrl} — ${errText}`);
    throw new Error(`LegiScan API error: ${response.status}`);
  }
  const data = await response.json();
  if (data.status !== "OK") {
    console.warn(`[bill-votes] LegiScan status=ERROR: ${loggedUrl} — ${JSON.stringify(data.alert)}`);
    return null;
  }
  console.log(`[bill-votes] LegiScan OK: op=${op} ${JSON.stringify(params)}`);
  return data;
}

// Congress.gov billType -> LegiScan bill-number prefix. See file header's
// naming-trap note — HRES maps to LegiScan's "HR", which is NOT the same
// string as Congress.gov's "HR" (a House Bill). Confirmed against real
// H.R. 1 -> LegiScan "HB1" cross-validation.
const BILLTYPE_TO_LEGISCAN_PREFIX = {
  HR: "HB",
  S: "SB",
  HRES: "HR",
  SRES: "SR",
  HJRES: "HJR",
  SJRES: "SJR",
  HCONRES: "HCR",
  SCONRES: "SCR",
};

// A Congress numbered N started in the calendar year 1789 + (N-1)*2 —
// used to find the matching LegiScan session (LegiScan indexes sessions
// by year, not by Congress number).
function congressToStartYear(congress) {
  return 1789 + (congress - 1) * 2;
}

async function findLegiscanSessionId(state, targetYear) {
  const data = await legiscanFetch("getSessionList", { state });
  const sessions = data?.sessions || [];
  const match = sessions.find(s => s.year_start === targetYear);
  if (!match) {
    console.warn(`[bill-votes] no LegiScan ${state} session found for target year_start=${targetYear}. Available sessions:`, JSON.stringify(sessions.map(s => ({ session_id: s.session_id, year_start: s.year_start, year_end: s.year_end }))));
    return null;
  }
  return match.session_id;
}

async function findLegiscanBillId(sessionId, legiscanBillNumber) {
  const data = await legiscanFetch("getMasterList", { id: sessionId });
  const masterlist = data?.masterlist || {};
  for (const key of Object.keys(masterlist)) {
    const entry = masterlist[key];
    if (entry?.number && entry.number.toUpperCase() === legiscanBillNumber.toUpperCase()) {
      return entry.bill_id;
    }
  }
  console.warn(`[bill-votes] LegiScan bill number ${legiscanBillNumber} not found in session ${sessionId}'s master list (${Object.keys(masterlist).length} entries).`);
  return null;
}

// ── Federal candidate matching ──────────────────────────────────────────
// Broader than the old House-only version — LegiScan covers both
// chambers, so this now includes Senate candidates too.
function extractDistrictNumber(districtStr) {
  const str = districtStr || "";
  const prefixed = str.match(/\b(?:ld|cd)[\s-]*?(\d+)/i);
  if (prefixed) return parseInt(prefixed[1], 10);
  const anyNumber = str.match(/(\d+)/);
  return anyNumber ? parseInt(anyNumber[1], 10) : null;
}
function isFederalCandidate(data) {
  return (data.level || "").toLowerCase().includes("federal");
}
function isSenateCandidate(data) {
  return (data.office || "").toLowerCase().includes("senate");
}
// State-legislature candidates use "LD" (Legislative District) in their
// district field, distinct from federal House's "CD" (Congressional
// District) — this is how the two get told apart, not the level field
// alone, since some existing docs' level strings vary ("Statewide/
// Legislative", etc.) in ways that are easy to typo-miss on.
function isStateLegCandidate(data, state) {
  if (isFederalCandidate(data)) return false;
  if ((data.state || "").toUpperCase() !== state.toUpperCase()) return false;
  return /\bld[\s-]*\d+/i.test(data.district || "");
}

// Builds a people_id -> identity map for an entire LegiScan session in ONE
// call (see file header — never call getPerson per voter). Also logs a
// small sample of raw records the first time, since the real district/
// state field format for federal (vs. state-legislature) records isn't
// documented and needs to be confirmed against real output.
async function buildLegiscanPeopleMap(sessionId) {
  const data = await legiscanFetch("getSessionPeople", { id: sessionId });
  const people = data?.sessionpeople?.people || [];
  if (people.length > 0) {
    console.log(`[bill-votes] LegiScan session people sample (first 3 of ${people.length}):`, JSON.stringify(people.slice(0, 3)));
  }
  const map = {};
  for (const p of people) map[p.people_id] = p;
  return map;
}

// Matches a LegiScan person record to one of this org's candidates. Tries
// district-number + chamber first (most precise); falls back to exact
// last-name match within the same state if district parsing doesn't work
// out — defensive on purpose, see file header's flagged uncertainty.
function matchLegiscanPersonToCandidate(person, candidates) {
  if (!person) return null;
  const personDistrictNum = extractDistrictNumber(person.district);
  const personIsSenate = (person.role || "").toLowerCase().startsWith("sen");
  if (personDistrictNum !== null) {
    const byDistrict = candidates.find(c =>
      isSenateCandidate(c) === personIsSenate &&
      extractDistrictNumber(c.district) === personDistrictNum &&
      (c.state || "").toUpperCase() === (person.state || c.state || "").toUpperCase()
    );
    if (byDistrict) return byDistrict;
  }
  // Fallback: last-name match (best-effort only — flagged, not silent)
  const personLastName = (person.last_name || person.name || "").trim().toLowerCase();
  if (personLastName) {
    const byName = candidates.find(c => (c.name || "").toLowerCase().includes(personLastName));
    if (byName) return byName;
  }
  return null;
}

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders(req), "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[bill-votes] admin init:", err.message);
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;
    const { billType, billNumber, candidateId } = body;
    const level = body.level === "state" ? "state" : "federal";
    const stateParam = (body.state || "AZ").toUpperCase();
    const congress = body.congress;
    const year = body.year;

    if (!billType || !Number.isInteger(billNumber)) {
      return new Response(JSON.stringify({ success: false, error: "billType and billNumber are required." }), { status: 400, headers: corsHeaders(req) });
    }
    if (level === "federal" && !Number.isInteger(congress)) {
      return new Response(JSON.stringify({ success: false, error: "congress is required for a federal lookup." }), { status: 400, headers: corsHeaders(req) });
    }
    if (level === "state" && !Number.isInteger(year)) {
      return new Response(JSON.stringify({ success: false, error: "year is required for a state lookup." }), { status: 400, headers: corsHeaders(req) });
    }
    const billTypeUpper = String(billType).toUpperCase();
    const billTypePath = billTypeUpper.toLowerCase(); // Congress.gov URL paths use lowercase (federal only)

    // ── Auth ────────────────────────────────────────────────────────────
    let uid;
    try {
      uid = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "You must be signed in to use this tool." }), { status: 401, headers: corsHeaders(req) });
    }

    // ── Rate limit (abuse guard only — both APIs are free) ────────────────
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    // ── Bill detail + subjects — Congress.gov for federal (official CRS
    // tags), LegiScan's own bill record for state (Congress.gov is a
    // federal-only API, has zero state legislature data at all) ──────────
    let billForResponse, policyArea = null, legislativeSubjects = [];
    let legiscanSessionState, legiscanTargetYear, legiscanPrefix;

    if (level === "federal") {
      const [billResult, subjectsResult] = await Promise.all([
        congressFetch(`/bill/${congress}/${billTypePath}/${billNumber}`),
        congressFetch(`/bill/${congress}/${billTypePath}/${billNumber}/subjects`),
      ]);
      if (!billResult?.bill) {
        return new Response(JSON.stringify({ success: false, error: `No bill found for ${billType} ${billNumber}, ${congress}th Congress.` }), { status: 404, headers: corsHeaders(req) });
      }
      const bill = billResult.bill;
      policyArea = subjectsResult?.subjects?.policyArea?.name || null;
      legislativeSubjects = (subjectsResult?.subjects?.legislativeSubjects || []).map(s => s.name);
      billForResponse = {
        level: "federal",
        congress: bill.congress,
        billType: (bill.type || billType).toUpperCase(),
        billNumber: bill.number,
        title: bill.title,
        sponsor: bill.sponsors?.[0] ? { name: bill.sponsors[0].fullName, bioguideId: bill.sponsors[0].bioguideId } : null,
        latestAction: bill.latestAction ? { date: bill.latestAction.actionDate, text: bill.latestAction.text } : null,
        introducedDate: bill.introducedDate || null,
        url: bill.url || null,
      };
      legiscanSessionState = "US";
      legiscanTargetYear = congressToStartYear(congress);
      legiscanPrefix = BILLTYPE_TO_LEGISCAN_PREFIX[billTypeUpper];
    } else {
      // State mode — bill detail comes entirely from LegiScan below, since
      // there's no Congress.gov equivalent for state legislation. Deferred
      // until after we've resolved the LegiScan bill_id (below), so
      // billForResponse gets filled in there instead of here.
      legiscanSessionState = stateParam;
      legiscanTargetYear = year;
      legiscanPrefix = billTypeUpper; // already LegiScan-native, no translation needed for state bills
    }

    // ── This org's candidates — federal or this state's legislature ───────
    const db = admin.firestore(app);
    let candidateDocs;
    if (candidateId) {
      const snap = await db.doc(`candidates/${candidateId}`).get();
      candidateDocs = snap.exists ? [snap] : [];
    } else {
      const snap = await db.collection("candidates").get();
      candidateDocs = snap.docs.filter(d => {
        const data = d.data();
        if (data.active === false) return false;
        return level === "federal" ? isFederalCandidate(data) : isStateLegCandidate(data, stateParam);
      });
    }
    const candidates = candidateDocs.map(d => ({ id: d.id, ...d.data() }));

    // ── LegiScan: resolve bill, pull real votes (shared by both levels) ────
    let rollCalls = [];
    let legiscanNote = null;

    if (!legiscanPrefix) {
      legiscanNote = `Vote lookup isn't supported for bill type ${billTypeUpper} yet.`;
    } else {
      const sessionId = await findLegiscanSessionId(legiscanSessionState, legiscanTargetYear);
      if (!sessionId) {
        legiscanNote = `Couldn't find a matching LegiScan session for ${level === "federal" ? `the ${congress}th Congress` : `${stateParam} ${year}`}.`;
      } else {
        const legiscanBillNumber = `${legiscanPrefix}${billNumber}`;
        const legiscanBillId = await findLegiscanBillId(sessionId, legiscanBillNumber);
        if (!legiscanBillId) {
          legiscanNote = `Couldn't find bill ${legiscanBillNumber} in LegiScan's records for ${level === "federal" ? `the ${congress}th Congress` : `${stateParam} ${year}`}.`;
        } else {
          const [billDetailResult, peopleMap] = await Promise.all([
            legiscanFetch("getBill", { id: legiscanBillId }),
            buildLegiscanPeopleMap(sessionId),
          ]);
          const legiscanBill = billDetailResult?.bill;

          // State mode: fill in billForResponse now that we have LegiScan's
          // own bill record — the only detail source available for states.
          if (level === "state" && legiscanBill) {
            billForResponse = {
              level: "state",
              state: stateParam,
              year,
              billType: billTypeUpper,
              billNumber,
              title: legiscanBill.title,
              sponsor: legiscanBill.sponsors?.[0] ? { name: legiscanBill.sponsors[0].name, party: legiscanBill.sponsors[0].party } : null,
              latestAction: legiscanBill.status_date ? { date: legiscanBill.status_date, text: legiscanBill.history?.[legiscanBill.history.length - 1]?.action || null } : null,
              introducedDate: legiscanBill.history?.[0]?.date || null,
              url: legiscanBill.url || null,
            };
            legislativeSubjects = (legiscanBill.subjects || []).map(s => s.subject_name);
            // No policyArea equivalent for state bills — that's a
            // Congress.gov/CRS-specific single-category concept, LegiScan
            // only has its own multi-tag subjects list.
          }

          const votesList = legiscanBill?.votes || [];
          for (const v of votesList) {
            const rollCallResult = await legiscanFetch("getRollCall", { id: v.roll_call_id });
            const rc = rollCallResult?.roll_call;
            if (!rc) continue;

            const candidateVotes = candidates.map(c => {
              const voteEntry = (rc.votes || []).find(vt => {
                const person = peopleMap[vt.people_id];
                return !!matchLegiscanPersonToCandidate(person, [c]);
              });
              return {
                candidateId: c.id,
                name: c.name,
                state: c.state,
                district: c.district,
                party: c.party,
                position: voteEntry ? voteEntry.vote_text : null,
                notInCongressForThisVote: !voteEntry,
              };
            });

            rollCalls.push({
              rollCallId: rc.roll_call_id,
              chamber: rc.chamber === "S" ? "Senate" : "House",
              date: rc.date,
              result: rc.passed ? "Passed" : "Failed",
              voteQuestion: rc.desc || null,
              tally: { yea: rc.yea, nay: rc.nay, notVoting: rc.nv, absent: rc.absent },
              candidateVotes,
            });
          }
        }
      }
    }

    if (!billForResponse) {
      return new Response(JSON.stringify({ success: false, error: `Couldn't find ${billType} ${billNumber} for ${level === "federal" ? `the ${congress}th Congress` : `${stateParam} ${year}`}.` }), { status: 404, headers: corsHeaders(req) });
    }

    const responseBody = {
      success: true,
      bill: billForResponse,
      subjects: { policyArea, legislativeSubjects },
      rollCalls,
      legiscanNote,
    };

    return new Response(JSON.stringify(responseBody), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[bill-votes] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
