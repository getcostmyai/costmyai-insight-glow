#!/usr/bin/env bun
/**
 * Standing check #4 — the integration suite must not leave fixtures in the
 * customer database.
 *
 * Two parts, both concrete:
 *   1. Static: every `*.integration.test.ts` calls `guardIntegrationDatabase`.
 *      A new integration file that forgets it is the exact way the leak came
 *      back last time.
 *   2. Live: sweep the production database for test residue older than five
 *      minutes and report what was found. Clean means clean, not "probably".
 *
 *   bun scripts/audit/test-isolation.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { sweepTestResidue, totalResidue } from "../../src/lib/__tests__/support/isolation";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".integration.test.ts")) out.push(full);
  }
  return out;
}

let failed = false;

const files = walk("src");
const unguarded = files.filter(
  (f) => !readFileSync(f, "utf8").includes("guardIntegrationDatabase("),
);

console.log(`integration files: ${files.length}`);
if (unguarded.length) {
  failed = true;
  console.log("MISSING guardIntegrationDatabase():");
  for (const f of unguarded) console.log(`  - ${f}`);
} else {
  console.log("all integration files call guardIntegrationDatabase() — ok");
}

const url = process.env["SUPABASE_URL"];
const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !service) {
  console.log("\nno service credentials in this environment — live sweep skipped");
} else {
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const swept = await sweepTestResidue(admin as never, 5 * 60_000);
  console.log(`\nresidue swept from the live database: ${JSON.stringify(swept)}`);
  if (totalResidue(swept) > 0) {
    failed = true;
    console.log("test fixtures were still present in production — the suite leaked again");
  } else {
    console.log("no test residue in production — clean");
  }
}

process.exit(failed ? 1 : 0);
