import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_WINDOWS, type AdminOverview, type AdminWindow } from "./overview";

/**
 * Is the caller a platform admin?
 *
 * Answered by the database, for the bearer token on this request — the nav
 * entry is not hidden client-side, it is never rendered unless this returns
 * true. Every admin page behind it re-checks independently, so a forged
 * "true" here still buys nothing.
 */
export const amIPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const { data, error } = await context.supabase.rpc("is_platform_admin");
    if (error) throw error;
    return Boolean(data);
  });

/** The whole admin front door, in one round trip. Platform admin only. */
export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { windowDays: number }): { windowDays: AdminWindow } => {
    const w = Number(data?.windowDays);
    if (!ADMIN_WINDOWS.includes(w as AdminWindow)) throw new Error("Unsupported window");
    return { windowDays: w as AdminWindow };
  })
  .handler(async ({ context, data }): Promise<AdminOverview> => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_platform_admin");
    if (error) throw error;
    if (!isAdmin) throw new Error("Not found");

    const { readAdminOverview } = await import("./overview.server");
    return readAdminOverview(context.supabase, data.windowDays);
  });
