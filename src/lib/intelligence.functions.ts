import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

import type { IntelligencePayload } from "./intelligence/intelligence.server";

export type { IntelligencePayload };

export const getIntelligence = createServerFn({ method: "GET" }).handler(async () => {
  const { readIntelligence } = await import("./intelligence/intelligence.server");
  return readIntelligence();
});

export const intelligenceQuery = () =>
  queryOptions({
    queryKey: ["market-intelligence"],
    queryFn: () => getIntelligence(),
    staleTime: 5 * 60_000,
  });
