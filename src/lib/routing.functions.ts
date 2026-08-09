import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { paymentsEnvironment } from "./billing/env.server";
import { requirePlan } from "./billing/guard.server";
import type { ProviderGate } from "./dashboard/provider-gate";

/**
 * Provider routing grants — the read and revoke side (Dispatch 155, Stage 1).
 *
 * PROJECT RULE, same as `switches.functions.ts`: `requirePlan(...)` is the
 * first statement of every handler here. Rerouting is a Rightsize capability
 * and above, so nothing about it — including reading which destinations are
 * currently enabled — is reachable by a workspace that is not paying for it.
 *
 * There is deliberately no "enable routing" handler. A grant exists because
 * the customer put a key in their own container and that container said so;
 * a button here that could mint one would be the product claiming a permission
 * the customer never gave. The UI can look, and it can revoke.
 */

const UUID = /^[0-9a-f-]{36}$/i;

export const listProviderRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; hosts?: string[] }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return {
      orgId: data.orgId,
      hosts: (data.hosts ?? []).slice(0, 200).map((h) => String(h).slice(0, 120)),
    };
  })
  .handler(async ({ data, context }): Promise<ProviderGate[]> => {
    await requirePlan(context.supabase, data.orgId, "rightsize", paymentsEnvironment());

    const { resolveProviderGates, listRoutingGrants } = await import("./ingest/routing.server");
    const hosts =
      data.hosts.length > 0
        ? data.hosts
        : (await listRoutingGrants(data.orgId)).map((g) => g.host);
    return [...(await resolveProviderGates(data.orgId, hosts)).values()];
  });

export const revokeProviderRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; host: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    const host = String(data?.host ?? "").trim();
    if (!host) throw new Error("Unknown provider");
    return { orgId: data.orgId, host: host.slice(0, 120) };
  })
  .handler(async ({ data, context }): Promise<{ host: string; granted: false }> => {
    await requirePlan(context.supabase, data.orgId, "rightsize", paymentsEnvironment());

    // Identity underneath the plan gate: the caller must manage this workspace.
    const { data: manages, error: roleError } = await context.supabase.rpc("is_org_manager", {
      _org_id: data.orgId,
    });
    if (roleError) throw new Error(roleError.message);
    if (!manages) throw new Error("Only a workspace owner or admin can change routing");

    const { revokeRoutingGrant } = await import("./ingest/routing.server");
    await revokeRoutingGrant(data.orgId, data.host);
    return { host: data.host, granted: false };
  });
