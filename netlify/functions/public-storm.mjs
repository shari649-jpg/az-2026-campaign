// netlify/functions/public-storm.mjs
//
// Public, unauthenticated read for a single storm's public page. No login,
// no Firebase Auth token — this is deliberately the ONE place in the app
// that serves storm data to someone with no session at all, so it uses
// the Admin SDK to bypass Firestore rules (which require isSignedIn() on
// both storms/{stormId} and its posts subcollection — confirmed against
// the actual rules file, July 2026).
//
// Looks up a storm by its publicToken (an unguessable crypto.randomUUID(),
// not the document ID — see setStormPublic in stormLibrary.js) and
// independently re-verifies isPublic, status === "active", and expiresAt
// at request time, rather than trusting any of those to already be
// correct. That last check matters because the actual archive sweep
// (scheduled-archive-storms.mjs) only runs once an hour — without this
// function doing its own live check, a storm could still be reachable
// here for up to that long after it technically expired.
//
// On ANY failure — bad token, not public, not active, expired, storm
// deleted — this returns the exact same generic response. Distinguishing
// "wrong token" from "this storm used to be public" from "expired 10
// minutes ago" would let someone probe for information the response
// should never leak.
//
// Returns only what the public page actually needs: the storm's title and
// summary (never description, hashtag, subject, alarm level, dates, or
// staff names), its card image, and each post's title/mediaType/media/texts
// (never lockedFields or createdBy).

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

// Same Arizona-timezone handling as scheduled-archive-storms.mjs — see
// that file for the full explanation. expiresAt is a naive datetime-local
// string with no timezone info, written by Arizona-based staff in their
// own browser's local time; this function runs in a UTC serverless
// environment, so it has to be told explicitly what timezone that string
// means, or it'll treat a storm as expired up to 7 hours early or late.
const ARIZONA_UTC_OFFSET = "-07:00";
function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const hasExplicitOffset = /[zZ]|[+-]\d\d:\d\d$/.test(expiresAt);
  const asArizonaTime = hasExplicitOffset ? expiresAt : `${expiresAt}${ARIZONA_UTC_OFFSET}`;
  const t = new Date(asArizonaTime).getTime();
  return !isNaN(t) && t <= Date.now();
}

const NOT_AVAILABLE = { available: false };

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
    console.error("[public-storm] admin init error:", err.message);
    return new Response(JSON.stringify(NOT_AVAILABLE), { status: 200, headers: corsHeaders(req) });
  }

  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!token) {
      return new Response(JSON.stringify(NOT_AVAILABLE), { status: 200, headers: corsHeaders(req) });
    }

    const db = admin.firestore(app);
    const snap = await db.collection("storms").where("publicToken", "==", token).limit(1).get();

    if (snap.empty) {
      return new Response(JSON.stringify(NOT_AVAILABLE), { status: 200, headers: corsHeaders(req) });
    }

    const stormDoc = snap.docs[0];
    const storm = stormDoc.data();

    const isValid = storm.isPublic === true && storm.status === "active" && !isExpired(storm.expiresAt);
    if (!isValid) {
      return new Response(JSON.stringify(NOT_AVAILABLE), { status: 200, headers: corsHeaders(req) });
    }

    const postsSnap = await db.collection("storms").doc(stormDoc.id).collection("posts").orderBy("order", "asc").get();
    const posts = postsSnap.docs.map(d => {
      const p = d.data();
      return {
        id: d.id,
        title: p.title || "",
        mediaType: p.mediaType,
        media: p.media || [],
        texts: p.texts || {},
        // Generation params (Handoff #22) — only ever the same short
        // Mode/Audience/Voice/Tone labels already visible to any signed-in
        // member; never staff names, dates, or anything else new.
        genParams: p.genParams || null,
      };
    });

    return new Response(JSON.stringify({
      available: true,
      title: storm.title || "",
      summary: storm.summary || "",
      hashtag: storm.hashtag || "",
      cardImage: storm.publicCardImage || null,
      posts,
    }), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[public-storm] error:", err.message);
    return new Response(JSON.stringify(NOT_AVAILABLE), { status: 200, headers: corsHeaders(req) });
  }
}
