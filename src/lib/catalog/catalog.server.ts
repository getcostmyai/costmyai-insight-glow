import { createPublicServerClient } from "@/lib/supabase-public.server";
import { MAX_CATALOG_ROWS } from "@/lib/catalog-limits";

export interface CatalogRow {
  model_key: string;
  display_name: string;
  vendor: string;
  tier: string;
  is_reasoning: boolean;
  context_window: number | null;
  hosts: { host_label: string; input: number; output: number }[];
  cheapestInput: number | null;
  cheapestOutput: number | null;
  scores: { task_class: string; suite: string; score: number }[];
}

export interface CatalogPayload {
  rows: CatalogRow[];
  vendors: string[];
  providers: string[];
  live: boolean;
}

/** The public model catalog, read through the anon client — catalog data only. */
export async function readCatalog(): Promise<CatalogPayload> {
  const supabase = createPublicServerClient();

  const [modelsRes, pricesRes, benchRes, snapshot] = await Promise.all([
    supabase
      .from("model_catalog")
      .select("model_key, display_name, vendor, tier, is_reasoning, context_window")
      .eq("is_active", true)
      .limit(MAX_CATALOG_ROWS),
    supabase
      .from("host_prices")
      .select("model_key, host_label, input_usd_per_mtok, output_usd_per_mtok")
      .eq("is_active", true)
      .limit(MAX_CATALOG_ROWS),
    supabase.from("benchmarks").select("model_key, suite, task_class, score").limit(MAX_CATALOG_ROWS),
    supabase
      .from("pricing_snapshots")
      .select("synced_at")
      .eq("status", "ok")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const prices = pricesRes.data ?? [];
  const benchmarks = benchRes.data ?? [];

  const rows: CatalogRow[] = (modelsRes.data ?? []).map((m) => {
    const hosts = prices
      .filter((p) => p.model_key === m.model_key)
      .map((p) => ({
        host_label: p.host_label,
        input: Number(p.input_usd_per_mtok),
        output: Number(p.output_usd_per_mtok),
      }))
      .sort((a, b) => a.input - b.input || a.host_label.localeCompare(b.host_label));

    const scores = benchmarks
      .filter((b) => b.model_key === m.model_key)
      .map((b) => ({ task_class: b.task_class, suite: b.suite, score: Number(b.score) }))
      .sort((a, b) => a.task_class.localeCompare(b.task_class));

    return {
      model_key: m.model_key,
      display_name: m.display_name,
      vendor: m.vendor,
      tier: m.tier,
      is_reasoning: Boolean(m.is_reasoning),
      context_window: m.context_window,
      hosts,
      cheapestInput: hosts.length ? hosts[0].input : null,
      cheapestOutput: hosts.length ? Math.min(...hosts.map((h) => h.output)) : null,
      scores,
    };
  });

  rows.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return {
    rows,
    vendors: [...new Set(rows.map((r) => r.vendor))].sort((a, b) => a.localeCompare(b)),
    providers: [...new Set(prices.map((p) => p.host_label))].sort((a, b) => a.localeCompare(b)),
    live: Boolean(snapshot.data?.synced_at),
  };
}
