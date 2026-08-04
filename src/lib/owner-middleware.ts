import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { isOwner } from "./access";

/**
 * Owner-only lock. Re-armed after the temporary demo bypass (Dispatch 75).
 * Keep this `false`: `/demo` and every rung under it are Robin-only.
 */
export const DEMO_AUTH_BYPASS = false;

/**
 * Owner-only server guard.
 *
 * Runs as middleware rather than as a check inside the handler: middleware
 * rejections propagate to the caller as a real error, and — more importantly —
 * the handler body never executes, so no restricted read can be started at all.
 *
 * Rejections are thrown as real HTTP responses so the caller can distinguish
 * "not signed in" (401, from requireSupabaseAuth) from "signed in, but not the
 * owner" (403) instead of collapsing both into an opaque 500.
 */
export const requireOwner = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    if (!isOwner(context.userId)) {
      throw new Response("Forbidden: this workspace is restricted", { status: 403 });
    }
    return next();
  });
