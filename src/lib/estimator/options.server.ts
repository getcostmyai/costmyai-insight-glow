import { createPublicServerClient } from "@/lib/supabase-public.server";

import type { EstimatorOptions } from "../estimator.functions";
import { fetchAllRows } from "@/lib/paginate.server";
import { readEstimatorCatalog } from "./estimate.server";
import { resolveEstimate } from "./core";
import { WORKLOADS } from "./spec";

/**
 * Probe spend used only to read the *rate* out of the shared decision. It is
 * deliberately large so materiality never truncates the band — the client
 * re-applies the real spend to the rate.
 */
const PROBE_SPEND = 1_000_000;

/** Provider and model choices, taken only from rows that actually carry a live price. */
export async function readEstimatorOptions(): Promise<EstimatorOptions> {
  const supabase = createPublicServerClient();

  const [prices, models] = await Promise.all([
    fetchAllRows((f, t) =>
      supabase.from("host_prices").select("model_key, host, host_label").eq("is_active", true).range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabase.from("model_catalog").select("model_key, display_name").eq("is_active", true).range(f, t),
    ),
  ]);

  // Grouped by display label, not by host id: a provider can publish through
  // several host ids (e.g. two OpenAI endpoints), and showing the same name
  // twice would make the user pick between two things that read identically.
  const byLabel = new Map<string, { label: string; models: Set<string> }>();
  for (const p of prices) {
    const entry = byLabel.get(p.host_label) ?? { label: p.host_label, models: new Set<string>() };
    entry.models.add(p.model_key);
    byLabel.set(p.host_label, entry);
  }

  const pricedModels = new Set(prices.map((p) => p.model_key));

  // modelKeys only — display names are resolved client-side from `models`,
  // so no name is duplicated across every provider that serves it.
  const providers = [...byLabel.values()]
    .map((h) => ({ label: h.label, models: h.models.size, modelKeys: [...h.models].sort() }))
    .sort((a, b) => b.models - a.models || a.label.localeCompare(b.label));

  const modelChoices = models
    .filter((m) => pricedModels.has(m.model_key))
    .map((m) => ({ model_key: m.model_key, display_name: m.display_name }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  /* ---------------- indicative bands ----------------
   * Computed by the SAME resolveEstimate the authoritative endpoint calls,
   * against the SAME catalog rows — just once per (provider|model) × workload
   * instead of once per keystroke. The client multiplies the stored rate by the
   * live spend and distribution share; it never runs pricing logic of its own.
   */
  const catalog = await readEstimatorCatalog();

  const rateFor = (provider: string | null, modelKey: string | null, index: number) => {
    const r = resolveEstimate(catalog, {
      monthlySpendUsd: PROBE_SPEND,
      provider,
      modelKey,
      workload: WORKLOADS[index].id,
      distribution: "even",
    });
    return r.state === "ok" ? Math.round(r.savingPct * 10) / 1000 : null;
  };

  const series = (provider: string | null, modelKey: string | null) =>
    WORKLOADS.map((_, i) => rateFor(provider, modelKey, i));

  const bands = {
    workloads: WORKLOADS.map((w) => w.id),
    byProvider: Object.fromEntries(providers.map((p) => [p.label, series(p.label, null)])),
    byModel: Object.fromEntries(modelChoices.map((m) => [m.model_key, series(null, m.model_key)])),
  };

  return { providers, models: modelChoices, bands };
}
