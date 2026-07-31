import { createPublicServerClient } from "@/lib/supabase-public.server";

import type { EstimatorOptions } from "../estimator.functions";

/** Provider and model choices, taken only from rows that actually carry a live price. */
export async function readEstimatorOptions(): Promise<EstimatorOptions> {
  const supabase = createPublicServerClient();

  const [pricesRes, modelsRes] = await Promise.all([
    supabase.from("host_prices").select("model_key, host, host_label"),
    supabase.from("model_catalog").select("model_key, display_name"),
  ]);

  const prices = pricesRes.data ?? [];
  const models = modelsRes.data ?? [];

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

  return {
    providers: [...byLabel.values()]
      .map((h) => ({ label: h.label, models: h.models.size }))
      .sort((a, b) => b.models - a.models || a.label.localeCompare(b.label)),
    models: models
      .filter((m) => pricedModels.has(m.model_key))
      .map((m) => ({ model_key: m.model_key, display_name: m.display_name }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name)),
  };
}
