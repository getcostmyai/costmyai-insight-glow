import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { isOwner } from "./access";

/**
 * TEMPORARY DEMO BYPASS — sign-in is broken and a live client demo is running.
 * Flip back to `false` to restore the owner-only lock (and re-run the
 * anonymous 401 / non-owner 403 proofs) once auth is fixed.
 */
export const DEMO_AUTH_BYPASS = true;

const passthrough = createMiddleware({ type: "function" }).server(({ next }) => next());

/**
 * Owner-only server guard.
 *
 * Runs as middleware rather than as a check inside the handler: middleware
 * rejections propagate to the caller as a real error, and — more importantly —
 * the handler body never executes, so no restricted read can be started at all.
 */
const ownerGuard = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    if (!isOwner(context.userId)) {
      throw new Error("Forbidden: this workspace is restricted");
    }
    return next();
  });

export const requireOwner = DEMO_AUTH_BYPASS ? passthrough : ownerGuard;
