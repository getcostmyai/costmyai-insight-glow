import { createContext, useContext } from "react";

import type { PartnerDashboard } from "@/lib/partners.functions";

/**
 * The partner account, read once by the /partner layout and handed to each of
 * its three pages. The layout already owns the loading, error, self-link and
 * "not a partner" states, so a page under it can assume a real account exists
 * and never repeats that fetch.
 */
const PartnerDataContext = createContext<PartnerDashboard | null>(null);

export const PartnerDataProvider = PartnerDataContext.Provider;

export function usePartnerData(): PartnerDashboard {
  const data = useContext(PartnerDataContext);
  if (!data) {
    throw new Error("usePartnerData must be used inside the /partner layout");
  }
  return data;
}
