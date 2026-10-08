// netlify/functions/scheduled-social-cleanup.mjs
//
// Runs daily. Deletes temporary files people uploaded from their device to
// post to social media (Firebase Storage socialUploads/{uid}/…), once their
// deleteAfter time has passed. social-publish.mjs writes one socialUploads/{id}
// record per device upload (bucket, path, deleteAfter); photos are copied to
// Upload-Post right away, videos are fetched by URL — possibly when a
// scheduled post goes out — so deleteAfter is set a day or two PAST the
// scheduled time.
//
// Anything left behind by an abandoned upload (the user picked a file but
// never posted) has no record here; storage.rules caps those per file, and
// they can be cleared from the Firebase Storage console under socialUploads/.
// (A bucket lifecycle rule on that prefix would automate it — not set up.)

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const serviceAccount = JSON.parse(readFileSync(new URL("./firebase-service-account.json", import.meta.url), "utf8"));
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export default async function () {
  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[scheduled-social-cleanup] admin init error:", err.message);
    return new Response("", { status: 200 });
  }
  const db = admin.firestore(app);
  try {
    const due = await db.collection("socialUploads")
      .where("deleteAfter", "<=", admin.firestore.Timestamp.now())
      .limit(200)
      .get();
    let deleted = 0;
    for (const doc of due.docs) {
      const { bucket, path } = doc.data();
      try {
        await admin.storage(app).bucket(bucket).file(path).delete({ ignoreNotFound: true });
        await doc.ref.delete();
        deleted++;
      } catch (err) {
        // Leave the record so tomorrow's run retries it.
        console.error(`[scheduled-social-cleanup] couldn't delete ${bucket}/${path}:`, err.message);
      }
    }
    console.log(`[scheduled-social-cleanup] ${due.size} due, ${deleted} deleted.`);
  } catch (err) {
    console.error("[scheduled-social-cleanup] error:", err.message);
  }
  return new Response("", { status: 200 });
}

// Daily at 10:00 UTC (3:00 AM Arizona).
export const config = {
  schedule: "0 10 * * *",
};
