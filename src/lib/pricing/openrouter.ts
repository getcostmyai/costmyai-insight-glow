/**
 * OpenRouter catalogue transform.
 *
 * Pure module — no network, no credentials, no database — so every normalisation
 * decision below is unit-testable independently of the feed.
 *
 * OpenRouter is the primary source because it is the only single endpoint that
 * publishes the model list AND its price together, across the whole market.
 * Two endpoints are used:
 *
 *   /api/v1/models                        -> the catalogue + one aggregated price
 *   /api/v1/models/:author/:slug/endpoints -> the per-provider prices that make
 *                                             host arbitrage a real comparison
 *
 * Governing rule: REJECT, DON'T GUESS. An entry with no usable price, or a
 * non-text modality, is skipped and counted in the report. A fabricated price
 * is worse than a missing model, because the engine would recommend a switch on
 * the strength of it.
 */

/** Precedence when several sources price the same (model, host). Lower wins. */
export const SOURCE_PRIORITY = {
  /** Reserved for the provider-native adapters (OpenAI, Anthropic, Google, ...). */
  provider: 10,
  /** OpenRouter's per-provider endpoint pricing. */
  openrouter: 50,
  /** The original hand-seeded demo rows. */
  seed: 90,
} as const;

export const OPENROUTER_SOURCE = "openrouter";

/** USD per token -> USD per million tokens. */
export function perMtok(perToken: string | number | null | undefined): number | null {
  if (perToken == null) return null;
  // Number("") is 0, which would import a free price for a model that simply
  // published nothing — an empty string is an absent price, not a zero one.
  if (typeof perToken === "string" && perToken.trim() === "") return null;
  const n = typeof perToken === "number" ? perToken : Number(perToken);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000 * 1e6) / 1e6;
}

export interface OrArchitecture {
  modality?: string | null;
  input_modalities?: string[] | null;
  output_modalities?: string[] | null;
}

export interface OrPricing {
  prompt?: string | null;
  completion?: string | null;
}

export interface OrModel {
  id: string;
  canonical_slug?: string | null;
  name?: string | null;
  description?: string | null;
  context_length?: number | null;
  architecture?: OrArchitecture | null;
  pricing?: OrPricing | null;
  supported_parameters?: string[] | null;
  top_provider?: { context_length?: number | null } | null;
}

export interface OrEndpoint {
  provider_name?: string | null;
  pricing?: OrPricing | null;
  context_length?: number | null;
  quantization?: string | null;
  status?: number | null;
}

export interface CatalogEntry {
  model_key: string;
  display_name: string;
  vendor: string;
  tier: "economy" | "standard" | "frontier";
  context_window: number | null;
  is_reasoning: boolean;
  modality: string;
  external_id: string;
  source: string;
  /** Aggregated reference price; the per-endpoint sweep supersedes it. */
  referenceInput: number;
  referenceOutput: number;
}

export interface PriceEntry {
  model_key: string;
  host: string;
  host_label: string;
  region: string;
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  price_source: string;
  source_priority: number;
  external_id: string;
}

export interface SkippedEntry {
  id: string;
  reason: string;
}

/**
 * Tier by blended price band, in USD per Mtok, taken as input + output.
 *
 * Price is the only market-wide signal available for every model on day one;
 * parameter counts and vendor marketing tiers are not published consistently.
 * The bands are deliberately wide and stated in the methodology, so a model
 * near a boundary is never treated as a precise claim.
 */
export const TIER_BANDS = { economy: 3, standard: 20 } as const;

export function tierFor(inputPerMtok: number, outputPerMtok: number): CatalogEntry["tier"] {
  const blended = inputPerMtok + outputPerMtok;
  if (blended <= TIER_BANDS.economy) return "economy";
  if (blended <= TIER_BANDS.standard) return "standard";
  return "frontier";
}

/** The namespace of an OpenRouter id is its vendor: `deepseek/deepseek-v4` -> `deepseek`. */
export function vendorOf(id: string): string {
  const slash = id.indexOf("/");
  return (slash > 0 ? id.slice(0, slash) : id).toLowerCase();
}

/** Text-in/text-out only. A vision or audio model is not comparable on our benchmarks. */
export function isTextModel(m: OrModel): boolean {
  const arch = m.architecture;
  if (!arch) return false;
  const outputs = arch.output_modalities ?? [];
  const inputs = arch.input_modalities ?? [];
  if (outputs.length > 0 && !outputs.includes("text")) return false;
  if (inputs.length > 0 && !inputs.includes("text")) return false;
  if (!arch.modality) return outputs.includes("text");
  return arch.modality.endsWith("->text");
}

export function isReasoning(m: OrModel): boolean {
  const params = m.supported_parameters ?? [];
  return params.includes("reasoning") || params.includes("include_reasoning");
}

/** Strips the vendor prefix OpenRouter puts in display names: "DeepSeek: V4" -> "V4". */
export function displayNameOf(m: OrModel): string {
  const raw = (m.name ?? m.id).trim();
  const colon = raw.indexOf(": ");
  return colon > 0 ? raw.slice(colon + 2) : raw;
}

/**
 * The whole catalogue, normalised. Nothing is intersected against what we
 * already hold — that intersect-and-discard pattern is exactly what pinned the
 * catalogue at 16 models. New models are returned so they can be inserted.
 */
export function transformCatalog(models: OrModel[]): {
  entries: CatalogEntry[];
  skipped: SkippedEntry[];
} {
  const entries: CatalogEntry[] = [];
  const skipped: SkippedEntry[] = [];
  const seen = new Set<string>();

  for (const m of models) {
    if (!m?.id) {
      skipped.push({ id: String(m?.id ?? "(missing id)"), reason: "no id" });
      continue;
    }
    if (seen.has(m.id)) {
      skipped.push({ id: m.id, reason: "duplicate id in feed" });
      continue;
    }
    if (!isTextModel(m)) {
      skipped.push({ id: m.id, reason: "not a text->text model" });
      continue;
    }

    const input = perMtok(m.pricing?.prompt);
    const output = perMtok(m.pricing?.completion);
    if (input == null || output == null) {
      skipped.push({ id: m.id, reason: "no published price" });
      continue;
    }
    if (input === 0 && output === 0) {
      // Free/promotional endpoints carry no cost signal, so no saving can be
      // computed from them and no recommendation could ever be honest.
      skipped.push({ id: m.id, reason: "zero price (free tier)" });
      continue;
    }

    seen.add(m.id);
    entries.push({
      model_key: m.id,
      display_name: displayNameOf(m),
      vendor: vendorOf(m.id),
      tier: tierFor(input, output),
      context_window: m.context_length ?? m.top_provider?.context_length ?? null,
      is_reasoning: isReasoning(m),
      modality: m.architecture?.modality ?? "text->text",
      external_id: m.canonical_slug ?? m.id,
      source: OPENROUTER_SOURCE,
      referenceInput: input,
      referenceOutput: output,
    });
  }

  return { entries, skipped };
}

/** `DeepInfra` -> `deepinfra`, `Together AI` -> `together-ai`. */
export function hostSlug(providerName: string): string {
  return providerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Per-provider prices for one model.
 *
 * Several endpoints of one provider can serve the same model at different
 * quantisations. They collapse to one row per (model, host): the cheapest, so
 * arbitrage never quotes a price the customer could not actually get.
 */
export function transformEndpoints(
  modelKey: string,
  endpoints: OrEndpoint[],
): { prices: PriceEntry[]; skipped: SkippedEntry[] } {
  const best = new Map<string, PriceEntry>();
  const skipped: SkippedEntry[] = [];

  for (const e of endpoints ?? []) {
    const label = (e.provider_name ?? "").trim();
    if (!label) {
      skipped.push({ id: modelKey, reason: "endpoint has no provider name" });
      continue;
    }
    const input = perMtok(e.pricing?.prompt);
    const output = perMtok(e.pricing?.completion);
    if (input == null || output == null || (input === 0 && output === 0)) {
      skipped.push({ id: `${modelKey}@${label}`, reason: "endpoint has no usable price" });
      continue;
    }

    const host = hostSlug(label);
    const row: PriceEntry = {
      model_key: modelKey,
      host,
      host_label: label,
      region: "global",
      input_usd_per_mtok: input,
      output_usd_per_mtok: output,
      price_source: OPENROUTER_SOURCE,
      source_priority: SOURCE_PRIORITY.openrouter,
      external_id: `${modelKey}|${host}`,
    };

    const existing = best.get(host);
    if (!existing || input + output < existing.input_usd_per_mtok + existing.output_usd_per_mtok) {
      best.set(host, row);
    }
  }

  return { prices: [...best.values()], skipped };
}

export type ChangeKind = "new" | "increase" | "decrease" | "delisted" | "relisted";

export interface PriceChange {
  model_key: string;
  host: string;
  region: string;
  price_source: string;
  change_kind: ChangeKind;
  input_usd_per_mtok: number | null;
  output_usd_per_mtok: number | null;
  prev_input_usd_per_mtok: number | null;
  prev_output_usd_per_mtok: number | null;
  pct_change: number | null;
}

export interface StoredPrice {
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  is_active: boolean;
}

/** Below this, a difference is float noise from the per-token conversion, not a price move. */
export const PRICE_EPSILON = 1e-6;

/**
 * THE price-move magnitude function (Dispatch 114).
 *
 * Blended, because a change that raises input and cuts output has no single
 * direction otherwise — and because a customer's bill is paid on both sides.
 * This is the number written to `price_history.pct_change`, and the only
 * definition any reader is allowed to use. The Intelligence page previously
 * carried a second, input-first derivation that reported +145.0% for a row
 * whose blended cost moved +12.05%; that is the duplicate-definition failure
 * mode this export exists to make impossible.
 */
export function blendedPctChange(
  next: { input_usd_per_mtok: number; output_usd_per_mtok: number },
  prev: { input_usd_per_mtok: number; output_usd_per_mtok: number },
): number | null {
  const prevBlended = prev.input_usd_per_mtok + prev.output_usd_per_mtok;
  const nextBlended = next.input_usd_per_mtok + next.output_usd_per_mtok;
  if (!(prevBlended > 0)) return null;
  return Math.round(((nextBlended - prevBlended) / prevBlended) * 10000) / 100;
}

/**
 * The only place a `price_history` row is decided.
 *
 * A re-verified UNCHANGED price returns null: it bumps `verified_at` and
 * nothing else. That is what makes "price changes this month" a countable
 * event rather than a restatement of how often the sync ran.
 */
export function diffPrice(next: PriceEntry, prev: StoredPrice | undefined): PriceChange | null {
  const base = {
    model_key: next.model_key,
    host: next.host,
    region: next.region,
    price_source: next.price_source,
    input_usd_per_mtok: next.input_usd_per_mtok,
    output_usd_per_mtok: next.output_usd_per_mtok,
  };

  if (!prev) {
    return {
      ...base,
      change_kind: "new",
      prev_input_usd_per_mtok: null,
      prev_output_usd_per_mtok: null,
      pct_change: null,
    };
  }

  const dIn = next.input_usd_per_mtok - prev.input_usd_per_mtok;
  const dOut = next.output_usd_per_mtok - prev.output_usd_per_mtok;
  const moved = Math.abs(dIn) > PRICE_EPSILON || Math.abs(dOut) > PRICE_EPSILON;

  if (!moved) return prev.is_active ? null : { ...base, change_kind: "relisted", prev_input_usd_per_mtok: prev.input_usd_per_mtok, prev_output_usd_per_mtok: prev.output_usd_per_mtok, pct_change: 0 };

  // Blended, because a change that raises input and cuts output has no single
  // direction otherwise. Direction is taken from the blended movement.
  const prevBlended = prev.input_usd_per_mtok + prev.output_usd_per_mtok;
  const nextBlended = next.input_usd_per_mtok + next.output_usd_per_mtok;
  const pct = prevBlended > 0 ? Math.round(((nextBlended - prevBlended) / prevBlended) * 10000) / 100 : null;

  return {
    ...base,
    change_kind: nextBlended >= prevBlended ? "increase" : "decrease",
    prev_input_usd_per_mtok: prev.input_usd_per_mtok,
    prev_output_usd_per_mtok: prev.output_usd_per_mtok,
    pct_change: pct,
  };
}

/** Consecutive misses before a price is marked delisted. Never hard-deleted. */
export const DELIST_GRACE_MISSES = 2;
