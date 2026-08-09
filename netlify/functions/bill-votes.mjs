// netlify/functions/bill-votes.mjs
//
// WHAT THIS DOES
// ────────────────────────────────────────────────────────────────────────
// Second half of the bill-lookup feature (resolve-bill.mjs is the first
// half — it turns free text into a bill identifier; this function turns a
// bill identifier into real Congress.gov data, filtered to this org's own
// candidate list). Given { congress, billType, billNumber }, this:
//
//   1. Pulls the bill's own record (title, sponsor, latest action) from
//      Congress.gov.
//   2. Pulls its official CRS subject/policy-area tags (Aug 2026 addition,
//      folded in per the person's request — a free, authoritative
//      enrichment on top of whatever resolve-bill.mjs or the person
//      already knows about the bill).
//   3. Scans the bill's actions for House recorded (roll call) votes.
//   4. For each one found, pulls the real member-by-member breakdown and
//      filters it down to just this org's own federal House candidates
//      (matched via bioguideId, resolved and cached on first use).
//
// TWO REAL, CONFIRMED LIMITATIONS — READ BEFORE ASSUMING A GAP IS A BUG
// ────────────────────────────────────────────────────────────────────────
// (a) HOUSE COVERAGE STARTS AT THE 118TH CONGRESS (2023). Congress.gov's
//     House Roll Call Vote member-position endpoints are beta and only
//     cover 2023-present. A bill's `actions` will still show THAT a
//     recorded vote happened for older bills (the recordedVotes container
//     itself goes back further), but /house-vote/.../members will not
//     have real data for anything before the 118th Congress. This is
//     confirmed against Congress.gov's own beta-endpoint announcement, not
//     a guess. voteCoverageGap below is how a caller distinguishes "a vote
//     happened but this API can't show who voted which way" from "no vote
//     happened at all" — don't collapse these into the same empty state.
// (b) SENATE VOTES ARE NOT AVAILABLE HERE AT ALL, AND NOT JUST BECAUSE OF
//     MISSING API COVERAGE. Congress.gov's API never had Senate roll-call
//     member data to begin with — a bill's actions link out to a raw XML
//     file on senate.gov instead. As of this writing that XML is actively
//     blocked from programmatic access by Senate.gov's own bot protection
//     (a live, unresolved issue on Congress.gov's own GitHub repo, not a
//     theoretical concern) — so even a future attempt to fetch that linked
//     XML directly would currently 403. Senate vote data is real, scoped,
//     future work (a senate.gov-specific integration), not something this
//     function almost does. senateNote below says this plainly rather
//     than silently returning an empty Senate section that looks like a
//     bug.
//
// MATCHING — ONLY INCUMBENTS CAN HAVE A REAL VOTE RECORD
// ────────────────────────────────────────────────────────────────────────
// Congress.gov only has records for people who've actually served. A
// first-time challenger has no bioguideId and never will, for a seat
// they've never held — this function does not attempt a name-based
// search-and-guess for them, it just reports "not in Congress for this
// vote." bioguideId is resolved once per candidate (via
// /member/{state}/{district} — a direct, no-guessing lookup, not a name
// search) and cached back onto the candidate's own Firestore doc so this
// never repeats for the same person. Gated on incumbentStatus === the
// same field public-voter-lookup.mjs / RaceComparison.jsx already read —
// no schema addition beyond the new bioguideId field itself.
//
// COST — THIS IS FREE, UNLIKE resolve-bill.mjs
// ────────────────────────────────────────────────────────────────────────
// Congress.gov is a free API (5,000 req/hour) — no generation-credit gate
// here, no debiting. Still passes through the same daily per-user
// checkAndIncrementRateLimit as every other tool, purely as an abuse
// guard, not a cost control.
//
// SETUP REQUIRED
// ────────────────────────────────────────────────────────────────────────
// 1. Sign up for a free API key at https://api.data.gov/congress/v3 (or
//    the sign-up link surfaced at api.congress.gov).
// 2. Add it as a Netlify env var: CONGRESS_API_KEY.
//
// KNOWN SCOPE LIMIT IN THIS FIRST VERSION
// ────────────────────────────────────────────────────────────────────────
// The bill actions fetch below requests a generous single page (limit=250)
// rather than looping through pagination. Congress.gov's default page size
// is 20; 250 comfortably covers the vast majority of real bills, but an
// exceptionally procedurally-active bill with more than 250 actions could
// theoretically have a recorded vote past that cutoff and miss it. Worth
// revisiting with real pagination if that ever turns out to matter in
// practice — not built preemptively for a case that may never occur.
//
// Modern Netlify Functions runtime (ESM).

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";
// House Roll Call Vote member-position coverage starts at the 118th
// Congress (2023) — confirmed against Congress.gov's own beta-endpoint
// announcement. See file header note (a).
const HOUSE_VOTE_COVERAGE_MIN_CONGRESS = 118;

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

// ── Congress.gov fetch helper ─────────────────────────────────────────
async function congressFetch(path, params = {}) {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    throw new Error("CONGRESS_API_KEY not configured — set it in Netlify's environment variables.");
  }
  const url = new URL(`${CONGRESS_API_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await fetch(url.toString());
  if (!response.ok) {
    if (response.status === 404) return null; // not found is a real, expected outcome (e.g. bad bill number) — not an error to throw
    const errText = await response.text().catch(() => "");
    throw new Error(`Congress.gov API error: ${response.status} ${errText}`.trim());
  }
  return response.json();
}

// ── Federal House candidate matching — same permissive substring
// convention already established in public-voter-lookup.mjs, reused
// deliberately rather than re-invented, since Office/Level are free text
// from the source Sheet, not a fixed enum. ────────────────────────────
function extractDistrictNumber(districtStr) {
  const str = districtStr || "";
  const prefixed = str.match(/\b(?:ld|cd)[\s-]*?(\d+)/i);
  if (prefixed) return parseInt(prefixed[1], 10);
  const anyNumber = str.match(/(\d+)/);
  return anyNumber ? parseInt(anyNumber[1], 10) : null;
}

function isFederalHouseCandidate(data) {
  const level = (data.level || "").toLowerCase();
  const office = (data.office || "").toLowerCase();
  if (!level.includes("federal")) return false;
  if (office.includes("senate")) return false;
  return extractDistrictNumber(data.district) !== null;
}

function isIncumbent(data) {
  return (data.incumbentStatus || "").toLowerCase().includes("incumbent");
}

// ── bioguideId resolution + caching ────────────────────────────────────
// Only attempted for federal House INCUMBENTS — a first-time challenger
// has no bioguideId and a name-search-and-guess would just misfire (see
// file header). Direct district lookup, not a name search, so this either
// finds the real current officeholder or it doesn't — no ambiguity to
// mis-resolve.
async function resolveBioguideId(db, candidateDoc, data) {
  if (data.bioguideId) return data.bioguideId; // already cached — no repeat lookup
  if (!isIncumbent(data)) return null;
  const state = (data.state || "AZ").toUpperCase();
  const district = extractDistrictNumber(data.district);
  if (district === null) return null;

  const result = await congressFetch(`/member/${state}/${district}`);
  const bioguideId = result?.members?.[0]?.bioguideId || null;
  if (bioguideId) {
    // Cache it — this is the ONLY reason this function ever writes to a
    // candidate doc. Never overwrites anything else on the record.
    await db.doc(`candidates/${candidateDoc.id}`).set({ bioguideId }, { merge: true });
  }
  return bioguideId;
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
    const { congress, billType, billNumber, candidateId } = body; // candidateId optional — scopes to one candidate (Workflow 2a) instead of the full org list (Workflow 1)

    if (!Number.isInteger(congress) || !billType || !Number.isInteger(billNumber)) {
      return new Response(JSON.stringify({ success: false, error: "congress, billType, and billNumber are required." }), { status: 400, headers: corsHeaders(req) });
    }
    const billTypePath = String(billType).toLowerCase(); // Congress.gov URL paths use lowercase (e.g. /bill/117/hr/4346) even though the type enum itself is uppercase

    // ── Auth ────────────────────────────────────────────────────────────
    let uid;
    try {
      uid = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "You must be signed in to use this tool." }), { status: 401, headers: corsHeaders(req) });
    }

    // ── Rate limit (abuse guard only — Congress.gov is free, no credit gate) ─
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    // ── Bill detail + subjects (parallel — independent reads) ────────────
    const [billResult, subjectsResult] = await Promise.all([
      congressFetch(`/bill/${congress}/${billTypePath}/${billNumber}`),
      congressFetch(`/bill/${congress}/${billTypePath}/${billNumber}/subjects`),
    ]);

    if (!billResult?.bill) {
      return new Response(JSON.stringify({ success: false, error: `No bill found for ${billType} ${billNumber}, ${congress}th Congress.` }), { status: 404, headers: corsHeaders(req) });
    }
    const bill = billResult.bill;
    const policyArea = subjectsResult?.subjects?.policyArea?.name || null;
    const legislativeSubjects = (subjectsResult?.subjects?.legislativeSubjects || []).map(s => s.name);

    // ── Find House recorded votes in the bill's actions ───────────────────
    // See file header's "KNOWN SCOPE LIMIT" note on the single-page (250)
    // fetch instead of full pagination.
    const actionsResult = await congressFetch(`/bill/${congress}/${billTypePath}/${billNumber}/actions`, { limit: 250 });
    const houseRecordedVotes = (actionsResult?.actions || [])
      .flatMap(a => a.recordedVotes || [])
      .filter(rv => rv.chamber === "House");

    const senateRecordedVoteCount = (actionsResult?.actions || [])
      .flatMap(a => a.recordedVotes || [])
      .filter(rv => rv.chamber === "Senate").length;

    // ── This org's federal House candidates, with bioguideId resolved/cached ─
    const db = admin.firestore(app);
    let candidateDocs;
    if (candidateId) {
      const snap = await db.doc(`candidates/${candidateId}`).get();
      candidateDocs = snap.exists ? [snap] : [];
    } else {
      const snap = await db.collection("candidates").where("active", "==", true).get();
      candidateDocs = snap.docs.filter(d => isFederalHouseCandidate(d.data()));
    }

    const candidatesWithBioguide = await Promise.all(
      candidateDocs.map(async (doc) => {
        const data = doc.data();
        const bioguideId = await resolveBioguideId(db, doc, data);
        return { id: doc.id, name: data.name, district: data.district, party: data.party, incumbentStatus: data.incumbentStatus, bioguideId };
      })
    );

    // ── Pull member-position breakdown for each House recorded vote ───────
    // Field names confirmed directly against Congress.gov's own documented
    // schema (voteCast, bioguideID) — no more defensive guessing needed.
    const rollCalls = [];
    for (const rv of houseRecordedVotes) {
      const withinCoverage = rv.congress >= HOUSE_VOTE_COVERAGE_MIN_CONGRESS;
      let positionsByBioguide = {};
      let voteMeta = null;
      if (withinCoverage) {
        const membersResult = await congressFetch(`/house-vote/${rv.congress}/${rv.sessionNumber}/${rv.rollNumber}/members`);
        voteMeta = membersResult ? {
          result: membersResult.result || null,
          voteQuestion: membersResult.voteQuestion || null,
          voteType: membersResult.voteType || null,
          sourceDataURL: membersResult.sourceDataURL || null,
        } : null;
        for (const m of membersResult?.results || []) {
          if (m.bioguideID) positionsByBioguide[m.bioguideID] = m.voteCast || null;
        }
      }
      rollCalls.push({
        rollNumber: rv.rollNumber,
        congress: rv.congress,
        sessionNumber: rv.sessionNumber,
        date: rv.date,
        voteCoverageGap: !withinCoverage, // true = a real vote happened but member-level data isn't available for this Congress (pre-118th) — see file header note (a). NOT the same as "no vote happened."
        result: voteMeta?.result || null, // e.g. "Passed" / "Failed"
        voteQuestion: voteMeta?.voteQuestion || null, // e.g. "On Passage"
        voteType: voteMeta?.voteType || null, // e.g. "Yea-and-Nay"
        sourceDataURL: voteMeta?.sourceDataURL || null,
        candidateVotes: candidatesWithBioguide.map(c => ({
          candidateId: c.id,
          name: c.name,
          district: c.district,
          party: c.party,
          position: c.bioguideId ? (positionsByBioguide[c.bioguideId] || null) : null,
          notInCongressForThisVote: !c.bioguideId, // this candidate has no resolved bioguideId at all — either a non-incumbent, or an incumbent whose district lookup didn't resolve
        })),
      });
    }

    const responseBody = {
      success: true,
      bill: {
        congress: bill.congress,
        billType: (bill.type || billType).toUpperCase(),
        billNumber: bill.number,
        title: bill.title,
        sponsor: bill.sponsors?.[0] ? { name: bill.sponsors[0].fullName, bioguideId: bill.sponsors[0].bioguideId } : null,
        latestAction: bill.latestAction ? { date: bill.latestAction.actionDate, text: bill.latestAction.text } : null,
        introducedDate: bill.introducedDate || null,
        url: bill.url || null,
      },
      subjects: { policyArea, legislativeSubjects },
      rollCalls,
      senateNote: senateRecordedVoteCount > 0
        ? `This bill also had ${senateRecordedVoteCount} recorded Senate vote(s), but Senate vote data isn't available through this tool yet — Congress.gov's API doesn't expose Senate roll-call positions, and the linked source (senate.gov) currently blocks automated access. Real, scoped future work, not a bug.`
        : null,
    };

    return new Response(JSON.stringify(responseBody), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[bill-votes] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
