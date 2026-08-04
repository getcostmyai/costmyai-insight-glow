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

/** Demo-workspace pipeline view — owner-only, same lock as the demo dashboard. */
export const getPipelineSnapshot = createServerFn({ method: "GET" })
  .middleware([requireOwner])
  .inputValidator((data: { days?: number } | undefined) => ({
    days: ([1, 7, 30] as number[]).includes(Number(data?.days)) ? Number(data?.days) : 30,
  }))
  .handler(async ({ data }) => {
    const { DEMO_ORG_ID } = await import("./supabase-public.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin;


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
        )
        .eq("is_active", true),
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

      supabase.from("model_catalog").select("model_key, display_name, vendor, tier").eq("is_active", true),
    ]);

    const firstError =
      rollups.error ?? prices.error ?? benchmarks.error ?? margins.error ?? models.error;
    if (firstError) {
      console.error("pipeline snapshot read failed", firstError);
      throw new Error("Could not load usage data");
    }

    // Collapse rollups into one aggregate per workload.
    const shapes = new Map<string, { p50: number[]; p95: number[] }>();
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

      // Response-length shape drives the rightsize dispersion test. Median of
      // the bucket medians, so one quiet hour cannot rewrite a verdict.
      const shape = shapes.get(key) ?? { p50: [], p95: [] };
      if (r.output_p50) shape.p50.push(Number(r.output_p50));
      if (r.output_p95) shape.p95.push(Number(r.output_p95));
      shapes.set(key, shape);
    }

    const medianOf = (values: number[]) => {
      if (values.length === 0) return null;
      const s = [...values].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
    };

    const usage = [...byWorkload.entries()].map(([key, u]) => ({
      ...u,
      output_p50: medianOf(shapes.get(key)?.p50 ?? []),
      output_p95: medianOf(shapes.get(key)?.p95 ?? []),
    }));

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
