import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

import type { CatalogPayload, CatalogRow } from "./catalog/catalog.server";

export type { CatalogPayload, CatalogRow };

export const getCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { readCatalog } = await import("./catalog/catalog.server");
  return readCatalog();
});

export const catalogQuery = () =>
  queryOptions({
    queryKey: ["public-catalog"],
    queryFn: () => getCatalog(),
    staleTime: 5 * 60_000,
  });
