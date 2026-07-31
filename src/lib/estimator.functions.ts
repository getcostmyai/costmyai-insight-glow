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
    const { estimateSaving } = await import("./estimator/estimate.server");
    return estimateSaving(data);
  });

export const estimatorOptionsQuery = () =>
  queryOptions({
    queryKey: ["estimator-options"],
    queryFn: () => getEstimatorOptions(),
    staleTime: 5 * 60_000,
  });

export interface EstimatorOptions {
  providers: { host: string; label: string; models: number }[];
  models: { model_key: string; display_name: string }[];
}

export const getEstimatorOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<EstimatorOptions> => {
    const { readEstimatorOptions } = await import("./estimator/options.server");
    return readEstimatorOptions();
  },
);
