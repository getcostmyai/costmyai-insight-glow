import type { BenchmarkRow, MarginRow, PriceRow } from "@/lib/engine/types";
import { createPublicServerClient } from "@/lib/supabase-public.server";
import { fetchAllRows } from "@/lib/paginate.server";

import { resolveEstimate, type CatalogModelRow, type EstimatorCatalog } from "./core";
import type { EstimatorInput, EstimatorResult } from "./spec";

/** One read of the catalog tables the certify path itself prices against. */
export async function readEstimatorCatalog(): Promise<EstimatorCatalog> {
  const supabase = createPublicServerClient();

  const [prices, models, benchmarks, margins] = await Promise.all([
    fetchAllRows((f, t) =>
      supabase
        .from("host_prices")
        .select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok")
        .eq("is_active", true)
        .range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabase
        .from("model_catalog")
        .select("model_key, display_name, vendor, tier")
        .eq("is_active", true)
        .range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabase.from("benchmarks").select("model_key, suite, task_class, score").range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabase.from("benchmark_margins").select("suite, task_class, margin").range(f, t),
    ),
  ]);

  return {
    prices: prices as PriceRow[],
    models: models as CatalogModelRow[],
    benchmarks: benchmarks as BenchmarkRow[],
    margins: margins as MarginRow[],
  };
}

/**
 * The public estimator. The decision itself lives in core.ts and is shared with
 * the indicative-band pass, so the instant slider figure and this authoritative
 * figure can never diverge in logic — only in resolution.
 */
export async function estimateSaving(input: EstimatorInput): Promise<EstimatorResult> {
  return resolveEstimate(await readEstimatorCatalog(), input);
}
