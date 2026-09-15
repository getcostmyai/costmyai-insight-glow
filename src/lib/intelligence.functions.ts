import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

import type { IntelligencePayload } from "./intelligence/intelligence.server";
import type { FrozenMonth } from "./intelligence/snapshot.server";
import { emptyIntelligence } from "./public-empty";

export type { IntelligencePayload, FrozenMonth };

export interface LiveIntelligence {
  data: IntelligencePayload;
  /** Newest closed month with a frozen page — the only safe citation target. */
  citableMonth: string | null;
  archive: { month: string; frozenAt: string }[];
}

export const getIntelligence = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveIntelligence> => {
    const { readIntelligenceSafe } = await import("./intelligence/intelligence.server");
    const { listFrozenMonthsSafe } = await import("./intelligence/snapshot.server");
    const [data, archive] = await Promise.all([readIntelligenceSafe(), listFrozenMonthsSafe()]);
    return { data, archive, citableMonth: archive[0]?.month ?? null };
  },
);

export const getFrozenMonth = createServerFn({ method: "GET" })
  .inputValidator((data: { month: string }) => data)
  .handler(async ({ data }): Promise<{ frozen: FrozenMonth | null; archive: { month: string; frozenAt: string }[] }> => {
    const { readFrozenMonthSafe, listFrozenMonthsSafe } = await import(
      "./intelligence/snapshot.server"
    );
    const [frozen, archive] = await Promise.all([
      readFrozenMonthSafe(data.month),
      listFrozenMonthsSafe(),
    ]);
    return { frozen, archive };
  });

/** Degraded shape for the loader fallback: no market, stated as no market. */
export function degradedIntelligence(): LiveIntelligence {
  return { data: emptyIntelligence(), archive: [], citableMonth: null };
}

export const intelligenceQuery = () =>
  queryOptions({
    queryKey: ["market-intelligence"],
    queryFn: () => getIntelligence(),
    staleTime: 5 * 60_000,
    // See catalog.functions.ts: the read degrades, so a retry only delays the page.
    retry: false,
  });

export const frozenMonthQuery = (month: string) =>
  queryOptions({
    queryKey: ["market-intelligence", "frozen", month],
    queryFn: () => getFrozenMonth({ data: { month } }),
    // A frozen month cannot change; there is nothing to revalidate.
    staleTime: Infinity,
    retry: false,
  });
