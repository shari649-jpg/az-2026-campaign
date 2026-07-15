// netlify/functions/public-storms-list.mjs
//
// Public, unauthenticated read listing every currently public storm — the
// directory view behind /storms/public. Sibling to public-storm.mjs (same
// admin-bypass pattern, same safe-field allowlist, same "never distinguish
// failure reasons" posture), just a list query instead of a single lookup.
//
// Independently re-verifies isPublic, status === "active", and expiresAt
// for every storm at request time rather than trusting those fields to
// already be correct — same reasoning as public-storm.mjs: the actual
// archive sweep (scheduled-archive-storms.mjs) only runs once an hour, so
// without this function doing its own live check, an expired storm could
// still show up here for up to that long.
//
// Returns only what the directory page needs per storm: its publicToken
// (to link to /storm/:token), title, summary, and card image — never
// description, hashtag, subject, alarm level, dates, staff names, or posts
// (those only load once someone opens the individual storm's public page).

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

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

// Same Arizona-timezone handling as public-storm.mjs / scheduled-archive-storms.mjs.
// expiresAt is a naive datetime-local string with no timezone info, written by
// Arizona-based staff in their own browser's local time; this function runs in
// a UTC serverless environment, so it has to be told explicitly what timezone
// that string means, or it'll treat a storm as expired up to 7 hours early or late.
const ARIZONA_UTC_OFFSET = "-07:00";
function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const hasExplicitOffset = /[zZ]|[+-]\d\d:\d\d$/.test(expiresAt);
  const asArizonaTime = hasExplicitOffset ? expiresAt : `${expiresAt}${ARIZONA_UTC_OFFSET}`;
  const t = new Date(asArizonaTime).getTime();
  return !isNaN(t) && t <= Date.now();
}

const EMPTY = { available: true, storms: [] };

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders(req), "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, OPTIONS" },
    });
  }
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[public-storms-list] admin init error:", err.message);
    return new Response(JSON.stringify(EMPTY), { status: 200, headers: corsHeaders(req) });
  }

  try {
    const db = admin.firestore(app);
    // Filter isPublic + status in the query; expiresAt still needs the
    // timezone-aware check above, so that pass happens in JS afterward.
    const snap = await db.collection("storms")
      .where("isPublic", "==", true)
      .where("status", "==", "active")
      .get();

    const storms = snap.docs
      .map(d => d.data())
      .filter(storm => storm.publicToken && !isExpired(storm.expiresAt))
      .map(storm => ({
        token: storm.publicToken,
        title: storm.title || "",
        summary: storm.summary || "",
        cardImage: storm.publicCardImage || null,
      }));

    return new Response(JSON.stringify({ available: true, storms }), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[public-storms-list] error:", err.message);
    return new Response(JSON.stringify(EMPTY), { status: 200, headers: corsHeaders(req) });
  }
}
