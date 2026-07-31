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

  const byHost = new Map<string, { host: string; label: string; models: Set<string> }>();
  for (const p of prices) {
    const entry = byHost.get(p.host) ?? { host: p.host, label: p.host_label, models: new Set<string>() };
    entry.models.add(p.model_key);
    byHost.set(p.host, entry);
  }

  const pricedModels = new Set(prices.map((p) => p.model_key));

  return {
    providers: [...byHost.values()]
      .map((h) => ({ host: h.host, label: h.label, models: h.models.size }))
      .sort((a, b) => b.models - a.models || a.label.localeCompare(b.label)),
    models: models
      .filter((m) => pricedModels.has(m.model_key))
      .map((m) => ({ model_key: m.model_key, display_name: m.display_name }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name)),
  };
}
