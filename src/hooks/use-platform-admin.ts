import { useQuery } from "@tanstack/react-query";

import { amIPlatformAdmin } from "@/lib/admin/overview.functions";

/**
 * Whether the signed-in user is a platform admin, decided on the server.
 *
 * Used only to decide whether the Admin nav entry exists. It is a rendering
 * hint, never a guard: every admin route and every admin server function
 * checks `is_platform_admin()` for itself.
 */
export function useIsPlatformAdmin(): boolean {
  const { data } = useQuery({
    queryKey: ["am-i-platform-admin"],
    queryFn: () => amIPlatformAdmin(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data === true;
}
