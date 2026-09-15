import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

import type { CatalogPayload, CatalogRow } from "./catalog/catalog.server";

export type { CatalogPayload, CatalogRow };

export const getCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { readCatalogSafe } = await import("./catalog/catalog.server");
  return readCatalogSafe();
});

export const catalogQuery = () =>
  queryOptions({
    queryKey: ["public-catalog"],
    queryFn: () => getCatalog(),
    staleTime: 5 * 60_000,
    // Retrying a dead backend only turns a 3s failure into a 19s one before the
    // page gives up. The read already degrades; fail fast and render degraded.
    retry: false,
  });
