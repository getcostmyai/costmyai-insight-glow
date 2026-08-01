import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

import type { IntelligencePayload } from "./intelligence/intelligence.server";
import type { FrozenMonth } from "./intelligence/snapshot.server";

export type { IntelligencePayload, FrozenMonth };

export interface LiveIntelligence {
  data: IntelligencePayload;
  /** Newest closed month with a frozen page — the only safe citation target. */
  citableMonth: string | null;
  archive: { month: string; frozenAt: string }[];
}

export const getIntelligence = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveIntelligence> => {
    const { readIntelligence } = await import("./intelligence/intelligence.server");
    const { listFrozenMonths } = await import("./intelligence/snapshot.server");
    const [data, archive] = await Promise.all([readIntelligence(), listFrozenMonths()]);
    return { data, archive, citableMonth: archive[0]?.month ?? null };
  },
);

export const getFrozenMonth = createServerFn({ method: "GET" })
  .inputValidator((data: { month: string }) => data)
  .handler(async ({ data }): Promise<{ frozen: FrozenMonth | null; archive: { month: string; frozenAt: string }[] }> => {
    const { readFrozenMonth, listFrozenMonths } = await import("./intelligence/snapshot.server");
    const [frozen, archive] = await Promise.all([
      readFrozenMonth(data.month),
      listFrozenMonths(),
    ]);
    return { frozen, archive };
  });

export const intelligenceQuery = () =>
  queryOptions({
    queryKey: ["market-intelligence"],
    queryFn: () => getIntelligence(),
    staleTime: 5 * 60_000,
  });

export const frozenMonthQuery = (month: string) =>
  queryOptions({
    queryKey: ["market-intelligence", "frozen", month],
    queryFn: () => getFrozenMonth({ data: { month } }),
    // A frozen month cannot change; there is nothing to revalidate.
    staleTime: Infinity,
  });
