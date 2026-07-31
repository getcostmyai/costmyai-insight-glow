import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

import type { PartnerLadder } from "./partner-tiers";

/**
 * Public read of the commission ladder. `partner_tiers` has an anon SELECT
 * policy ("tiers are public"), so the marketing page can state the real rates.
 */
export const getPartnerLadder = createServerFn({ method: "GET" }).handler(async () => {
  const { readPartnerLadder } = await import("./partner-tiers.server");
  return readPartnerLadder();
});

export const partnerLadderQuery = () =>
  queryOptions<PartnerLadder>({
    queryKey: ["partner-ladder"],
    queryFn: () => getPartnerLadder(),
    staleTime: 5 * 60_000,
  });
