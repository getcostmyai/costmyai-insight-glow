/**
 * Model-key resolution for ingested traffic.
 *
 * A customer's middleware reports whatever their provider SDK calls the model:
 * `gpt-4o-mini`, `openai/gpt-4o-mini`, `gpt-4o-mini-2024-07-18`. Our catalog
 * has exactly one canonical key per model, and pricing hangs off that key. If
 * the two never meet, the events land in the database and the dashboard stays
 * empty — accepted, stored, invisible. That is the failure this module exists
 * to prevent.
 *
 * Three rules, in order, each one deterministic:
 *
 *   1. catalog — the key is already canonical, nothing to do.
 *   2. alias   — `model_aliases` maps it (case-insensitively) to a canonical key.
 *   3. suffix  — the key is a canonical key with the vendor prefix stripped, and
 *                exactly one vendor claims that suffix. Ambiguity is never
 *                guessed: if two vendors ship a `command-r`, the raw key stays
 *                raw rather than being silently attributed to one of them.
 *
 * Anything left over stays under its own name and is rolled up unpriced. Being
 * visible and honestly marked "no pricing data" beats being correct and absent.
 */

export type ModelResolutionVia = "catalog" | "alias" | "suffix" | "unresolved";

export interface ModelResolution {
  /** The key rollups should be written under. */
  key: string;
  /** The key exactly as the customer's gateway reported it. */
  raw: string;
  via: ModelResolutionVia;
}

export interface AliasRow {
  alias: string;
  model_key: string;
}

const normalize = (s: string) => s.trim().toLowerCase();

/** Provider suffixes that name a variant of the same model, not a new model. */
const stripDecorations = (s: string) => s.replace(/:(free|beta|extended|thinking|online)$/, "");

/**
 * Dispatch 121. Anthropic (and Bedrock, and Vertex) report a dated snapshot of
 * a model: `claude-haiku-4-5-20251001`, `claude-3-5-sonnet@20240620`. The date
 * names *when* the weights were cut, never a different price. Dropping it is
 * safe; keeping it costs the customer their pricing.
 */
const stripSnapshotDate = (s: string) => s.replace(/[-_@:]?v?\d{8}$/, "").replace(/[-_@:]$/, "");

/**
 * `claude-haiku-4-5` and `anthropic/claude-haiku-4.5` are the same model spelled
 * two ways: the SDK cannot put a dot in a path segment, our catalog can. Only a
 * digit-dash-digit pair is rewritten, so `gpt-4o-mini` and `claude-3-haiku`
 * (where the dash is a word boundary, not a decimal point) are untouched.
 */
const dottedVersion = (s: string) => s.replace(/(\d)-(\d)(?![\d-]*[a-z])/g, "$1.$2");

/** Every spelling of one reported key, most literal first. */
function variantsOf(rawKey: string): string[] {
  const seen = new Set<string>();
  const base = normalize(rawKey);
  for (const undecorated of [base, stripDecorations(base)]) {
    for (const undated of [undecorated, stripSnapshotDate(undecorated)]) {
      for (const candidate of [undated, dottedVersion(undated)]) {
        if (candidate) seen.add(candidate);
      }
    }
  }
  return [...seen];
}


/**
 * Build a resolver over a snapshot of the catalog and the alias table. Pure and
 * synchronous on purpose: the same function backs the rollup path and its tests,
 * so what the tests prove is what ingest runs.
 */
export function buildModelResolver(catalogKeys: Iterable<string>, aliases: AliasRow[]): ModelResolver {
  const canonical = new Map<string, string>();
  for (const key of catalogKeys) canonical.set(normalize(key), key);

  const aliasIndex = new Map<string, string>();
  for (const row of aliases) {
    const target = canonical.get(normalize(row.model_key));
    // An alias pointing at a model we no longer carry resolves nothing.
    if (!target) continue;
    aliasIndex.set(normalize(row.alias), target);
  }

  // Suffix index, built once. A suffix claimed by more than one vendor is
  // recorded as ambiguous and never resolved.
  const bySuffix = new Map<string, string | null>();
  for (const key of canonical.values()) {
    const slash = key.lastIndexOf("/");
    if (slash < 0) continue;
    const suffix = normalize(key.slice(slash + 1));
    bySuffix.set(suffix, bySuffix.has(suffix) ? null : key);
  }

  return (rawKey: string): ModelResolution => {
    const raw = rawKey;
    const candidates = [normalize(rawKey), stripDecorations(normalize(rawKey))];

    for (const c of candidates) {
      const exact = canonical.get(c);
      if (exact) return { key: exact, raw, via: "catalog" };
    }
    for (const c of candidates) {
      const aliased = aliasIndex.get(c);
      if (aliased) return { key: aliased, raw, via: "alias" };
    }
    for (const c of candidates) {
      if (c.includes("/")) continue; // already vendor-qualified and unknown
      const suffixed = bySuffix.get(c);
      if (suffixed) return { key: suffixed, raw, via: "suffix" };
    }
    return { key: raw, raw, via: "unresolved" };
  };
}
