import { createPublicServerClient } from "@/lib/supabase-public.server";
import { fetchAllRows } from "@/lib/paginate.server";
import { AA_INTELLIGENCE_SUITE } from "@/lib/benchmarks/aa-catalog";
import { isRealEndpoint } from "@/lib/pricing/aggregate";
import { PRICING_FEED, pricingIsLive } from "@/lib/sync-freshness";



export interface CatalogRow {
  model_key: string;
  display_name: string;
  vendor: string;
  tier: string;
  is_reasoning: boolean;
  context_window: number | null;
  /** e.g. "text+image->text" — straight from the catalog, never inferred. */
  modality: string;
  /**
   * Every purchasable listing for this model, cheapest first. `aggregate: true`
   * marks the OpenRouter aggregate listing — still a real way to buy the model,
   * but not a company serving weights, so provider counts and provider-to-
   * provider spreads exclude it (Dispatch 117).
   */
  hosts: { host_label: string; input: number; output: number; aggregate: boolean }[];
  /** Cheapest REAL provider price. Aggregate listings never set this. */
  cheapestInput: number | null;
  cheapestOutput: number | null;

  scores: { task_class: string; suite: string; score: number }[];
  /** Named benchmark columns. null = no score on record for this model. */
  gpqa: number | null;
  ifbench: number | null;
  coding: number | null;
  /** AA's own published Intelligence Index, verbatim. null = not published. */
  intelligence: number | null;

  /** Feed-published medians, model-scope. null = unmeasured. */
  ttftMs: number | null;
  outputTps: number | null;
}

export interface CatalogPayload {
  rows: CatalogRow[];
  vendors: string[];
  providers: string[];
  live: boolean;
}

const SUITE_COLUMN: Record<string, "gpqa" | "ifbench" | "coding"> = {
  "aa:gpqa": "gpqa",
  "aa:ifbench": "ifbench",
  "aa:scicode": "coding",
};

/** The public model catalog, read through the anon client — catalog data only. */
export async function readCatalog(): Promise<CatalogPayload> {
  const supabase = createPublicServerClient();

  const [models, prices, benchmarks, snapshot] = await Promise.all([
    fetchAllRows((f, t) =>
      supabase
        .from("model_catalog")
        .select("model_key, display_name, vendor, tier, is_reasoning, context_window, modality")
        .eq("is_active", true)
        .range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabase
        .from("host_prices")
        .select(
          "model_key, host_label, price_source, input_usd_per_mtok, output_usd_per_mtok, median_ttft_ms, output_tps",
        )

        .eq("is_active", true)
        .range(f, t),
    ),
    // Oldest first, so the newest measurement is the one that lands in a column.
    fetchAllRows((f, t) =>
      supabase
        .from("benchmarks")
        .select("model_key, suite, task_class, score, measured_at")
        .order("measured_at", { ascending: true })
        .range(f, t),
    ),

    supabase
      .from("pricing_snapshots")
      .select("synced_at")
      .eq("feed", PRICING_FEED)
      .eq("status", "ok")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);


  const rows: CatalogRow[] = models.map((m) => {
    const priced = prices.filter((p) => p.model_key === m.model_key);
    const hosts = priced
      .map((p) => ({
        host_label: p.host_label,
        input: Number(p.input_usd_per_mtok),
        output: Number(p.output_usd_per_mtok),
        aggregate: !isRealEndpoint(p),
      }))
      .sort((a, b) => a.input - b.input || a.host_label.localeCompare(b.host_label));
    const realHosts = hosts.filter((h) => !h.aggregate);


    const scores = benchmarks
      .filter((b) => b.model_key === m.model_key)
      .map((b) => ({ task_class: b.task_class, suite: b.suite, score: Number(b.score) }))
      .sort((a, b) => a.task_class.localeCompare(b.task_class));

    const named: { gpqa: number | null; ifbench: number | null; coding: number | null } = {
      gpqa: null,
      ifbench: null,
      coding: null,
    };
    for (const s of scores) {
      const col = SUITE_COLUMN[s.suite];
      if (col) named[col] = s.score;
    }
    // AA's own published composite — read straight through, never derived here.
    const publishedIndex = scores.find((s) => s.suite === AA_INTELLIGENCE_SUITE);


    // Latency is published per model, not per endpoint — every host row for a
    // model carries the same medians, so the first measured one is the model's.
    const withLatency = priced.find((p) => p.median_ttft_ms != null && p.output_tps != null);

    return {
      model_key: m.model_key,
      display_name: m.display_name,
      vendor: m.vendor,
      tier: m.tier,
      is_reasoning: Boolean(m.is_reasoning),
      context_window: m.context_window,
      modality: m.modality,
      hosts,
      cheapestInput: realHosts.length ? realHosts[0].input : null,
      cheapestOutput: realHosts.length ? Math.min(...realHosts.map((h) => h.output)) : null,

      scores,
      ...named,
      intelligence: publishedIndex ? publishedIndex.score : null,

      ttftMs: withLatency ? Number(withLatency.median_ttft_ms) : null,
      outputTps: withLatency ? Number(withLatency.output_tps) : null,
    };
  });

  rows.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return {
    rows,
    vendors: [...new Set(rows.map((r) => r.vendor))].sort((a, b) => a.localeCompare(b)),
    // "Serving providers" means companies serving weights — real endpoints only.
    providers: [...new Set(prices.filter(isRealEndpoint).map((p) => p.host_label))].sort((a, b) =>
      a.localeCompare(b),
    ),

    // "Live" is a claim about now, not about history: a feed that last answered
    // hours ago is stale, however many successful runs preceded it.
    live: pricingIsLive(snapshot.data?.synced_at ?? null),
  };
}

