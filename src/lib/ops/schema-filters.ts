/**
 * The schema-filter check, as shared logic (Dispatch 88, made standing in 111).
 *
 * Two halves that must not drift apart:
 *
 *   - the *source* half — which read queries touch which table, and which
 *     lifecycle/tenancy tokens appear in that query chain. This can only be
 *     computed where the source lives: the audit script, at commit time. Its
 *     output is committed as `schema-filter-manifest.json` and a test fails
 *     the build if the manifest no longer matches a fresh scan.
 *
 *   - the *database* half — which tables actually carry those columns today,
 *     and whether the guard is live (rows exist that the filter would exclude)
 *     or still dormant. This changes without a deploy, which is exactly why
 *     the check had to stop being a script somebody remembers to run.
 *
 * Both halves meet in `evaluateManifest`, so the daily job and the local
 * script reach the same verdict from the same code.
 */

/** Columns that must be filtered, and what a query is allowed to use instead. */
export const REQUIRED: Record<string, { tokens: string[]; why: string }> = {
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
export const ADVISORY: Record<string, { tokens: string[]; why: string }> = {
  status: { tokens: ["status"], why: "lifecycle state is usually meant to be narrowed" },
  superseded_at: { tokens: ["superseded_at"], why: "restated rows usually must be excluded" },
};

/**
 * Is the guard live or dormant? Measured, never assumed: the predicate counts
 * the rows the filter would actually exclude today. Zero such rows makes a
 * finding advisory; the first such row promotes every unfiltered query to
 * required reading, automatically, the day it lands.
 */
export const DANGEROUS_PREDICATE: Record<string, string> = {
  is_active: "is_active is false",
  is_fixture: "is_fixture is true",
  is_synthetic: "is_synthetic is true",
  revoked_at: "revoked_at is not null",
};

/**
 * Advisory columns have no "dangerous" state — their correct filter is
 * query-specific — but the state query still needs a predicate per column to
 * enumerate the tables that carry them. These never promote a finding.
 */
export const ADVISORY_PREDICATE: Record<string, string> = {
  status: "status is null",
  superseded_at: "superseded_at is not null",
};

/** Every watched column, with the predicate the state query uses to enumerate it. */
export const STATE_PREDICATES: Record<string, string> = {
  ...DANGEROUS_PREDICATE,
  ...ADVISORY_PREDICATE,
};

export const WATCHED_COLUMNS = [...Object.keys(REQUIRED), ...Object.keys(ADVISORY)];

/** Every token any rule accepts — what the source scan records per query. */
export const ALL_TOKENS = Array.from(
  new Set([...Object.values(REQUIRED), ...Object.values(ADVISORY)].flatMap((r) => r.tokens)),
);

export interface QuerySite {
  file: string;
  line: number;
  table: string;
  /** Watched tokens that appear anywhere in this query chain. */
  filters: string[];
  snippet: string;
}

export interface SchemaFilterManifest {
  /** Bumped when the scan itself changes shape, so a stale manifest is obvious. */
  version: number;
  generatedAt: string;
  queries: QuerySite[];
}

export interface Exemption {
  table: string;
  file: string;
  reason: string;
}

export interface Finding {
  file: string;
  line: number;
  table: string;
  column: string;
  severity: "required" | "advisory";
  why: string;
  snippet: string;
}

export const MANIFEST_VERSION = 1;

/**
 * One query chain, as text, walked by bracket depth rather than by whitespace.
 *
 * Dispatch 127: the previous version stopped at the first blank line, which is
 * not a statement boundary in a builder chain — a stray blank line between
 * `.select(...)` and `.eq("is_active", true)` truncated the chain and hid a
 * filter that was really there. The chain ends where it actually ends: a `;` or
 * `,` at depth zero, or a line that does not continue the chain.
 */
function chainAfter(text: string, index: number): string {
  const slice = text.slice(index, index + 1600);
  let depth = 0;
  for (let i = 0; i < slice.length; i++) {
    const c = slice[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      // Ran past the expression that contains the chain.
      if (depth < 0) return slice.slice(0, i);
    } else if (depth === 0 && (c === ";" || c === ",")) {
      return slice.slice(0, i);
    } else if (depth === 0 && c === "\n") {
      // A chain only continues on a line whose first token is `.`.
      const rest = slice.slice(i + 1);
      const next = rest.replace(/^[\s]*(?:\/\/[^\n]*\n[\s]*)*/, "");
      if (!next.startsWith(".")) return slice.slice(0, i);
    }
  }
  return slice;
}


/**
 * Scan one source file for read queries against tables worth watching.
 * `watchedTables` is passed in rather than inferred so the scan stays pure.
 */
export function scanSource(rel: string, text: string, watchedTables: Set<string>): QuerySite[] {
  const sites: QuerySite[] = [];
  const re = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const table = m[1]!;
    if (!watchedTables.has(table)) continue;
    const chain = chainAfter(text, m.index);
    // Writes define the row rather than read it; the filter question is a read question.
    if (/\.(insert|upsert|delete|update)\(/.test(chain)) continue;
    sites.push({
      file: rel,
      line: text.slice(0, m.index).split("\n").length,
      table,
      filters: ALL_TOKENS.filter((t) => chain.includes(t)),
      snippet: chain.split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").slice(0, 110),
    });
  }
  return sites;
}

export interface EvaluationInput {
  manifest: SchemaFilterManifest;
  /** table -> watched columns it actually carries, read live from the database. */
  tableColumns: Map<string, string[]>;
  /** `table.column` for guards that would exclude at least one row today. */
  liveGuards: Set<string>;
  exemptions: Exemption[];
}

export interface Evaluation {
  required: Finding[];
  advisory: Finding[];
  queriesChecked: number;
  tablesWatched: number;
  /** Query sites recorded against a table that no longer carries a watched column. */
  staleSites: number;
}

export function evaluateManifest({
  manifest,
  tableColumns,
  liveGuards,
  exemptions,
}: EvaluationInput): Evaluation {
  const findings: Finding[] = [];
  let queriesChecked = 0;
  let staleSites = 0;

  for (const site of manifest.queries) {
    const columns = tableColumns.get(site.table);
    if (!columns) {
      staleSites += 1;
      continue;
    }
    queriesChecked += 1;
    for (const column of columns) {
      const rule = REQUIRED[column] ?? ADVISORY[column];
      if (!rule) continue;
      if (rule.tokens.some((t) => site.filters.includes(t))) continue;
      if (exemptions.some((e) => e.table === site.table && e.file === site.file)) continue;
      const live = liveGuards.has(`${site.table}.${column}`);
      findings.push({
        file: site.file,
        line: site.line,
        table: site.table,
        column,
        severity: REQUIRED[column] && live ? "required" : "advisory",
        why: live ? rule.why : `${rule.why} (guard dormant today — no such rows exist yet)`,
        snippet: site.snippet,
      });
    }
  }

  return {
    required: findings.filter((f) => f.severity === "required"),
    advisory: findings.filter((f) => f.severity === "advisory"),
    queriesChecked,
    tablesWatched: tableColumns.size,
    staleSites,
  };
}
