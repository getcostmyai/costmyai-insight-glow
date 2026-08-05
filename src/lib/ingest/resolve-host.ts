/**
 * Host-key resolution for ingested traffic (Dispatch 96).
 *
 * One layer above model keys, the same failure: our price rows hang off a
 * canonical host key (`openai`, `together`, `deepinfra`), while a customer's
 * gateway reports whatever hostname it actually dialled — `api.openai.com`,
 * `https://api.together.xyz/v1`, `openai.com`. Since Dispatch 95 that traffic
 * is at least visible, rolled up unpriced and honestly disclosed; but for the
 * common hostnames it does not need to be unpriced at all.
 *
 * Three rules, in order, each deterministic:
 *
 *   1. catalog — the host is already a canonical key we hold prices for.
 *   2. alias   — the curated hostname map in `contract.ts` (`PROVIDER_HOSTS`),
 *                the one place this product already states which hostnames
 *                belong to which provider. No second source of truth.
 *   3. label   — the hostname's own labels, minus scheme/port/path, minus the
 *                generic ones (`api`, `www`, `com`, `ai`, ...). If exactly one
 *                surviving label is a canonical host, that is the host. If two
 *                are (`openai.azure.com`), it is ambiguous and stays raw.
 *
 * Anything else keeps the string the customer sent and rolls up unpriced. A
 * wrong host attribution is worse than an unpriced one: it would move real
 * money onto the wrong provider's line in a bill nobody would think to check.
 */

import { PROVIDER_HOSTS } from "./contract";

export type HostResolutionVia = "catalog" | "alias" | "label" | "unresolved";

export interface HostResolution {
  /** The host key rollups and pricing should be keyed on. */
  key: string;
  /** The host exactly as the customer's gateway reported it. */
  raw: string;
  via: HostResolutionVia;
}

export type HostResolver = (rawHost: string, modelKey?: string) => HostResolution;

/** Labels that identify no provider on their own. */
const GENERIC_LABELS = new Set([
  "api",
  "www",
  "app",
  "gateway",
  "v1",
  "com",
  "net",
  "org",
  "io",
  "ai",
  "co",
  "xyz",
  "dev",
  "cloud",
  "inc",
  "us",
  "eu",
  "googleapis",
]);

/** Strip scheme, credentials, port and path down to the bare hostname. */
function bareHost(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/^[^@/]*@/, "");
  s = s.split("/")[0] ?? s;
  s = s.split("?")[0] ?? s;
  s = s.replace(/:\d+$/, "");
  return s.replace(/\.$/, "");
}

/**
 * Build a resolver over a snapshot of the canonical host keys we hold prices
 * for. Pure and synchronous, like the model resolver, so the rollup path and
 * its tests run identical code.
 */
export interface HostResolverOptions {
  /**
   * `${model_key}|${host}` for every pair we actually hold a price for.
   *
   * Some hostnames are themselves priced host keys for a handful of models
   * (`api.openai.com` carries a few direct-vendor rows). Matching one exactly
   * is right only when it prices the model in hand; otherwise the same traffic
   * would sit unpriced next to the canonical `openai` rows that do price it.
   * With this set the resolver picks the first candidate that can actually be
   * priced, and falls back to the plain order when none can.
   */
  pricedPairs?: Set<string>;
}

/**
 * Build a resolver over a snapshot of the canonical host keys we hold prices
 * for. Pure and synchronous, like the model resolver, so the rollup path and
 * its tests run identical code.
 */
export function buildHostResolver(
  canonicalHosts: Iterable<string>,
  options: HostResolverOptions = {},
): HostResolver {
  const canonical = new Map<string, string>();
  for (const host of canonicalHosts) {
    const key = host.trim().toLowerCase();
    if (key) canonical.set(key, host);
  }

  // Curated hostname -> provider map, filtered to providers we can actually
  // price. A mapping onto a host with no price rows resolves nothing.
  const aliasIndex = new Map<string, string>();
  for (const [provider, hostnames] of Object.entries(PROVIDER_HOSTS)) {
    const target = canonical.get(provider.toLowerCase());
    if (!target) continue;
    for (const hostname of hostnames) {
      const alias = bareHost(hostname);
      const existing = aliasIndex.get(alias);
      if (existing && existing !== target) {
        aliasIndex.set(alias, "\u0000ambiguous");
        continue;
      }
      aliasIndex.set(alias, target);
    }
  }

  const priced = options.pricedPairs;

  return (rawHost: string, modelKey?: string): HostResolution => {
    const raw = rawHost;
    const host = bareHost(rawHost);
    if (!host) return { key: raw, raw, via: "unresolved" };

    const candidates: HostResolution[] = [];

    const exact = canonical.get(host);
    if (exact) candidates.push({ key: exact, raw, via: "catalog" });

    const aliased = aliasIndex.get(host);
    if (aliased && aliased !== "\u0000ambiguous" && aliased !== exact) {
      candidates.push({ key: aliased, raw, via: "alias" });
    }

    // Label match, refusing every plural outcome. Skipped entirely when the
    // curated map called this hostname ambiguous.
    if (aliased !== "\u0000ambiguous") {
      const matches = new Set<string>();
      for (const label of host.split(".")) {
        if (!label || GENERIC_LABELS.has(label)) continue;
        const hit = canonical.get(label);
        if (hit) matches.add(hit);
      }
      if (matches.size === 1) {
        const only = [...matches][0]!;
        if (only !== exact && only !== aliased) candidates.push({ key: only, raw, via: "label" });
      }
    }

    if (candidates.length === 0) return { key: raw, raw, via: "unresolved" };
    if (priced && modelKey) {
      const payable = candidates.find((c) => priced.has(`${modelKey}|${c.key}`));
      if (payable) return payable;
    }
    return candidates[0]!;
  };
}

