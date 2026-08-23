import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CustomerDirectory } from "./customers";

/**
 * The customer directory. Platform admin only, and the database decides that —
 * this call carries no proof of its own.
 *
 * The plan is resolved against the `live` payment environment explicitly: a
 * sandbox row is a test-mode checkout and must never be reported as a real
 * paid customer. Where one exists it is surfaced separately, out loud.
 */
export const getCustomerDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomerDirectory> => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_platform_admin");
    if (error) throw error;
    if (!isAdmin) throw new Error("Not found");

    const { readCustomerDirectory } = await import("./customers.server");
    return readCustomerDirectory("live");
  });
