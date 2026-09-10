// lib/guardrails.js
//
// Shared factual-accuracy guardrail for every AI prompt-builder in the app
// (Message Machine, Rebuttal Generator, and — once built — Storm Chasers'
// generate-storm-text). Single source of truth so the rule can't drift out
// of sync between files, which is exactly what had happened before this
// was extracted (four near-identical copies across message-machine.jsx
// alone, plus a fifth in rebuttal-campaign-generator.jsx).
//
// Rescoped July 2026 (Handoff #15, decision #6). Previously this guardrail
// treated the user's own issue/focalPoint input the same as any other
// unverified claim, which caused the model to hedge even around content
// the user typed themselves. Now:
//   - The user's own input is trusted source material — build on it
//     directly instead of writing around it.
//   - The only heightened-scrutiny case is a real, named person paired
//     with an accusation of wrongdoing, criminal conduct, or scandal —
//     that combination needs confirmed public-record sourcing already
//     present in the input. General topic content with no named
//     individual isn't subject to that extra scrutiny.
//
// SELF-CONTRADICTION flag added July 2026 (Handoff #22). Found live: a
// user rephrased a post whose own cited evidence said the 2020 election
// was NOT altered, but the post's own closing line asserted it WAS stolen
// — Claude generated it anyway, since nothing here checks a post against
// itself. This is deliberately narrower than a general fact-checking
// layer: the guardrail above already trusts the user's input as true, on
// purpose (that's the whole point of the Handoff #15 rescope, and this
// isn't reopening it). This addition only catches the post disagreeing
// with its OWN stated evidence — an internal-consistency check, not an
// external truth check — and it never blocks or refuses. It surfaces a
// flag so a human decides whether the contradiction was intentional
// (e.g. rebuttal framing that states a lie in order to knock it down) or
// a genuine mistake.
// TENSE rule added Aug 2026 (messaging-modifier revision, Option A).
// Modeled structurally on the CANDIDATE STATUS rule above/below it: read a
// timing signal already present in the input and don't contradict it,
// rather than adding a new user-facing field. This is a first pass at a
// real, observed problem (past events written in urgent present tense,
// most often seen on candidate content) — deliberately the cheaper of two
// options considered (the other being an explicit Tense field/dropdown).
// Revisit and consider the explicit-field approach if this inference-based
// version doesn't hold up in practice.
//
// DATE FIDELITY rule added Sept 2026, real production incident. A user
// typed "early voting starts Oct 7th" into Issue/Content with no election
// date stated anywhere in that generation's input. Every platform's output
// said early voting started "October 9th" and named the election "November
// 5th" — instead of just repeating the given Oct 7th. Root-caused by
// reading the actual prompt sent to Claude (confirmed no code bug: the
// literal input text was passed through untouched, nothing hardcoded either
// wrong date). Working theory, consistent with the exact arithmetic: the
// model filled the missing Election Day from a strong training-data prior
// (Nov 5, 2024 — the actual most recent U.S. general election) and then
// applied Arizona's real "early voting starts 27 days before Election Day"
// rule to THAT wrong date (Nov 5 − 27 = Oct 9), overriding the correct Oct
// 7th it had already been given (Nov 3, the real 2026 date, − 27 = Oct 7).
// The pre-existing "NEVER invent... a date that isn't present in the input"
// line didn't stop this, because the model wasn't inventing a date from
// nothing — it was deriving one from a partial input plus outside knowledge,
// which reads as different from "invention" even though the effect is the
// same: a wrong date stated as fact. This rule closes that specific gap.
// Paired with electionCalendar.js's keyDatesBlock(), now injected into every
// prompt that uses this guardrail, so the model always has the real dates
// and never has to fill a gap at all.
// TIGHTENED Sept 8, 2026 (Handoff #48, prompt-consolidation pass; applied
// Sept 9, 2026 per that handoff's punch list item 1). 4,480 -> 3,206 chars
// (-28%). Two real content changes, not just trimming:
//   1. DATE FIDELITY rewritten from instance-specific ("Election Day and
//      the early-voting window," the AZ N-days-before formula) to general
//      ("every date mentioned in this prompt... a filing deadline, or any
//      other date"). The narrow version only ever covered the one date
//      type behind the Sept incident above; this closes the same
//      "deriving isn't inventing" loophole for every other date type
//      (special elections, filing deadlines, future cycles) instead of
//      needing its own incident first.
//   2. The three parallel "never invent X" bullets (stats/dates, quotes,
//      named entities) were merged into one — same rules, no content
//      dropped, just no longer three near-identical sentences in a row.
//
// OFFICEHOLDER FIDELITY rule added Sept 2026, same real-incident pattern as
// DATE FIDELITY above and the same root cause: a strong training-data
// prior overriding available current information. Confirmed real incident:
// generated posts described Donald Trump in PAST tense, as a former
// president, despite his being the actual sitting President. Paired with
// currentOfficeholders.js's currentOfficeholdersBlock(), now injected into
// every prompt that uses this guardrail (see guardrailAndVoiceBlock() in
// message-machine.jsx), so the model always has the real current
// officeholder and never has to fill the gap from a stale prior.
export const FACTUAL_ACCURACY_GUARDRAIL = `FACTUAL ACCURACY:
- Treat the user's input (issue, focal point, false narrative, or existing message being rewritten) as trusted source material — build on its facts, figures, and names directly instead of hedging around them.
- NEVER invent, fabricate, estimate, or paraphrase any statistic, percentage, vote count, dollar figure, poll number, date, quote, named person, organization, study, bill, court case, or law that isn't present in the input. Quotes must be used exactly as given, never reworded.
- DATE FIDELITY: State a specific date only if it is explicitly given — in a KEY DATES block (if one appears in this prompt) or directly in the user's own input. Never compute, derive, infer, or "correct" any date using outside knowledge, memorized precedent, or a rule you know to be generally true (e.g., a fixed number of days before an election) — even when you're confident the calculation is accurate, applying it to an unstated date is the same as inventing one. This applies to every date mentioned in this prompt — election day, an early-voting or registration window, a filing deadline, or any other date — not only whatever a KEY DATES block happens to list. If a date isn't explicitly given anywhere, write around it (e.g. "election day," "the deadline," "before voting closes") rather than naming or calculating one.
- OFFICEHOLDER FIDELITY: If a CURRENT OFFICEHOLDERS block appears in this prompt, it is the sole authoritative source for who currently holds that office — never override, "correct," or recompute it using outside knowledge, memorized precedent, or who you believe held that office as of your own training. Write about a currently-serving officeholder in PRESENT tense (they ARE the officeholder), never as a past or former one, even if your own training data suggests otherwise. If no CURRENT OFFICEHOLDERS block or explicit user input states who holds a given office, don't assume — write around it rather than asserting a status you can't confirm.
- CANDIDATE STATUS: never contradict a given status (Incumbent, Challenger, Open Seat). A Challenger or Open Seat candidate must never be framed as already holding the office ("came to Congress," "in the Senate," "as your Representative"). If no status is given, don't assume incumbency — write about their record and candidacy without asserting they currently hold the seat.
- TENSE: match verb tense to the input's timing. Don't describe a past event in urgent present tense ("is voting against," "is taking away") when it already happened ("voted against," "took away"), and don't describe a pending or proposed action as if it already occurred. With no clear timing signal, default to present tense for ongoing conditions.
- NAMED-PERSON WRONGDOING: any accusation of wrongdoing, criminal conduct, or scandal against a real, named individual must trace to confirmed public-record sourcing already in the input — don't embellish or extend it. Applies only when a named individual and a wrongdoing claim appear together.
- Where the input doesn't give a specific fact, write around it using general, non-falsifiable framing ("experts have documented," "public records show") rather than inventing what those records say.
- SELF-CONTRADICTION: if the input debunks a claim ("no evidence of fraud," "courts rejected it"), the post's conclusion must agree — never flip to the punchier, false version.
- CONTRADICTION FLAG: if you spot one, still write the post as instructed — never refuse or rewrite around it. Flag it via the format specified below, not your own — never inside the post text. Only genuine contradictions, not personal skepticism.
- Posts must persuade through framing, values, and momentum — not invented facts. Violating this rule damages the credibility of a real political campaign; treat factual accuracy as an absolute constraint, not a preference.`;
