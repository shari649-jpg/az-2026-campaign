// netlify/functions/coaching-response.mjs
// Conversation Coach — situational dialogue practice & social media response help
//
// Auth:       requires a valid Firebase ID token (any signed-in user)
// Rate limit: 50/day (user), 100/day (manager), 200/day (administrator)

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";

// Transition period: both the new custom domain and the legacy Netlify
// subdomain are accepted. Browsers only honor a single exact-match origin
// in this header (no comma lists, no wildcarding with credentials), so we
// reflect back whichever allowed origin actually made the request.
// TODO: drop ALLOWED_ORIGINS[1] (legacy netlify.app) once the old domain
// is fully retired and nothing still links to it.
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

// ── System prompt builders ──────────────────────────────────────────────────

const FACTUAL_ACCURACY_RULE = `
FACTUAL ACCURACY: Never invent statistics, quotes, names, studies, bills, or specific factual
claims not present in the user's input. Write around missing facts with non-falsifiable framing.
This is an absolute constraint — violating it damages a real political campaign.`.trim();

const CONVERSATIONAL_PRINCIPLES = `
Core principles for constructive engagement:
- Finding common ground comes before winning arguments
- Calibrated questions (how, what) open people up; yes/no questions close them down
- Strategic silence is a tool — let the other person fill space
- "Getting to No" (no-oriented questions) removes the pressure of commitment and builds trust
- Acknowledge emotions before addressing facts
- Share values and stories, not just positions
- De-escalate your own response first — speak 10% slower and softer
- The goal is planting seeds, not changing minds in one conversation`.trim();

function buildEngageSystemPrompt(persona, tone) {
  const personaProfiles = {
    coworker: `You are playing a Republican co-worker. You're skeptical of Democratic policies but you're a reasonable person — you have a relationship with the user. You care about the economy, business, and keeping government out of people's lives. You're not hostile, but you push back when you disagree. You won't be easily swayed but you respond to respect and genuine curiosity. Stay in character consistently.`,
    neighbor: `You are playing a rural Arizona neighbor. You're politically conservative, value self-reliance, community, and land/water rights. You're distrustful of political "outsiders" and big-government solutions. You care deeply about your community and family. You're not mean — just guarded. You respond well when someone meets you where you are without condescension.`,
    fair:     `You are playing a stranger at a community event or fair in Arizona. You're politically disengaged or independent — frustrated with "both sides." You've heard too many political pitches and tune them out. You might engage if someone seems genuinely curious about your life rather than trying to recruit you.`,
  };
  const toneInstructions = {
    "build-trust": `After each of your responses as the character, add a brief coaching note in [brackets] that: (1) names the conversational technique the user just used or missed, (2) suggests a calibrated question or common-ground move they could try next. Keep coaching notes concise (1–2 sentences). Example: [Good — you reflected their value back. Try asking: "What does that look like for your family specifically?"]`,
    scorched:      `After each of your responses as the character, add a coaching note in [brackets] that: (1) notes how the character reacted emotionally to the user's challenge, (2) suggests how to press the point without losing the relationship. Example: [They got defensive — that's normal. You can hold firm but soften the delivery: "I hear you, and I still think the data tells a different story."]`,
    lurkers:       `The user is practicing responding to comments where the real audience is people watching the exchange, not the person they're talking to. After each response, add a coaching note in [brackets] about: (1) how that reply would land with a neutral observer, (2) one adjustment that would make the user look more credible and reasonable to lurkers.`,
  };
  return `You are The Coach, a conversation practice tool for Arizona Coalition volunteers.

${personaProfiles[persona] || personaProfiles.fair}

${CONVERSATIONAL_PRINCIPLES}

Tone mode: ${tone}
${toneInstructions[tone] || toneInstructions["build-trust"]}

Keep your character responses natural and conversational — 1–4 sentences max. You are helping the user build real skills for engaging across political differences in rural Arizona.

${FACTUAL_ACCURACY_RULE}`;
}

function buildTrollSystemPrompt(persona, tone, pastedContent) {
  const personaContext = {
    bot:        `The comment was likely posted by a bot or coordinated agitator account — low follower count, recently created, repetitive talking points, no genuine engagement history. Don't try to persuade the account itself; it isn't a good-faith interlocutor. But do NOT assume the claim can be ignored just because it came from a bot — lurkers reading the thread often can't tell it's a bot, and an unanswered accusation reads as conceded whether or not the source was real. If the comment contains a checkable factual claim, treat correcting it for the room as just as important as it would be from a real person; only the delivery changes (don't address the bot directly as if debating it).`,
    realpeople: `The comment was posted by a real person who is hostile or misinformed. They may have real grievances mixed with bad-faith framing. There may be genuine lurkers watching this exchange who are persuadable, even if the commenter themselves isn't.`,
  };
  const toneInstructions = {
    correct: `Draft a brief, factual correction aimed at the lurking audience, not at convincing the commenter — they likely won't be persuaded, but unanswered claims read as true to anyone scrolling past. If the persona context above indicates this is a bot/agitator account, write the correction so it stands on its own (state the fact, don't debate the account) rather than addressing the bot as a good-faith party. No name-calling, no all-caps. Then explain in 1–2 sentences why this correction matters for the lurker audience specifically.`,
    pushback: `Draft a firm, confident pushback that corrects the record without conceding the premise. Don't let the claim stand unchallenged. The tone should be: we're not afraid of this fight, and we have the facts — brief, pointed, and confident, not cruel. Then explain in 1 sentence what this accomplishes strategically.`,
    ignore: `First assess whether there's a real, checkable claim in this comment that lurkers would otherwise take as true if left unanswered — if so, say that engaging IS warranted despite this option being selected, and explain why silence would actually read as concession here. Only recommend genuine silence (or a minimal, non-engaging response) if the comment is pure insult, noise, or bait with no factual claim worth correcting for the room. Be explicit about which case applies before drafting anything.`,
  };
  return `You are The Coach, a social media response advisor for Arizona Coalition volunteers.

The user has received this comment on their social media post:
---
${pastedContent || "[No comment pasted]"}
---

${personaContext[persona] || personaContext.realpeople}

Response mode: ${tone}
${toneInstructions[tone] || toneInstructions.correct}

Format your output as:
SUGGESTED RESPONSE:
[the actual draft text they can copy/paste]

STRATEGY NOTE:
[1–2 sentences on why this approach works]

Keep the suggested response tight — social media length. Do not invent facts. Do not attribute specific quotes or statistics unless the user's original post contained them.

${FACTUAL_ACCURACY_RULE}`;
}

function buildSuggestSystemPrompt(persona, pastedContent) {
  const personaNote = persona === "bot"
    ? `The user has flagged this as likely from a bot or agitator account. Do not let that alone push you toward recommending silence — lurkers usually can't tell it's a bot, and an unanswered factual claim reads as conceded regardless of the source. Source type should affect HOW a reply is written (don't address the account as a good-faith party), not WHETHER the underlying claim needs answering.`
    : `The user has flagged this as a real hostile or misinformed person. There may be persuadable lurkers watching even if the commenter isn't persuadable themselves.`;

  return `You are The Coach, advising an Arizona Coalition volunteer on how to handle a hostile or misleading comment on their social media post.

The comment:
---
${pastedContent || "[No comment provided]"}
---

${personaNote}

Decide which ONE of these three response strategies fits best, based on the comment's actual content:
- "correct": There is a checkable factual claim or accusation that lurkers would likely take as true if it goes unanswered. A correction aimed at the room (not at convincing the commenter) is warranted.
- "pushback": The comment makes a charged claim or attack that calls for a firm, confident rebuttal that holds the line without conceding the premise — more direct than a quiet correction.
- "ignore": The comment is pure insult, noise, or bait with no real factual claim worth correcting — replying would only amplify it, and silence does not read as concession here.

Default to "correct" or "pushback" whenever there is a factual claim sitting unanswered — "ignore" is only right when there is genuinely nothing worth correcting for the room's sake.

Respond with ONLY a JSON object, no other text, no markdown fences:
{"suggestion": "correct" | "pushback" | "ignore", "reason": "one sentence, plain language, explaining the call"}`;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[coaching-response] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    // ── Auth ────────────────────────────────────────────────────────────────
    let uid;
    try {
      uid = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), { status: 401, headers: corsHeaders(req) });
    }

    // ── Rate limit ──────────────────────────────────────────────────────────
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    // ── Claude call ─────────────────────────────────────────────────────────
    const { situation, persona, tone, pastedContent, history, userMessage, mode } = body;

    // Suggest mode: classify the comment and recommend a tone, instead of
    // drafting a full response. Used by the "Suggest a strategy" button in
    // step 2/3 of troll mode, before the user picks a tone themselves.
    if (mode === "suggest") {
      const system = buildSuggestSystemPrompt(persona, pastedContent);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 200, system, messages: [{ role: "user", content: "Classify this comment now." }] }),
      });
      const data = await response.json();
      if (usage.warning) {
        data.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };
      }
      return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders(req) });
    }

    const system = situation === "troll"
      ? buildTrollSystemPrompt(persona, tone, pastedContent)
      : buildEngageSystemPrompt(persona, tone);

    const messages = situation === "troll" && (!history || history.length === 0)
      ? [{ role: "user", content: "Generate my response draft now." }]
      : [...(history || []), { role: "user", content: userMessage }];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 600, system, messages }),
    });

    const data = await response.json();

    if (usage.warning) {
      data.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };
    }

    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders(req) });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
