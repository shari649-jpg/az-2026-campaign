// src/lib/electionCalendar.js
//
// Single source of truth for THIS election cycle's key dates — Election Day
// and the early-voting window. Built Sept 2026 after a real production
// incident: Message Machine invented "November 5th" as Election Day (the
// actual 2024 U.S. general election date — evidently a strong training-data
// prior the model fell back on) and, applying Arizona's real "early voting
// starts 27 days before Election Day" rule to that wrong assumed date,
// silently RECOMPUTED early voting as starting October 9th — overriding the
// correct October 7th the user had actually typed into the Issue/Content
// field. Confirmed by reading the actual prompt sent to Claude: the literal
// user-typed date was passed through untouched, and nothing in the codebase
// hardcoded either wrong date — the model derived them itself. Full incident
// detail: see the changelog entry dated the same day this file was added.
//
// This constant is injected into every AI prompt this app builds (Message
// Machine, Rebuttal Generator, Storm Chasers/public regenerate) as an
// authoritative KEY DATES fact block via keyDatesBlock() below, specifically
// so the model never has to guess, assume, or derive these dates from
// partial input. guardrails.js's DATE FIDELITY rule instructs the model to
// treat this block — plus whatever the user's own input says — as the only
// legitimate source for any Election Day or early-voting date it states,
// and forbids recomputing or "correcting" a date using outside knowledge of
// election-law timelines (the exact mechanism that caused this incident).
//
// ⚠️ UPDATE THIS EVERY ELECTION CYCLE. Nothing else in the app enforces
// this automatically except the staleness banner on the Admin page
// (isElectionCalendarStale() below) — that only fires ONCE Election Day
// has already passed, as a last-resort catch, not a substitute for
// updating this file proactively before the next cycle's early-voting
// window opens.
//
// STANDING NOTE — revisit January 1, 2027: this file is single-cycle,
// Arizona-only, and lives in the code (requires a deploy to change). That's
// a deliberate, accepted tradeoff for shipping the fix fast today, not a
// permanent design decision. Once other states' organizations are added to
// this app, a single hardcoded constant like this will NOT scale — every
// state will need its own key-dates record, almost certainly Firestore-
// backed and editable from the Admin panel (consistent with the direction
// candidates/Issues data has already been migrating) rather than a code
// constant someone has to remember to edit and redeploy per state per
// cycle. Don't let this quietly stay AZ-only-and-hardcoded forever — this
// comment is the reminder, and it should be copied into every Handoff until
// that migration happens.

export const ELECTION_CALENDAR = {
  cycleLabel: "2026 Arizona General Election",
  electionDate: "2026-11-03",
  electionDateLabel: "Tuesday, November 3, 2026",
  earlyVotingStart: "2026-10-07",
  earlyVotingStartLabel: "Wednesday, October 7, 2026",
  earlyVotingEnd: "2026-10-30",
  earlyVotingEndLabel: "Friday, October 30, 2026",
};

// True once today is past Election Day for the cycle recorded above — a
// last-resort signal that this file is now stale and needs updating for
// the next cycle. Checked by AdminPage.jsx to show a banner; deliberately
// NOT wired into the AI prompts themselves — a stale KEY DATES block being
// silently withheld from the model the day after it goes stale would just
// reopen the exact gap (model guessing with no ground truth) this file
// exists to close.
export function isElectionCalendarStale() {
  const today = new Date();
  const electionDay = new Date(`${ELECTION_CALENDAR.electionDate}T23:59:59`);
  return today > electionDay;
}

// The fact block injected into every AI prompt. Kept short and unambiguous
// on purpose — this is meant to be read as ground truth, not persuasive
// copy, and it's paired with guardrails.js's DATE FIDELITY rule wherever
// it's used.
export function keyDatesBlock() {
  const c = ELECTION_CALENDAR;
  return `KEY DATES — ${c.cycleLabel} (authoritative — do not override, recompute, or "correct" these):
- Election Day: ${c.electionDateLabel}
- Early voting window: ${c.earlyVotingStartLabel} through ${c.earlyVotingEndLabel}`;
}
