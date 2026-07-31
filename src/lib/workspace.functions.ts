import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { PlanTier } from "./engine/types";
import { slugify, validateWorkspaceName } from "./workspace/naming";

/**
 * Workspace (organization) membership and plan.
 *
 * Every read here goes through the caller's own RLS-scoped client, so a
 * workspace id in a request body can never widen what comes back. Writes that
 * need more than RLS allows — creating a workspace also grants the owner role,
 * which no client may do — go through the database's SECURITY DEFINER
 * functions, which re-derive the actor from auth.uid() rather than trusting
 * anything sent from the browser.
 */

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  plan: PlanTier;
  role: "owner" | "admin" | "member";
}

export const listMyWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceRow[]> => {
    const { supabase, userId } = context;
    const [orgs, roles] = await Promise.all([
      supabase.from("organizations").select("id, name, slug, plan").order("created_at"),
      supabase.from("user_roles").select("org_id, role").eq("user_id", userId),
    ]);
    if (orgs.error) throw orgs.error;
    const roleFor = new Map((roles.data ?? []).map((r) => [r.org_id, r.role]));
    return (orgs.data ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      plan: o.plan as PlanTier,
      role: (roleFor.get(o.id) ?? "member") as WorkspaceRow["role"],
    }));
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string }) => {
    const problem = validateWorkspaceName(data?.name ?? "");
    if (problem) throw new Error(problem);
    return { name: data.name.trim() };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId, claims } = context;

    // Keep the profile in step with the account. There is no auth-schema
    // trigger here by design, so the app owns this write.
    await supabase.from("profiles").upsert(
      {
        id: userId,
        email: (claims.email as string | undefined) ?? null,
        full_name: ((claims.user_metadata as Record<string, unknown>)?.full_name as string) ?? null,
      },
      { onConflict: "id" },
    );

    const { data: orgId, error } = await supabase.rpc("create_organization", { _name: data.name });
    if (error) throw error;
    return { id: orgId as string, slug: slugify(data.name) };
  });

export const setWorkspacePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; plan: PlanTier }) => {
    // Only the free rung can be set from the app. Certify, Rightsize and Govern
    // are reachable through a real checkout and the signed webhook, and nothing
    // else — an owner cannot grant their own workspace a paid tier by calling
    // this. Downgrading to Compare is a legitimate self-service action.
    if (data?.plan !== "compare") {
      throw new Error("Paid rungs are set by checkout, not by request.");
    }
    if (!/^[0-9a-f-]{36}$/i.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId, plan: data.plan };
  })
  .handler(async ({ context, data }) => {
    // The database enforces owner-only; this is not a client-side check.
    const { error } = await context.supabase.rpc("set_org_plan", {
      _org_id: data.orgId,
      _plan: data.plan,
    });
    if (error) throw error;
    return { plan: data.plan };
  });
