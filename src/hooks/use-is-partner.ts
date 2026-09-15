import { useQuery } from "@tanstack/react-query";

import { amIPartner } from "@/lib/partners.functions";

/**
 * Whether the signed-in person belongs to a partner account.
 *
 * Returns undefined while the answer is unknown, so a caller can render
 * nothing rather than flashing a nav entry in and then out again.
 */
export function useIsPartner(): boolean | undefined {
  const q = useQuery({
    queryKey: ["am-i-partner"],
    queryFn: () => amIPartner(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return q.isPending || q.isError ? undefined : q.data;
}
