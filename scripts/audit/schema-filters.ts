#!/usr/bin/env bun
/**
 * Check 2 — schema-filter checker.
 *
 * Enumerates every public table carrying a lifecycle or tenancy column, then
 * finds every real query in the codebase touching that table and flags the ones
 * that never apply the matching filter. This is the mechanical version of the
 * bug class that has cost this project the most: a delisted host price, a
 * synthetic demo row, or a revoked API key leaking into a real answer because
 * one query out of nine forgot the filter.
 *
 *   bun scripts/audit/schema-filters.ts
 *   bun scripts/audit/schema-filters.ts --all      # include advisory columns
 *
 * Exit 1 when a required filter is missing without a recorded exemption.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Columns that must be filtered, and what a query is allowed to use instead. */
const REQUIRED: Record<string, { tokens: string[]; why: string }> = {
  is_active: {
    tokens: ["is_active"],
    why: "delisted rows must not appear in a live answer",
  },
  is_fixture: {
    tokens: ["is_fixture"],
    why: "fixture rows are not measured data",
  },
  is_synthetic: {
    tokens: ["is_synthetic", "org_id"],
    why: "synthetic demo rows must not mix into a real tenant's figures",
  },
  revoked_at: {
    tokens: ["revoked_at"],
    why: "revoked credentials must not authenticate",
  },
};

/** Columns worth reporting but not failing on — their correct filter is query-specific. */
const ADVISORY: Record<string, { tokens: string[]; why: string }> = {
  status: { tokens: ["status"], why: "lifecycle state is usually meant to be narrowed" },
  superseded_at: { tokens: ["superseded_at"], why: "restated rows usually must be excluded" },
};

interface Exemption {
  table: string;
  file: string;
  reason: string;
}

const exemptions: Exemption[] = JSON.parse(
  readFileSync(join(process.cwd(), "scripts/audit/schema-filter-exemptions.json"), "utf8"),
) as Exemption[];

function psql(sql: string): string[][] {
  const out = execFileSync("psql", ["-At", "-F", "\u0001", "-c", sql], { encoding: "utf8" });
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\u0001"));
}

const watched = [...Object.keys(REQUIRED), ...Object.keys(ADVISORY)];
const rows = psql(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
    and column_name in (${watched.map((c) => `'${c}'`).join(",")})
  order by table_name, column_name
`);

const tableColumns = new Map<string, string[]>();
for (const [table, column] of rows) {
  if (!table || !column) continue;
  tableColumns.set(table, [...(tableColumns.get(table) ?? []), column]);
}

/** Every source file that could hold a query. */
function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && entry !== "types.ts") acc.push(full);
  }
  return acc;
}

/**
 * One query chain, as text.
 *
 * Slicing from `.from("table")` to the next statement boundary is crude but it
 * is the whole chain in practice: these are all builder chains that end in an
 * await, a semicolon at depth zero, or a closing brace.
 */
function chainAfter(text: string, index: number): string {
  const slice = text.slice(index, index + 900);
  const stop = slice.search(/;\s|\n\s*\}\s*\n|\n\n/);
  return stop === -1 ? slice : slice.slice(0, stop);
}

const files = sources(join(process.cwd(), "src"));
interface Finding {
  file: string;
  line: number;
  table: string;
  column: string;
  severity: "required" | "advisory";
  why: string;
  snippet: string;
}

const findings: Finding[] = [];
let queriesChecked = 0;

for (const file of files) {
  const rel = relative(process.cwd(), file).split(sep).join("/");
  const text = readFileSync(file, "utf8");
  const re = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const table = m[1]!;
    const columns = tableColumns.get(table);
    if (!columns) continue;
    const chain = chainAfter(text, m.index);
    // Writes define the row rather than read it; the filter question is a read question.
    if (/\.(insert|upsert|delete|update)\(/.test(chain)) continue;
    queriesChecked += 1;
    const line = text.slice(0, m.index).split("\n").length;

    for (const column of columns) {
      const rule = REQUIRED[column] ?? ADVISORY[column];
      if (!rule) continue;
      if (rule.tokens.some((t) => chain.includes(t))) continue;
      if (exemptions.some((e) => e.table === table && e.file === rel)) continue;
      findings.push({
        file: rel,
        line,
        table,
        column,
        severity: REQUIRED[column] ? "required" : "advisory",
        why: rule.why,
        snippet: chain.split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").slice(0, 110),
      });
    }
  }
}

const showAdvisory = process.argv.includes("--all");
const required = findings.filter((f) => f.severity === "required");
const advisory = findings.filter((f) => f.severity === "advisory");

console.log("Schema-filter checker");
console.log("---------------------");
console.log(`tables with lifecycle/tenancy columns : ${tableColumns.size}`);
console.log(`read queries inspected                : ${queriesChecked}`);
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

print(required, "MISSING REQUIRED FILTER");
console.log("");
if (showAdvisory) print(advisory, "ADVISORY");
else console.log(`ADVISORY: ${advisory.length} (re-run with --all to list)`);

console.log("");
console.log(required.length ? "RESULT: gaps found." : "RESULT: clean.");
process.exit(required.length ? 1 : 0);
