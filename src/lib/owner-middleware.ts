import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { demoOrgFor, isOwner, type DemoAudience } from "./access";

/**
 * Owner-only lock. Re-armed after the temporary demo bypass (Dispatch 75).
 * Keep this `false`: `/demo` is never open to the world.
 */
export const DEMO_AUTH_BYPASS = false;

/**
 * Rejections are thrown as real HTTP responses so the caller can distinguish
 * "not signed in" (401) from "signed in, but not allowed" (403) instead of
 * collapsing both into an opaque 500.
 */
const requireBearer = createMiddleware({ type: "function" }).server(({ next }) => {
  const request = getRequest();
  // The generated auth middleware throws a plain Error for missing credentials,
  // which surfaces as an opaque 500. Reject unauthenticated callers first.
  const header = request?.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return next();
});

/**
 * Strictly the owner. Kept separate from demo access so that widening who may
 * see a demo workspace can never silently widen anything else.
 */
export const requireOwner = createMiddleware({ type: "function" })
  .middleware([requireBearer, requireSupabaseAuth])
  .server(async ({ next, context }) => {
    if (!isOwner(context.userId)) {
      throw new Response("Forbidden: this workspace is restricted", { status: 403 });
    }
    return next();
  });

/**
 * Resolve the caller's demo audience, or null.
 *
 * The partner arm reuses the existing, RLS-proven partner-membership
 * mechanism rather than inventing a second access path: a row in
 * `partner_users` joined through `partners`, where the partnership itself is
 * `active`. That makes access self-revoking — the moment a partner's status
 * stops being `active`, the very next request is refused, with no session to
 * invalidate and no list to maintain. Scoped to that and nothing else: not
 * "any authenticated user", not a platform flag, not a role grant.
 */
async function demoAudienceOf(
  userId: string,
  supabase: { rpc: (fn: "is_active_partner", args: { _user_id: string }) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<DemoAudience | null> {
  if (isOwner(userId)) return "owner";
  const { data, error } = await supabase.rpc("is_active_partner", { _user_id: userId });
  if (error) return null;
  return data === true ? "partner" : null;
}

/**
 * Demo-workspace guard: the owner, or a real, currently-active partner.
 *
 * Enforced here at the data boundary, as middleware rather than inside the
 * handler, so the handler body never runs for an unauthorised caller and no
 * restricted read is ever started. The route gate in the UI is cosmetic; this
 * is what actually refuses the request.
 *
 * Puts `demoOrgId` on the context so the workspace a caller reads is derived
 * from who they are, never from anything they send.
 */
export const requireDemoAccess = createMiddleware({ type: "function" })
  .middleware([requireBearer, requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const audience = await demoAudienceOf(context.userId, context.supabase as never);
    if (!audience) {
      throw new Response("Forbidden: this workspace is restricted", { status: 403 });
    }
    return next({ context: { demoAudience: audience, demoOrgId: demoOrgFor(audience) } });
  });
