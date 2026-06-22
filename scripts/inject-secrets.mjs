#!/usr/bin/env node
// scripts/inject-secrets.mjs
//
// WHY THIS EXISTS
// ────────────────────────────────────────────────────────────────────────
// Netlify Functions run on AWS Lambda under the hood, and AWS caps the total
// size of all environment variables injected into a single function at 4KB.
// Large credentials — full service-account JSON keys in particular — eat
// most or all of that budget by themselves, and Netlify's per-variable
// scoping only goes down to category level (Builds / Functions / Runtime),
// not to individual function names. So there's no way to say "only
// query-candidates gets GOOGLE_SERVICE_ACCOUNT_JSON" through the UI.
//
// This script sidesteps the problem at the root: instead of letting large
// credentials travel through Lambda's runtime env-var injection (the thing
// that's capped), it reads them once at BUILD TIME — which has no 4KB limit —
// and writes each one to a small local .json file inside only the specific
// function folder(s) that need it. Those functions then `import` the file
// directly instead of doing `JSON.parse(process.env.WHATEVER)`.
//
// HOW TO ADD A NEW LARGE CREDENTIAL IN THE FUTURE
// ────────────────────────────────────────────────────────────────────────
// 1. In Netlify: add the env var, and uncheck "Functions" + "Runtime" scope
//    so it's Builds-only. (This is what keeps it OUT of the 4KB runtime
//    budget — if you leave Functions/Runtime checked, it'll still count
//    against every function's limit even though this script also runs.)
// 2. Add one entry to CREDENTIALS below: the env var name, the output
//    filename, and which function folders should receive a copy.
// 3. In the function code, replace:
//        const creds = JSON.parse(process.env.YOUR_VAR_NAME);
//    with:
//        import creds from "./your-file-name.json" with { type: "json" };
//    (Node 22+ / modern ESM import-attributes syntax — matches Netlify's
//    current default Node runtime. If your build's Node version is older,
//    use: import { readFileSync } from "node:fs"; then
//    JSON.parse(readFileSync(new URL("./your-file-name.json", import.meta.url)))
// 4. Done. No netlify.toml changes needed — this script runs automatically
//    as part of `npm run build` (see the "prebuild" hook in package.json).
//
// This is a plain Node script with zero npm dependencies — nothing here can
// break from an upstream package update, and the logic is short enough to
// read end-to-end in two minutes if something ever needs debugging.

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Repo root is one level up from /scripts
const REPO_ROOT = join(__dirname, "..");

// Adjust this if your functions actually live somewhere other than
// netlify/functions/ at the repo root (check netlify.toml's [build] /
// [functions] section, or Project settings → Build & deploy → Functions
// directory, if this script ever errors with "directory not found").
const FUNCTIONS_DIR = join(REPO_ROOT, "netlify", "functions");

// ──────────────────────────────────────────────────────────────────────────
// CREDENTIAL CONFIG — add new large secrets here, not in netlify.toml
// ──────────────────────────────────────────────────────────────────────────
const CREDENTIALS = [
  {
    envVar: "FIREBASE_SERVICE_ACCOUNT_JSON",
    outputFile: "firebase-service-account.json",
    // Every function that calls admin.credential.cert(...) needs a copy.
    functions: [
      "manage-user",
      "generate-message",
      "generate-rebuttal",
      "rapid-response",
      "coaching-response",
    ],
  },
  {
    envVar: "GOOGLE_SERVICE_ACCOUNT_JSON",
    outputFile: "google-service-account.json",
    functions: [
      "query-candidates",
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────────

let wrote = 0;
let skipped = 0;

for (const cred of CREDENTIALS) {
  const raw = process.env[cred.envVar];

  if (!raw) {
    console.warn(`[inject-secrets] ⚠️  ${cred.envVar} is not set — skipping (functions expecting it will fail at runtime if they're called).`);
    skipped++;
    continue;
  }

  // Validate it's actually parseable JSON before writing it anywhere —
  // fail the build loudly now rather than have a function silently break
  // in production with a cryptic JSON.parse error.
  try {
    JSON.parse(raw);
  } catch (err) {
    console.error(`[inject-secrets] ❌ ${cred.envVar} is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  for (const fn of cred.functions) {
    const targetDir = join(FUNCTIONS_DIR, fn);

    if (!existsSync(targetDir)) {
      console.error(`[inject-secrets] ❌ Function directory not found: ${targetDir}`);
      console.error(`[inject-secrets]    Check FUNCTIONS_DIR at the top of scripts/inject-secrets.mjs`);
      process.exit(1);
    }

    const targetPath = join(targetDir, cred.outputFile);
    writeFileSync(targetPath, raw, "utf8");
    wrote++;
  }

  console.log(`[inject-secrets] ✓ ${cred.envVar} → ${cred.functions.length} function(s): ${cred.functions.join(", ")}`);
}

console.log(`[inject-secrets] Done. ${wrote} file(s) written, ${skipped} credential(s) skipped.`);
