/**
 * The on-disk half of the schema-filter check.
 *
 * Kept separate from the audit script so the staleness test can reproduce the
 * scan without also running psql at import time.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { scanSource, type QuerySite } from "../../src/lib/ops/schema-filters";

/** Every source file that could hold a query. Tests are excluded: they read back rows they just wrote. */
function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "__tests__") continue;
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && entry !== "types.ts" && !/\.test\.tsx?$/.test(entry))
      acc.push(full);
  }
  return acc;
}

export function scanRepository(watchedTables: Set<string>, root = process.cwd()): QuerySite[] {
  const queries: QuerySite[] = [];
  for (const file of sources(join(root, "src"))) {
    const rel = relative(root, file).split(sep).join("/");
    queries.push(...scanSource(rel, readFileSync(file, "utf8"), watchedTables));
  }
  return queries.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
