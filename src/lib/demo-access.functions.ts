import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { isOwner, type DemoAudience } from "./access";

/**
 * May the signed-in caller see a demo workspace, and which one?
 *
 * Used only to decide what the UI renders. The real refusal happens in
 * `requireDemoAccess` on every demo data function — this endpoint returns a
 * boolean and nothing else, so it can neither leak workspace contents nor
 * become an access path of its own.
 */
export const getDemoAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ audience: DemoAudience | null }> => {
    if (isOwner(context.userId)) return { audience: "owner" };
    const { data, error } = await context.supabase.rpc("is_active_partner", {
      _user_id: context.userId,
    });
    if (error) return { audience: null };
    return { audience: data === true ? "partner" : null };
  });
