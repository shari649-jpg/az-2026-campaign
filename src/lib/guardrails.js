// lib/guardrails.js
//
// Shared factual-accuracy guardrail for every AI prompt-builder in the app
// (Message Machine, Rebuttal Generator, and Storm Chasers' generate-storm-text).
// Single source of truth so the rule can't drift out of sync between files,
// which is exactly what had happened before this was extracted (four
// near-identical copies across message-machine.jsx alone, plus a fifth in
// rebuttal-campaign-generator.jsx).
//
// Enforcement (Handoff #21, Group F): as of this handoff, this constant is
// imported in two places for two different reasons —
//   - Client-side (message-machine.jsx, rebuttal-campaign-generator.jsx,
//     StormPostEditor.jsx): built into the system prompt the UI constructs,
//     unchanged from before.
//   - Server-side (generate-message.mjs, generate-rebuttal.mjs,
//     generate-storm-text.mjs): each function now checks whether the
//     client-supplied system prompt already contains this rule, and appends
//     it if not, before calling Claude. This closes the gap where a modified
//     client or a direct call to these endpoints could previously skip the
//     rule entirely — the server no longer trusts the client to have
//     included it.
// If this text changes, both the client copies and the server behavior stay
// correct automatically since everything imports from here — but the
// server's "already contains it" check keys off the literal string
// "FACTUAL ACCURACY:" below, so keep that header line intact if editing.
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
export const FACTUAL_ACCURACY_GUARDRAIL = `FACTUAL ACCURACY:
- Treat the user's own input (issue, focal point, false narrative, or the existing message you're rewriting) as trusted source material — build on its facts, figures, and names directly instead of hedging around them.
- NEVER invent, fabricate, or estimate any statistic, percentage, vote count, dollar figure, poll number, or date that isn't present in the input.
- NEVER fabricate or paraphrase quotes from real people. Only use quotes explicitly provided in the input.
- NEVER invent a named person, organization, study, bill, court case, or law that wasn't present in the input.
- NAMED-PERSON WRONGDOING: if a real, named individual is linked to an accusation of wrongdoing, criminal conduct, or scandal, that claim must trace to confirmed public-record sourcing already present in the input — don't embellish or extend it. This heightened scrutiny applies only when a named individual and a wrongdoing claim appear together; general topic content with no named individual isn't subject to it.
- Where the input doesn't give a specific fact, write around it using general, non-falsifiable framing ("experts have documented," "public records show") rather than inventing what those records say.
- Posts must persuade through framing, values, and momentum — not through invented facts.
- Violating this rule damages the credibility of a real political campaign. Treat factual accuracy as an absolute constraint, not a preference.`;
