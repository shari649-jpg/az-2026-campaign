// netlify/functions/coaching-response.mjs
// Conversation Coach — situational dialogue practice & social media response help
//
// Auth: requires a valid Firebase ID token from a signed-in coalition member.

import admin from "firebase-admin";

const CORS_ORIGIN = "https://az-coalition-2026-election.netlify.app";
const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
};

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON env var not set");
  const credential = admin.credential.cert(JSON.parse(json));
  return admin.initializeApp({ credential });
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
    fair: `You are playing a stranger at a community event or fair in Arizona. You're politically disengaged or independent — frustrated with "both sides." You've heard too many political pitches and tune them out. You might engage if someone seems genuinely curious about your life rather than trying to recruit you.`,
  };

  const toneInstructions = {
    "build-trust": `After each of your responses as the character, add a brief coaching note in [brackets] that: (1) names the conversational technique the user just used or missed, (2) suggests a calibrated question or common-ground move they could try next. Keep coaching notes concise (1–2 sentences). Example: [Good — you reflected their value back. Try asking: "What does that look like for your family specifically?"]`,
    scorched: `After each of your responses as the character, add a coaching note in [brackets] that: (1) notes how the character reacted emotionally to the user's challenge, (2) suggests how to press the point without losing the relationship. Example: [They got defensive — that's normal. You can hold firm but soften the delivery: "I hear you, and I still think the data tells a different story."]`,
    lurkers: `The user is practicing responding to comments where the real audience is people watching the exchange, not the person they're talking to. After each response, add a coaching note in [brackets] about: (1) how that reply would land with a neutral observer, (2) one adjustment that would make the user look more credible and reasonable to lurkers.`,
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
    bot: `The comment was likely posted by a bot or coordinated agitator account — low follower count, recently created, repetitive talking points, no genuine engagement history. Treat it as adversarial and strategic, not as genuine discourse.`,
    realpeople: `The comment was posted by a real person who is hostile or misinformed. They may have real grievances mixed with bad-faith framing. There may be genuine lurkers watching this exchange who are persuadable.`,
  };

  const toneInstructions = {
    adult: `Draft a response that positions the user as the calm, factual adult in the room. The PRIMARY audience is the lurkers — people who will read this thread later. The goal is not to convince the commenter, but to look credible and reasonable to neutral observers. Use factual framing, no name-calling, no all-caps. Then explain in 1–2 sentences why this approach works for the lurker audience.`,
    pushback: `Draft a firm, confident pushback that corrects the record without being cruel. Don't let the premise stand unchallenged. The tone should be: we're not afraid of this fight, and we have the facts. Brief, pointed, and confident. Then explain in 1 sentence what this accomplishes strategically.`,
    ignore: `Assess whether engaging is worth it. If not, explain why silence or a minimal response is the right call here (e.g. feeding the algorithm, amplifying bad content, etc.). If there IS a brief thing worth saying — like correcting a factual error for lurkers without addressing the commenter directly — draft that. Keep it ruthlessly short.`,
  };

  return `You are The Coach, a social media response advisor for Arizona Coalition volunteers.

The user has received this comment on their social media post:
---
${pastedContent || "[No comment pasted]"}
---

${personaContext[persona] || personaContext.realpeople}

Response mode: ${tone}
${toneInstructions[tone] || toneInstructions.adult}

Format your output as:
SUGGESTED RESPONSE:
[the actual draft text they can copy/paste]

STRATEGY NOTE:
[1–2 sentences on why this approach works]

Keep the suggested response tight — social media length. Do not invent facts. Do not attribute specific quotes or statistics unless the user's original post contained them.

${FACTUAL_ACCURACY_RULE}`;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[coaching-response] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server is not configured for auth yet." }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    try {
      await requireSignedIn(app, idToken);
    } catch (err) {
      const status = err.message === "unauthenticated" ? 401 : 403;
      return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), {
        status,
        headers: CORS_HEADERS,
      });
    }

    const {
      situation,    // "engage" | "troll"
      persona,      // "coworker" | "neighbor" | "fair" | "bot" | "realpeople"
      tone,         // "build-trust" | "scorched" | "lurkers" | "adult" | "pushback" | "ignore"
      pastedContent, // for troll mode: the comment they received
      history,      // array of { role, content } — full conversation so far
      userMessage,  // the new message from the user
    } = body;

    const system =
      situation === "troll"
        ? buildTrollSystemPrompt(persona, tone, pastedContent)
        : buildEngageSystemPrompt(persona, tone);

    // For troll mode on first call, no history needed — just generate the response draft
    const messages =
      situation === "troll" && (!history || history.length === 0)
        ? [{ role: "user", content: "Generate my response draft now." }]
        : [...(history || []), { role: "user", content: userMessage }];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 600,
        system,
        messages,
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
