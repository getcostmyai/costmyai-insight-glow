#!/usr/bin/env bun
/**
 * Check 2 — schema-filter checker (local run + manifest generator).
 *
 * The scan lives here because only here is the source on disk. The verdict
 * lives in `src/lib/ops/schema-filters.ts` so the daily in-app job reaches the
 * same answer from the same code.
 *
 *   bun scripts/audit/schema-filters.ts
 *   bun scripts/audit/schema-filters.ts --all      # include advisory columns
 *   bun scripts/audit/schema-filters.ts --emit     # rewrite the committed manifest
 *
 * Exit 1 when a required filter is missing without a recorded exemption.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  DANGEROUS_PREDICATE,
  MANIFEST_VERSION,
  WATCHED_COLUMNS,
  evaluateManifest,
  scanSource,
  type Exemption,
  type Finding,
  type SchemaFilterManifest,
} from "../../src/lib/ops/schema-filters";
import { scanRepository } from "./scan-repository";

const EXEMPTIONS_PATH = join(process.cwd(), "src/lib/ops/schema-filter-exemptions.json");
const MANIFEST_PATH = join(process.cwd(), "src/lib/ops/schema-filter-manifest.json");

const exemptions: Exemption[] = JSON.parse(readFileSync(EXEMPTIONS_PATH, "utf8")) as Exemption[];

function psql(sql: string): string[][] {
  const out = execFileSync("psql", ["-At", "-F", "\u0001", "-c", sql], { encoding: "utf8" });
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\u0001"));
}

const rows = psql(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
    and column_name in (${WATCHED_COLUMNS.map((c) => `'${c}'`).join(",")})
  order by table_name, column_name
`);

const tableColumns = new Map<string, string[]>();
for (const [table, column] of rows) {
  if (!table || !column) continue;
  tableColumns.set(table, [...(tableColumns.get(table) ?? []), column]);
}

const liveGuards = new Set<string>();
for (const [table, columns] of tableColumns) {
  for (const column of columns) {
    const predicate = DANGEROUS_PREDICATE[column];
    if (!predicate) continue;
    const [[count] = ["0"]] = psql(`select count(*) from public.${table} where ${predicate}`);
    if (Number(count ?? 0) > 0) liveGuards.add(`${table}.${column}`);
  }
}

const manifest: SchemaFilterManifest = {
  version: MANIFEST_VERSION,
  generatedAt: new Date().toISOString(),
  queries: scanRepository(new Set(tableColumns.keys())),
};

if (process.argv.includes("--emit")) {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${MANIFEST_PATH} (${manifest.queries.length} query sites).`);
}

const result = evaluateManifest({ manifest, tableColumns, liveGuards, exemptions });

console.log("Schema-filter checker");
console.log("---------------------");
console.log(`tables with lifecycle/tenancy columns : ${result.tablesWatched}`);
console.log(`read queries inspected                : ${result.queriesChecked}`);
console.log(`recorded exemptions                   : ${exemptions.length}`);
console.log("");

function print(list: Finding[], title: string) {
  console.log(`${title} (${list.length})`);
  if (!list.length) {
    console.log("  none");
    return;
  }
  for (const f of list) {
    console.log(`  ${f.file}:${f.line}  ${f.table}.${f.column} — ${f.why}`);
    console.log(`      ${f.snippet}`);
  }
}

print(result.required, "MISSING REQUIRED FILTER");
console.log("");
if (process.argv.includes("--all")) print(result.advisory, "ADVISORY");
else console.log(`ADVISORY: ${result.advisory.length} (re-run with --all to list)`);

console.log("");
console.log(result.required.length ? "RESULT: gaps found." : "RESULT: clean.");
process.exit(result.required.length ? 1 : 0);
