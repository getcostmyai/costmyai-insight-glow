import { createServerFn } from "@tanstack/react-start";

import { runPipeline } from "./engine/rules";
import type {
  BenchmarkRow,
  ModelRow,
  PriceRow,
  UsageAggregate,
} from "./engine/types";

export type PipelineRange = 1 | 7 | 30;

export const getPipelineSnapshot = createServerFn({ method: "GET" })
  .inputValidator((data: { days?: number } | undefined) => ({
    days: ([1, 7, 30] as number[]).includes(Number(data?.days)) ? Number(data?.days) : 30,
  }))
  .handler(async ({ data }) => {
    const { createPublicServerClient, DEMO_ORG_ID } = await import("./supabase-public.server");
    const supabase = createPublicServerClient();

    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();

    const [rollups, prices, benchmarks, models] = await Promise.all([
      supabase
        .from("usage_rollups")
        .select("model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd")
        .eq("org_id", DEMO_ORG_ID)
        .gte("bucket_start", since),
      supabase
        .from("host_prices")
        .select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok"),
      supabase.from("benchmarks").select("model_key, task_class, score"),
      supabase.from("model_catalog").select("model_key, display_name, vendor, tier"),
    ]);

    const firstError = rollups.error ?? prices.error ?? benchmarks.error ?? models.error;
    if (firstError) {
      console.error("pipeline snapshot read failed", firstError);
      throw new Error("Could not load usage data");
    }

    // Collapse daily rollups into one aggregate per workload.
    const byWorkload = new Map<string, UsageAggregate>();
    for (const r of rollups.data ?? []) {
      const key = `${r.model_key}|${r.host}|${r.task_hint}`;
      const existing = byWorkload.get(key) ?? {
        model_key: r.model_key,
        host: r.host,
        task_hint: r.task_hint,
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        days: data.days,
      };
      existing.requests += Number(r.requests);
      existing.input_tokens += Number(r.input_tokens);
      existing.output_tokens += Number(r.output_tokens);
      existing.cost_usd += Number(r.cost_usd);
      byWorkload.set(key, existing);
    }

    const usage = [...byWorkload.values()];
    const result = runPipeline({
      usage,
      prices: (prices.data ?? []).map((p) => ({
        ...p,
        input_usd_per_mtok: Number(p.input_usd_per_mtok),
        output_usd_per_mtok: Number(p.output_usd_per_mtok),
      })) as PriceRow[],
      benchmarks: (benchmarks.data ?? []).map((b) => ({
        ...b,
        score: Number(b.score),
      })) as BenchmarkRow[],
      models: (models.data ?? []) as ModelRow[],
    });

    const totalSpend = usage.reduce((sum, u) => sum + u.cost_usd, 0);
    const totalRequests = usage.reduce((sum, u) => sum + u.requests, 0);
    const inputTokens = usage.reduce((sum, u) => sum + u.input_tokens, 0);
    const outputTokens = usage.reduce((sum, u) => sum + u.output_tokens, 0);

    return {
      days: data.days,
      totals: { spend: totalSpend, requests: totalRequests, inputTokens, outputTokens },
      ...result,
    };
  });
