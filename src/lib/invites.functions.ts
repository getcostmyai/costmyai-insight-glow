import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Workspace invitations.
 *
 * An invitation is addressed to an email address, never to a user id, and it is
 * redeemed by the database against the caller's own verified address. Nothing
 * the browser sends decides who joins which workspace: sending is gated by RLS
 * to managers of that workspace, and accepting runs through a SECURITY DEFINER
 * function that re-derives the actor from the session.
 */

const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES = ["admin", "member"] as const;

export type InviteRole = (typeof ROLES)[number];

export interface InviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  state: "pending" | "accepted" | "revoked" | "expired";
}

export interface PendingInvite {
  id: string;
  orgId: string;
  orgName: string;
  role: string;
  expiresAt: string;
}

export interface MemberRow {
  userId: string;
  email: string | null;
  role: string;
  joinedAt: string;
}

function stateOf(row: {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}): InviteRow["state"] {
  if (row.accepted_at) return "accepted";
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "pending";
}

/** Everyone in the workspace, with the role they hold. */
export const listWorkspaceMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId };
  })
  .handler(async ({ data, context }): Promise<MemberRow[]> => {
    const { supabase } = context;
    const [members, roles] = await Promise.all([
      supabase.from("memberships").select("user_id, created_at").eq("org_id", data.orgId),
      supabase.from("user_roles").select("user_id, role").eq("org_id", data.orgId),
    ]);
    if (members.error) throw members.error;

    const ids = (members.data ?? []).map((m) => m.user_id);
    // Profiles are readable only where policy allows; a missing row simply means
    // no email to show, never a failed page.
    const profiles = ids.length
      ? await supabase.from("profiles").select("id, email").in("id", ids)
      : { data: [] as { id: string; email: string | null }[] };
    const emailFor = new Map((profiles.data ?? []).map((p) => [p.id, p.email]));
    const roleFor = new Map((roles.data ?? []).map((r) => [r.user_id, r.role]));

    return (members.data ?? []).map((m) => ({
      userId: m.user_id,
      email: emailFor.get(m.user_id) ?? null,
      role: roleFor.get(m.user_id) ?? "member",
      joinedAt: m.created_at,
    }));
  });

/** Invitations this workspace has sent. Managers only, enforced by RLS. */
export const listWorkspaceInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId };
  })
  .handler(async ({ data, context }): Promise<InviteRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("org_invites")
      .select("id, email, role, expires_at, created_at, accepted_at, revoked_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      acceptedAt: r.accepted_at,
      revokedAt: r.revoked_at,
      state: stateOf(r),
    }));
  });

export const sendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; email: string; role: InviteRole }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    const email = (data?.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) throw new Error("That does not look like an email address.");
    if (email.length > 254) throw new Error("That email address is too long.");
    const role = ROLES.includes(data?.role) ? data.role : "member";
    return { orgId: data.orgId, email, role };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("org_invites").insert({
      org_id: data.orgId,
      email: data.email,
      role: data.role,
      invited_by: context.userId,
    });
    if (error) {
      // The partial unique index is the one collision worth naming plainly.
      if (error.code === "23505") throw new Error("That address already has an open invitation.");
      if (error.code === "42501") throw new Error("Only workspace owners and admins can invite.");
      throw error;
    }
    return { email: data.email };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { inviteId: string }) => {
    if (!UUID.test(data?.inviteId ?? "")) throw new Error("Unknown invitation");
    return { inviteId: data.inviteId };
  })
  .handler(async ({ data, context }) => {
    // RLS ("Managers revoke invites") already means a non-manager's update
    // matches no row — but an update that matches nothing returns no error, so
    // the caller would be told the invitation was revoked when it was not.
    // Asking for the affected row back turns that silent no-op into a refusal.
    const { data: row, error } = await context.supabase
      .from("org_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.inviteId)
      .is("accepted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("That invitation is no longer open, or is not yours to revoke.");
    return { ok: true };
  });


/** Open invitations addressed to the signed-in user's own email. */
export const listMyInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingInvite[]> => {
    const { data: rows, error } = await context.supabase
      .from("org_invites")
      .select("id, org_id, role, expires_at, organizations(name)")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      orgId: r.org_id,
      orgName:
        (r as unknown as { organizations?: { name?: string } }).organizations?.name ?? "a workspace",
      role: r.role,
      expiresAt: r.expires_at,
    }));
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { inviteId: string }) => {
    if (!UUID.test(data?.inviteId ?? "")) throw new Error("Unknown invitation");
    return { inviteId: data.inviteId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    // Keep the profile in step with the account so the workspace can show who
    // just joined.
    await supabase.from("profiles").upsert(
      {
        id: userId,
        email: (claims.email as string | undefined) ?? null,
        full_name: ((claims.user_metadata as Record<string, unknown>)?.full_name as string) ?? null,
      },
      { onConflict: "id" },
    );

    const { data: orgId, error } = await supabase.rpc("accept_invite", {
      _invite_id: data.inviteId,
    });
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
    return { orgId: orgId as string };
  });
