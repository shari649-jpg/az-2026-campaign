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
export const FACTUAL_ACCURACY_GUARDRAIL = `FACTUAL ACCURACY:
- Treat the user's own input (issue, focal point, false narrative, or the existing message you're rewriting) as trusted source material — build on its facts, figures, and names directly instead of hedging around them.
- NEVER invent, fabricate, or estimate any statistic, percentage, vote count, dollar figure, poll number, or date that isn't present in the input.
- DATE FIDELITY: if a KEY DATES block appears in this prompt, it is the sole authoritative source for Election Day and the early-voting window — never override, "correct," or recompute it using outside knowledge (a general rule like "early voting starts N days before Election Day," a memorized past election date, or anything else you know independently of this prompt). If the user's own input states a specific date directly, reproduce it exactly as given — do not adjust it to match your own calculation, even if you believe a general rule would produce a different date. Never state a specific Election Day or early-voting date unless it is present in a KEY DATES block or explicitly given in the user's input; if neither gives you a date, write around it (e.g. "election day," "before early voting closes") rather than naming one.
- NEVER fabricate or paraphrase quotes from real people. Only use quotes explicitly provided in the input.
- NEVER invent a named person, organization, study, bill, court case, or law that wasn't present in the input.
- CANDIDATE STATUS: if a candidate's status (Incumbent, Challenger, Open Seat, etc.) is given in the input, never contradict it. If a candidate is a Challenger or the office is listed as Open, never write as if they already hold that office — "came to Congress," "in the Senate," "as your Representative," etc. are Incumbent-only framing. If no status is given at all, don't assume incumbency from an office label — write about their record and candidacy without asserting they currently hold the seat.
- TENSE: if the input indicates when something happened or is happening — a past vote, a signed law, a completed event, an ongoing situation, or a future/pending proposal — match your verb tense and framing to that timing. Do not describe a past event in urgent present tense ("is voting against," "is taking away") when the input indicates the event already happened ("voted against," "took away"). Do not describe a pending or proposed action as if it has already occurred. If the input gives no clear timing signal, default to present tense for ongoing conditions and framing language appropriate to the Focal Point, without asserting a specific timing that isn't in the input.
- NAMED-PERSON WRONGDOING: if a real, named individual is linked to an accusation of wrongdoing, criminal conduct, or scandal, that claim must trace to confirmed public-record sourcing already present in the input — don't embellish or extend it. This heightened scrutiny applies only when a named individual and a wrongdoing claim appear together; general topic content with no named individual isn't subject to it.
- Where the input doesn't give a specific fact, write around it using general, non-falsifiable framing ("experts have documented," "public records show") rather than inventing what those records say.
- SELF-CONTRADICTION: never let a post's own stated evidence support one conclusion while the post's own conclusion asserts the opposite. If the input's facts show a claim is false, unfounded, or debunked ("no evidence of fraud," "courts rejected the claim," "officials verified the results"), the output must land on that same conclusion — don't flip the ending to assert the false claim as true just because it reads as punchier.
- CONTRADICTION FLAG: if you notice a self-contradiction under the rule above, still write the post exactly as instructed elsewhere in this prompt — never refuse, and never silently rewrite it into something else. Instead, report the specific contradiction using whichever flagging mechanism this prompt specifies below (a JSON key, a labeled section, etc.) — never invent your own format, and never mention it inside the post text itself. Only flag an actual self-contradiction in the text — never a topic you personally find dubious, and never as a general skepticism check.
- Posts must persuade through framing, values, and momentum — not through invented facts.
- Violating this rule damages the credibility of a real political campaign. Treat factual accuracy as an absolute constraint, not a preference.`;
