import { ErrorState } from "@/components/ErrorState";
import { AccountShell } from "@/components/dashboard/AccountShell";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Mail, ShieldCheck, UserPlus, X } from "lucide-react";

import { listMyWorkspaces } from "@/lib/workspace.functions";
import {
  listWorkspaceInvites,
  listWorkspaceMembers,
  revokeInvite,
  sendInvite,
  type InviteRole,
} from "@/lib/invites.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team — CostMyAI" },
      {
        name: "description",
        content: "Invite teammates to your CostMyAI workspace and manage who can act on switches.",
      },
      { property: "og:title", content: "Team — CostMyAI" },
      { property: "og:description", content: "Who can see your AI spend and act on switches." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const workspaces = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const org = workspaces.data?.[0];

  if (workspaces.isPending) return <Shell>Loading your workspace…</Shell>;
  // Ordered deliberately: a failed workspace read is not "you have none".
  if (workspaces.isError)
    return (
      <AccountShell active="team" title="Team">
        <ErrorState
          error={workspaces.error}
          onRetry={() => workspaces.refetch()}
          retrying={workspaces.isFetching}
        />
      </AccountShell>
    );
  if (!org) return <Shell>Create a workspace first.</Shell>;


  return <Team orgId={org.id} orgName={org.name} manager={org.role !== "member"} />;
}

function Team({ orgId, orgName, manager }: { orgId: string; orgName: string; manager: boolean }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => listWorkspaceMembers({ data: { orgId } }),
  });
  const invites = useQuery({
    queryKey: ["invites", orgId],
    queryFn: () => listWorkspaceInvites({ data: { orgId } }),
    enabled: manager,
  });

  const invite = useMutation({
    mutationFn: () => sendInvite({ data: { orgId, email, role } }),
    onSuccess: (res) => {
      setEmail("");
      setError(null);
      setSent(res.email);
      queryClient.invalidateQueries({ queryKey: ["invites", orgId] });
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not send that invite."),
  });

  const revoke = useMutation({
    mutationFn: (inviteId: string) => revokeInvite({ data: { inviteId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites", orgId] }),
  });

  const open = (invites.data ?? []).filter((i) => i.state === "pending");

  return (
    <AccountShell
      active="team"
      title="Team"
      intro={`Everyone in ${orgName} sees the same measured spend. Owners and admins can invite and act on switches; members can look.`}
    >
      <div className="w-full max-w-3xl">
        {manager ? (
          <section className="mt-8 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Invite a teammate</h2>
            </div>
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(null);
                invite.mutate();
              }}
            >
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                inputMode="email"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                disabled={invite.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Send invite
              </button>
            </form>
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            {sent ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Invitation open for <span className="text-foreground">{sent}</span>. They join this
                workspace the moment they sign in with that address.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Members
          </h2>
          {/* A failed read must never render as a short member list: an empty
              or partial roster is a claim about who has access. */}
          {members.isError ? (
            <ErrorState
              className="mt-3"
              compact
              error={members.error}
              onRetry={() => members.refetch()}
              retrying={members.isFetching}
            />
          ) : (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {(members.data ?? []).map((m) => (
                <li key={m.userId} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm">{m.email ?? "Teammate"}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {m.role}
                  </span>
                </li>
              ))}
              {members.isPending ? (
                <li className="px-5 py-3.5 text-sm text-muted-foreground">Loading…</li>
              ) : null}
            </ul>
          )}
        </section>

        {manager ? (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Open invitations
            </h2>
            {invites.isError ? (
              // "No invitations waiting" on a 500 is a false all-clear — an
              // owner would conclude nobody is pending when we simply don't know.
              <ErrorState
                className="mt-3"
                compact
                error={invites.error}
                onRetry={() => invites.refetch()}
                retrying={invites.isFetching}
              />
            ) : invites.isPending ? (
              <p className="mt-3 text-sm text-muted-foreground">Loading invitations…</p>
            ) : open.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No invitations waiting.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {open.map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-5 py-3.5">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {i.email}
                      <span className="text-xs text-muted-foreground">· {i.role}</span>
                    </span>
                    <button
                      onClick={() => revoke.mutate(i.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

      </div>
    </AccountShell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-sm text-muted-foreground">
      {children}
      <button
        onClick={() => navigate({ to: "/workspace" })}
        className="rounded-lg border border-border px-3 py-1.5 text-xs hover:text-foreground"
      >
        Go to workspace
      </button>
    </div>
  );
}
