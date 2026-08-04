#!/usr/bin/env bun
/**
 * The standing audit — all three checks, one command.
 *
 * Run before every deploy. Each check is independent and reports on its own;
 * the runner only aggregates exit codes so a single red check fails the run.
 *
 *   bun scripts/audit/all.ts
 */
import { spawnSync } from "node:child_process";

const CHECKS = [
  { name: "stale deploy", file: "scripts/audit/stale-deploy.ts" },
  { name: "schema filters", file: "scripts/audit/schema-filters.ts" },
  { name: "cron health", file: "scripts/audit/cron-health.ts" },
  { name: "formulas", file: "scripts/audit/formulas.ts" },
];

const failed: string[] = [];
for (const check of CHECKS) {
  console.log(`\n=== ${check.name} ===\n`);
  const res = spawnSync("bun", [check.file], { stdio: "inherit" });
  if (res.status !== 0) failed.push(check.name);
}

console.log("\n=== summary ===");
console.log(failed.length ? `FAILED: ${failed.join(", ")}` : "All three checks passed.");
process.exit(failed.length ? 1 : 0);
