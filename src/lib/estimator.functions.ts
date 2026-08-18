import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

import type { EstimatorInput, EstimatorResult } from "./estimator/spec";

/**
 * Public estimator endpoint. Anon RLS covers the catalog tables it reads, and
 * the computation itself lives in estimate.server.ts alongside the engine's own
 * margin logic.
 */
export const estimateSavingFn = createServerFn({ method: "POST" })
  .inputValidator((data: EstimatorInput) => ({
    monthlySpendUsd: Math.max(0, Math.min(2_000_000, Number(data.monthlySpendUsd) || 0)),
    provider: data.provider ? String(data.provider).slice(0, 120) : null,
    workload: data.workload,
    modelKey: data.modelKey ? String(data.modelKey).slice(0, 120) : null,
    distribution: data.distribution,
  }))
  .handler(async ({ data }): Promise<EstimatorResult> => {
    // Unauthenticated, multi-read and a write per call — the cheapest
    // amplification target in the app, so it is the strictest of the public
    // read paths. Counters are shared across workers (Postgres-backed).
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.estimator, callerIdentity(getRequest()));

    const { estimateSaving } = await import("./estimator/estimate.server");
    const result = await estimateSaving(data);

    // Completion is recorded here rather than from the page: the request is
    // already in scope, and a refusal is a real outcome that must be counted
    // exactly like a number.
    const { recordLeadEvent } = await import("./telemetry/lead-events.server");
    await recordLeadEvent("estimator_completed", { input: data, result });

    return result;
  });


export const estimatorOptionsQuery = () =>
  queryOptions({
    queryKey: ["estimator-options"],
    queryFn: () => getEstimatorOptions(),
    staleTime: 5 * 60_000,
  });

export interface EstimatorOptions {
  providers: { label: string; models: number }[];
  models: { model_key: string; display_name: string }[];
  /**
   * Pre-computed saving *rates* (fractions) produced by the same
   * resolveEstimate the authoritative endpoint runs, one per selection ×
   * workload. null means that combination has no certifiable switch — the
   * client shows no indicative figure there rather than inventing one.
   */
  bands: {
    workloads: string[];
    byProvider: Record<string, (number | null)[]>;
    byModel: Record<string, (number | null)[]>;
  };
}


export const getEstimatorOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<EstimatorOptions> => {
    const { readEstimatorOptions } = await import("./estimator/options.server");
    return readEstimatorOptions();
  },
);
