import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { isOwner } from "./access";

/**
 * Owner-only server guard.
 *
 * Runs as middleware rather than as a check inside the handler: middleware
 * rejections propagate to the caller as a real error, and — more importantly —
 * the handler body never executes, so no restricted read can be started at all.
 */
export const requireOwner = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    if (!isOwner(context.userId)) {
      throw new Error("Forbidden: this workspace is restricted");
    }
    return next();
  });
