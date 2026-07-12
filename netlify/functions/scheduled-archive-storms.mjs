// netlify/functions/scheduled-archive-storms.mjs
//
// Runs automatically every hour. Finds any storm still marked "active"
// whose expiresAt has passed and flips it to "archived".
//
// Nothing in the app previously checked expiresAt at all — stormLibrary.js's
// loadActiveStorms() only ever filtered by status, so an Active storm with
// a past end date stayed visibly Active forever until someone manually
// archived it. This closes that gap, and is a hard prerequisite for the
// public storm link feature: "only available while Active" only means
// something if Active is actually kept accurate. A client-side defensive
// check also lives in stormLibrary.js's isStormExpired() / loadActiveStorms()
// for the gap between an expiration passing and this cron's next run.
//
// If there's no expiresAt set at all, a storm is left alone — it stays
// Active until someone manually archives it, same as today.
//
// Runs hourly rather than daily (unlike scheduled-community-notes.mjs's
// once-a-day schedule) because expiresAt includes a time of day, not just
// a date — daily would leave a storm visibly "Active" for up to 18 extra
// hours past its real expiration.
//
// Timezone note: expiresAt is stored exactly as the raw value from the
// <input type="datetime-local"> in StormsHubPage.jsx's storm form — a
// naive string with no timezone info (e.g. "2026-07-12T14:30"), written
// and read back by Arizona-based staff in their own browser's local time.
// This function runs in Netlify's serverless environment, which defaults
// to UTC — so treating that string as anything other than Arizona time
// here would archive storms up to 7 hours off from what whoever set the
// date actually meant. Arizona does not observe DST, so it's always a
// fixed UTC-7 offset, unlike the client-side check (which can safely just
// use the browser's own local time since that's however the browser
// already displays every other expiresAt value in this app).

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

const ARIZONA_UTC_OFFSET = "-07:00";

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(new URL("./firebase-service-account.json", import.meta.url), "utf8"));
  } catch {
    throw new Error(
      "firebase-service-account.json not found — run `npm run build` to regenerate via scripts/inject-secrets.mjs."
    );
  }
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// Interprets a naive datetime-local string (no "Z", no +/-offset) as
// Arizona time. If a value somehow already has an explicit offset or "Z"
// suffix, it's trusted as-is rather than double-appending one.
function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const hasExplicitOffset = /[zZ]|[+-]\d\d:\d\d$/.test(expiresAt);
  const asArizonaTime = hasExplicitOffset ? expiresAt : `${expiresAt}${ARIZONA_UTC_OFFSET}`;
  const t = new Date(asArizonaTime).getTime();
  return !isNaN(t) && t <= Date.now();
}

export default async function (req) {
  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[scheduled-archive-storms] admin init error:", err.message);
    return new Response("", { status: 200 });
  }

  const db = admin.firestore(app);

  try {
    const snap = await db.collection("storms").where("status", "==", "active").get();

    if (snap.empty) {
      console.log("[scheduled-archive-storms] No active storms to check.");
      return new Response("", { status: 200 });
    }

    let archivedCount = 0;
    for (const doc of snap.docs) {
      const storm = doc.data();
      if (!isExpired(storm.expiresAt)) continue;

      await doc.ref.update({
        status: "archived",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Distinguishes an automatic expiration from a manual archive via
        // the UI (setStormStatus in stormLibrary.js doesn't set either of
        // these fields today), purely for staff auditability later.
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedReason: "expired",
      });
      archivedCount++;
      console.log(`[scheduled-archive-storms] Archived "${storm.title || doc.id}" (expired ${storm.expiresAt}).`);
    }

    console.log(`[scheduled-archive-storms] Checked ${snap.size} active storm(s), archived ${archivedCount}.`);
  } catch (err) {
    console.error("[scheduled-archive-storms] error:", err.message);
  }

  return new Response("", { status: 200 });
}

// Schedule declared here instead of the legacy schedule() wrapper, same
// pattern as scheduled-community-notes.mjs. Cron: at minute 0 of every hour.
export const config = {
  schedule: "0 * * * *",
};
