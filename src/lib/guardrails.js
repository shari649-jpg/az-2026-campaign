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
// Tightened Handoff #22 (this session). Testing surfaced a real gap: when
// the input itself was an unverified third-party allegation about a real,
// named public figure — not a fact the user had independently confirmed,
// just something they'd seen claimed elsewhere — the model both (a)
// invented sourcing language ("public documents show...") that wasn't in
// the input, and (b) dropped the allegation framing entirely, presenting
// the claim as settled fact. The Handoff #15 rescope's "trust the user's
// input" rule didn't distinguish between the user asserting a known fact
// and the user relaying someone else's unverified claim — so the model
// treated relaying as license to escalate. Fixed by: requiring
// allegation/claim framing to persist from input to output, explicitly
// banning invented corroboration phrases, and clarifying that neither the
// user's own assertion nor an unverified claim they're relaying counts as
// the "confirmed public-record sourcing" the NAMED-PERSON WRONGDOING clause
// requires.
export const FACTUAL_ACCURACY_GUARDRAIL = `FACTUAL ACCURACY:
- Treat the user's own input (issue, focal point, false narrative, or the existing message you're rewriting) as trusted source material for the facts, figures, and names the user is asserting directly — build on those directly instead of hedging around them.
- EXCEPTION — relaying is not asserting: if the input itself frames something as an allegation, a claim, someone's testimony, an accusation, a rumor, or "according to [person/source]," that framing is part of the fact pattern itself and must be preserved in the output. Do not upgrade someone else's unverified claim into a stated, settled fact just because the user typed it into the input field — not everyone relaying a claim has verified it themselves.
- NEVER invent, fabricate, or estimate any statistic, percentage, vote count, dollar figure, poll number, or date that isn't present in the input.
- NEVER fabricate or paraphrase quotes from real people. Only use quotes explicitly provided in the input.
- NEVER invent a named person, organization, study, bill, court case, or law that wasn't present in the input.
- NEVER invent sourcing or corroboration language that isn't in the input. Phrases like "public documents show," "records confirm," "investigators found," or "reports establish" assert a level of verification — only use language like that if the input itself specifies that kind of confirmed source; never add it yourself to make an unverified claim sound more established.
- NAMED-PERSON WRONGDOING: if a real, named individual is linked to an accusation of wrongdoing, criminal conduct, or scandal, that claim must trace to confirmed public-record sourcing already present in the input (e.g., the input itself cites a court filing, official report, or verified reporting establishing the fact). The user's own unverified assertion, or a third party's unverified allegation that the user is simply relaying, does NOT by itself count as that sourcing, regardless of how confidently the input states it. Where the input doesn't establish that level of confirmation, keep the claim framed as an allegation ("X alleges," "according to [source]") rather than stating it as fact — don't embellish, extend, or launder it into something more certain. This heightened scrutiny applies only when a named individual and a wrongdoing claim appear together; general topic content with no named individual isn't subject to it.
- Where the input doesn't give a specific fact, write around it using general, non-falsifiable framing ("experts have documented," "critics point to") rather than inventing what those records say.
- Posts must persuade through framing, values, and momentum — not through invented facts or invented certainty.
- Violating this rule damages the credibility of a real political campaign. Treat factual accuracy as an absolute constraint, not a preference.`;
