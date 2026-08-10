// netlify/functions/bill-votes.mjs
//
// WHAT THIS DOES (rearchitected Aug 2026 — LegiScan-only, bill_id-driven)
// ────────────────────────────────────────────────────────────────────────
// Second half of the bill-lookup feature (resolve-bill.mjs is the first
// half — it turns free text into a real, already-verified LegiScan
// bill_id via search, not a guessed identifier). Given { billId, level,
// state }, this:
//
//   1. Pulls the bill's own record (title, sponsor, full status history,
//      LegiScan's own subject tags) directly from LegiScan's getBill.
//      Federal and state are now fully symmetric — both LegiScan-only. See
//      "CONGRESS.GOV IS NO LONGER USED HERE" below for why.
//   2. Pulls the ACTUAL VOTE BREAKDOWN, also from LegiScan. Covers both
//      House and Senate uniformly, for both federal and state.
//
// CONGRESS.GOV IS NO LONGER USED HERE (Aug 2026 decision)
// ────────────────────────────────────────────────────────────────────────
// Previously this file called Congress.gov for federal bill detail and
// the official CRS subject/policy-area tag, keeping LegiScan only for
// votes. That's gone: LegiScan tracks Congress under its own "US"
// jurisdiction code with the same schema states use, so there's no longer
// a reason to maintain two data sources or the billType/congress <->
// LegiScan-prefix translation between them (a real, confirmed trap in the
// old version — Congress.gov's "H.R." became LegiScan's "HB", while
// LegiScan's OWN "HR" meant something else entirely, House Resolution).
// Direct decision: LegiScan's own subject tags cover the same
// informational role the CRS Policy Area tag did (a display label on the
// bill detail page); nothing in this feature used CRS tags for search or
// candidate matching, so nothing functional is lost. CONGRESS_API_KEY is
// unused by this feature now.
//
// bill_id COMES DIRECTLY FROM SEARCH — NO MORE SESSION-GUESSING
// ────────────────────────────────────────────────────────────────────────
// The old version had to guess which LegiScan session a bill lived in
// (a state can have more than one session tagged to the same calendar
// year) by scanning master lists. That's gone too: resolve-bill.mjs's
// search already returns a definitive real bill_id, and LegiScan's own
// getBill response includes session_id directly on the record — so this
// file just calls getBill(billId) once and reads session_id off the
// result to fetch the chamber roster. One real API call fewer per
// request, and a whole class of "which session" ambiguity removed
// structurally rather than defended against.
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
// need one calibration pass against real logged output — flagged honestly
// rather than promised to just work.
//
// COST — LEGISCAN IS FREE
// ────────────────────────────────────────────────────────────────────────
// No generation-credit gate here, no debiting — LegiScan is free tier.
// Still passes through the same daily per-user checkAndIncrementRateLimit
// as every other tool, purely as an abuse guard, not a cost control.
//
// SETUP REQUIRED
// ────────────────────────────────────────────────────────────────────────
// LEGISCAN_API_KEY — free self-serve signup at legiscan.com/legiscan
// (requires a free "OneVote" account). 30,000 queries/month.
// CONGRESS_API_KEY is no longer required by this feature.
//
// Modern Netlify Functions runtime (ESM).

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";
import { legiscanFetch } from "./legislative-lookup.mjs";

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
// THE REAL BUG (Aug 2026, found via a live match-integrity-check failure
// with a non-constant over-match ratio across different roll calls —
// 14/7, 58/30, 39/12, 24/8, 104/60 — which is exactly what you'd expect
// from a variable number of tracked candidates per seat, not a constant
// parsing mistake). District number + chamber alone does NOT uniquely
// identify a specific real vote — this org tracks MULTIPLE candidates per
// seat (an incumbent plus primary/general challengers), and a challenger
// who has never held that seat structurally could not have cast a
// historical vote in it. Matching purely on district+chamber attributed
// the SAME real vote to every tracked candidate for that seat, incumbent
// or not. The original Congress.gov-based version of this file got this
// right (it gated matching on incumbentStatus); that gate was lost during
// the LegiScan rewrite when bioguideId resolution went away, without a
// replacement check being added for the new district+chamber matching
// approach. Restored here, applied to BOTH levels (federal candidate
// matching likely had this same latent bug, just not yet observed on
// live data the way the state path was).
//
// Known accepted limitation, same as the original federal design: a
// former legislator now running again again DID cast real historical
// votes during their prior term but isIncumbent() here only reflects
// CURRENT status, so their past votes won't be attributed to them. This
// was already an accepted v1 limitation for federal, not new scope.
function isIncumbent(data) {
  return (data.incumbentStatus || "").toLowerCase().includes("incumbent");
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

// Matches a LegiScan person record to one of this org's candidates via
// district number + chamber (Senate/House) — this should be sufficient on
// its own since candidates are already pre-filtered to one state before
// this is ever called (a given LD has exactly one Senator and, typically,
// two House members — district+chamber is enough to disambiguate within
// a single state's own roster).
//
// REAL BUG FOUND AND FIXED HERE (Aug 2026): the original version also
// compared state (`person.state || c.state`) — but when person.state is
// undefined (likely always, since LegiScan's documented person schema has
// no plain state-abbreviation field), that expression silently falls back
// to comparing c.state against itself, which is always true — a
// safety check that did nothing. Removed rather than "fixed" with a guess
// at the real field name, since candidates are already state-scoped
// upstream and don't need it.
//
// The previous version also had a loose last-name .includes() fallback
// when district matching failed, which is exactly the kind of thing that
// can cross-match unrelated people on a short/common surname substring —
// removed. A missing match (falls into "not in Congress"/no record) is a
// data gap; a WRONG match is actively harmful for a tool making claims
// about how someone voted. Asymmetric risk — better to under-match than
// mismatch.
// Exact (not fuzzy) name matching — required in addition to district+
// chamber as of this fix. Checks whether LegiScan's last_name matches ANY
// single token, or any 2- or 3-token run, in the candidate's full name —
// handles multi-word surnames confirmed present in this org's own real
// data ("De Los Santos", "Stahl Hamilton"), not just simple single-word
// ones. This is intentionally an EXACT token match, not the substring
// .includes() check removed earlier — that was the original bug (a loose
// substring could cross-match unrelated people); this is narrow by
// design: it only ever fires after district+chamber has already reduced
// the field to a small set, and even then requires a real token match,
// not a partial one.
function namesLikelyMatch(candidateName, personLastName) {
  if (!personLastName) return false;
  const target = personLastName.trim().toLowerCase();
  if (!target) return false;
  const tokens = (candidateName || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.includes(target)) return true;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (`${tokens[i]} ${tokens[i + 1]}` === target) return true;
  }
  for (let i = 0; i < tokens.length - 2; i++) {
    if (`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}` === target) return true;
  }
  return false;
}

// THE REMAINING BUG THIS FIXES (Aug 2026, found via residual over-matching
// that survived the isIncumbent() fix — e.g. 12 matched vs 9 real voters,
// 11 vs 8): Arizona HOUSE districts are multi-member — each LD elects TWO
// representatives, not one. District+chamber alone narrows a vote down to
// "this LD's House delegation," which can be two different real people,
// not a unique individual the way it is for Senate (single-member). Both
// real co-district incumbents could previously inherit the same vote
// incorrectly, since nothing distinguished which of the two actually cast
// it. Name matching (see namesLikelyMatch above) is what actually
// disambiguates them.
function matchLegiscanPersonToCandidate(person, candidates) {
  if (!person) return null;
  const personDistrictNum = extractDistrictNumber(person.district);
  if (personDistrictNum === null) return null; // no fallback anymore — see note above
  const personIsSenate = (person.role || "").toLowerCase().startsWith("sen");
  return candidates.find(c =>
    isSenateCandidate(c) === personIsSenate &&
    extractDistrictNumber(c.district) === personDistrictNum &&
    namesLikelyMatch(c.name, person.last_name)
  ) || null;
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
    const { billId, candidateId } = body;
    const level = body.level === "state" ? "state" : "federal";
    const stateParam = (body.state || "AZ").toUpperCase();

    if (!Number.isInteger(billId)) {
      return new Response(JSON.stringify({ success: false, error: "billId is required." }), { status: 400, headers: corsHeaders(req) });
    }

    // ── Auth ────────────────────────────────────────────────────────────
    let uid;
    try {
      uid = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "You must be signed in to use this tool." }), { status: 401, headers: corsHeaders(req) });
    }

    // ── Rate limit (abuse guard only — LegiScan is free) ──────────────────
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    // ── Bill detail — LegiScan only now, federal and state alike. billId
    // already came from a real search hit (resolve-bill.mjs), so there's
    // no session-guessing needed: getBill returns session_id directly on
    // the record, used below to pull the chamber roster in one call. ─────
    const billDetailResult = await legiscanFetch("getBill", { id: billId });
    const legiscanBill = billDetailResult?.bill;
    if (!legiscanBill) {
      return new Response(JSON.stringify({ success: false, error: `No bill found for LegiScan bill_id ${billId}.` }), { status: 404, headers: corsHeaders(req) });
    }
    // One-time diagnostic: confirm the real shape of getBill's top-level
    // fields (session_id, session.session_name, etc.) against production
    // output — same "log real sample, calibrate after" convention used
    // elsewhere in this file, not blindly assumed.
    console.log(`[bill-votes] getBill sample for billId=${billId}:`, JSON.stringify({ session_id: legiscanBill.session_id, session: legiscanBill.session, bill_type: legiscanBill.bill_type, bill_number: legiscanBill.bill_number, state: legiscanBill.state }));
    const sessionId = legiscanBill.session_id;
    const sessionName = legiscanBill.session?.session_name || legiscanBill.session?.session_title || null;

    // Full status history — no cap, direct request ("all actions on the
    // bill like addendums, etc."), unlike the old federal path's 30-action
    // cap from Congress.gov. LegiScan's own history array is already what
    // state bills showed unmodified; federal now gets the same treatment.
    const history = (legiscanBill.history || []).map(h => ({ date: h.date, action: h.action, chamber: h.chamber === "S" ? "Senate" : h.chamber === "H" ? "House" : null }));
    const billForResponse = {
      level,
      state: legiscanBill.state || (level === "federal" ? "US" : stateParam),
      billId: legiscanBill.bill_id,
      billType: legiscanBill.bill_type || null,
      billNumber: legiscanBill.bill_number || null,
      sessionName,
      title: legiscanBill.title,
      summary: legiscanBill.description || null,
      sponsor: legiscanBill.sponsors?.[0] ? { name: legiscanBill.sponsors[0].name, party: legiscanBill.sponsors[0].party } : null,
      latestAction: history.length > 0 ? history[history.length - 1] : null,
      introducedDate: history.length > 0 ? history[0].date : null,
      history,
      url: legiscanBill.url || null,
    };
    // LegiScan's own multi-tag subject list — see file header on why this
    // replaces the official CRS Policy Area tag for federal bills too now.
    const legislativeSubjects = (legiscanBill.subjects || []).map(s => s.subject_name);

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

    // ── LegiScan: pull real votes ───────────────────────────────────────
    let rollCalls = [];
    let legiscanNote = null;

    if (!sessionId) {
      legiscanNote = "This bill's record is missing a LegiScan session reference — can't look up the chamber roster to match votes.";
    } else {
      const peopleMap = await buildLegiscanPeopleMap(sessionId);
      const votesList = legiscanBill.votes || [];
      if (votesList.length === 0) {
        legiscanNote = "LegiScan has no recorded roll calls for this bill yet.";
      }
      for (const v of votesList) {
        const rollCallResult = await legiscanFetch("getRollCall", { id: v.roll_call_id });
        const rc = rollCallResult?.roll_call;
        if (!rc) continue;

        // Some LegiScan "roll call" entries are procedural committee
        // actions with NO individual member positions attached at all
        // (a 0-0 tally, an empty votes[] array) — a voice vote or
        // unanimous-consent action, not a missing-data bug. Flagging
        // this explicitly so the frontend can say "no individual
        // positions recorded for this action" instead of the
        // misleading alternative: every single tracked candidate
        // showing up in a "not in Congress" bucket, which wrongly
        // implies none of them were serving at the time.
        const hasIndividualVotes = (rc.votes || []).length > 0;

        // One-time diagnostic per roll call: log the raw district
        // field for a few real voters in THIS specific committee/
        // floor vote context. The general getSessionPeople sample
        // logged earlier reflects the whole chamber roster, which may
        // not be identical in shape to how individual roll-call voter
        // records resolve through peopleMap — this confirms the exact
        // format actually driving the match logic above.
        if (hasIndividualVotes) {
          const sample = (rc.votes || []).slice(0, 3).map(vt => ({ people_id: vt.people_id, district: peopleMap[vt.people_id]?.district, role: peopleMap[vt.people_id]?.role, name: peopleMap[vt.people_id]?.name }));
          console.log(`[bill-votes] roll call ${rc.roll_call_id} voter sample:`, JSON.stringify(sample));
        }

        const candidateVotes = candidates.map(c => {
          // Non-incumbents are never even checked against real votes —
          // see isIncumbent()'s header note above for why. This is the
          // actual fix, not the district/chamber matching logic itself
          // (which was already narrow and correct on its own — the bug
          // was including candidates in the search pool who could
          // never have cast a real vote in the first place).
          const voteEntry = isIncumbent(c) ? (rc.votes || []).find(vt => {
            const person = peopleMap[vt.people_id];
            return !!matchLegiscanPersonToCandidate(person, [c]);
          }) : null;
          return {
            candidateId: c.id,
            name: c.name,
            state: c.state,
            district: c.district,
            party: c.party,
            position: voteEntry ? voteEntry.vote_text : null,
            notInCongressForThisVote: hasIndividualVotes && !voteEntry,
          };
        });

        // Integrity check — a real safety net, not decoration. We
        // cannot possibly have matched more of our own candidates to
        // real votes than there were actual voters in this roll call
        // (each real voter maps to at most one of our candidates,
        // since district+chamber is unique within a state). If this
        // ever fires, it means the matching logic has a bug again —
        // surfaced loudly to the frontend instead of silently
        // displaying vote positions that can't all be real. This is
        // exactly the class of bug already found and fixed once in
        // this file (a tautological state check plus a too-loose
        // name-substring fallback caused a 6-3-1 real tally to
        // produce 12+ matched candidates) — this check exists so a
        // regression of that bug is caught automatically, not by
        // someone manually counting names against a tally again.
        const realVoterCount = (rc.votes || []).length;
        const matchedCount = candidateVotes.filter(cv => cv.position !== null).length;
        const matchIntegrityWarning = matchedCount > realVoterCount;
        if (matchIntegrityWarning) {
          console.error(`[bill-votes] MATCH INTEGRITY FAILURE on roll call ${rc.roll_call_id}: matched ${matchedCount} candidates but only ${realVoterCount} people actually voted. This is impossible and means matchLegiscanPersonToCandidate has a bug.`);
        }

        rollCalls.push({
          rollCallId: rc.roll_call_id,
          chamber: rc.chamber === "S" ? "Senate" : "House",
          date: rc.date,
          result: rc.passed ? "Passed" : "Failed",
          voteQuestion: rc.desc || null,
          tally: { yea: rc.yea, nay: rc.nay, notVoting: rc.nv, absent: rc.absent },
          noIndividualVoteData: !hasIndividualVotes,
          matchIntegrityWarning,
          candidateVotes,
        });
      }
    }

    const responseBody = {
      success: true,
      bill: billForResponse,
      subjects: { legislativeSubjects },
      rollCalls,
      legiscanNote,
    };

    return new Response(JSON.stringify(responseBody), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[bill-votes] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
