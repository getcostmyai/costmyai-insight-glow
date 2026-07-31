import { createServerFn } from "@tanstack/react-start";

import { runPipeline } from "./engine/pipeline";
import type {
  BenchmarkRow,
  MarginRow,
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

    const [rollups, prices, benchmarks, margins, models] = await Promise.all([
      supabase
        .from("usage_rollups")
        .select(
          "model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd, output_p50, output_p95",
        )
        .eq("org_id", DEMO_ORG_ID)
        .eq("granularity", data.days === 1 ? "hour" : "day")
        .gte("bucket_start", since),
      supabase
        .from("host_prices")
        .select(
          "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, median_latency_ms",
        ),
      // Retired fixture rows stay in the table for audit, but the engine must
      // only ever reason over measured data.
      supabase
        .from("benchmarks")
        .select("model_key, suite, task_class, score")
        .eq("is_fixture", false),
      supabase
        .from("benchmark_margins")
        .select("suite, task_class, margin, method, synced_at, source_run_id")
        .eq("is_fixture", false),

      supabase.from("model_catalog").select("model_key, display_name, vendor, tier"),
    ]);

    const firstError =
      rollups.error ?? prices.error ?? benchmarks.error ?? margins.error ?? models.error;
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
        median_latency_ms: p.median_latency_ms == null ? null : Number(p.median_latency_ms),
      })) as PriceRow[],
      benchmarks: (benchmarks.data ?? []).map((b) => ({
        ...b,
        score: Number(b.score),
      })) as BenchmarkRow[],
      margins: (margins.data ?? []).map((m) => ({
        ...m,
        margin: Number(m.margin),
      })) as MarginRow[],
      models: (models.data ?? []) as ModelRow[],
    });

    const totalSpend = usage.reduce((sum, u) => sum + u.cost_usd, 0);
    const totalRequests = usage.reduce((sum, u) => sum + u.requests, 0);
    const inputTokens = usage.reduce((sum, u) => sum + u.input_tokens, 0);
    const outputTokens = usage.reduce((sum, u) => sum + u.output_tokens, 0);

    return {
      days: data.days,
      // Provenance for every equivalence claim on screen: which evaluation,
      // which measured band, measured when. Nothing is asserted uncited.
      evidence: (margins.data ?? []).map((m) => ({
        taskClass: m.task_class,
        suite: m.suite,
        evaluation: m.suite.split(":")[1] ?? m.suite,
        margin: Number(m.margin),
        method: m.method,
        measuredAt: m.synced_at,
        runId: m.source_run_id,
        scoredModels: (benchmarks.data ?? []).filter((b) => b.suite === m.suite).length,
      })),
      totals: { spend: totalSpend, requests: totalRequests, inputTokens, outputTokens },
      ...result,
    };
  });
