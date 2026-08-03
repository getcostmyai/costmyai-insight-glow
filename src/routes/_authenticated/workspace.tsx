import { Outlet, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Handshake, KeyRound, Loader2, LogOut, PlugZap, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { INDUSTRIES, USE_CASES, type UseCase } from "@/lib/benchmark/taxonomy";
import { acceptInvite, listMyInvites } from "@/lib/invites.functions";
import { createWorkspace, listMyWorkspaces } from "@/lib/workspace.functions";
import { suggestWorkspaceName, validateWorkspaceName } from "@/lib/workspace/naming";

/**
 * Layout for the signed-in workspace. It owns the one question every level
 * page would otherwise repeat — does this person have a workspace at all — and
 * the account chrome. The level itself is the child route.
 */
export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({
    meta: [
      { title: "Your workspace — CostMyAI" },
      {
        name: "description",
        content:
          "Your own AI spend, certified switches, and savings captured — measured from your gateway, not estimated.",
      },
      { property: "og:title", content: "Your workspace — CostMyAI" },
      {
        property: "og:description",
        content: "Real spend, certified switches, and the savings still on the table.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { user } = Route.useRouteContext();
  const workspaces = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
    staleTime: 30_000,
  });

  if (workspaces.isPending) {
    return <Centered>Loading your workspace…</Centered>;
  }
  if (workspaces.isError) {
    return <Centered>We could not read your workspaces. Refresh in a moment.</Centered>;
  }
  if (workspaces.data.length === 0) {
    return <FirstWorkspace email={user.email ?? null} />;
  }

  // The account chrome lives in the shared sidebar and masthead. A floating
  // strip pinned over the top-right corner collided with the header's own
  // account chip, sign-out and primary CTA at ordinary widths.
  return <Outlet />;
}


function FirstWorkspace({ email }: { email: string | null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const suggested = useMemo(() => suggestWorkspaceName(email), [email]);
  const [name, setName] = useState(suggested);
  const [useCase, setUseCase] = useState<UseCase | "">("");
  const [useCaseOther, setUseCaseOther] = useState("");
  const [industry, setIndustry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateWorkspaceName(name);
    if (problem) {
      setError(problem);
      return;
    }
    if (!useCase) {
      setError("Pick what you mainly use AI for.");
      return;
    }
    if (!industry) {
      setError("Pick the industry closest to yours.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createWorkspace({ data: { name, useCase, useCaseOther, industry } });
      await queryClient.invalidateQueries({ queryKey: ["my-workspaces"] });
      // The workspace exists on Compare; choosing a level is the next step, and
      // any paid level goes through checkout before it is provisioned.
      navigate({ to: "/billing" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the workspace.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md">
        <SignOutButton inline />
        <div className="rounded-2xl border border-border bg-card p-8">
          <PendingInvites />
          <PlugZap className="h-6 w-6 text-primary" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Name your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One workspace per AI stack. You'll connect your gateway next — CostMyAI reads usage
            metadata only, never your provider keys.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              placeholder="Acme"
            />

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                What do you mainly use AI for?
              </span>
              <select
                value={useCase}
                onChange={(e) => setUseCase(e.target.value as UseCase)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Choose one</option>
                {USE_CASES.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>

            {useCase === "other" ? (
              <input
                value={useCaseOther}
                onChange={(e) => setUseCaseOther(e.target.value)}
                maxLength={120}
                placeholder="In a few words"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            ) : null}

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Your industry</span>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Choose one</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create workspace
              {!busy ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            That's everything we ask. Next you pick a level: Compare is free; Certify, Rightsize and
            Govern are paid.
          </p>
        </div>
      </div>
    </main>
  );
}

/**
 * An invited teammate arrives with no workspace of their own. Accepting is the
 * whole onboarding for them — they should never be pushed to create a second,
 * empty workspace beside the one they were asked to join.
 */
function PendingInvites() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invites = useQuery({ queryKey: ["my-invites"], queryFn: () => listMyInvites() });
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: (inviteId: string) => acceptInvite({ data: { inviteId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["my-invites"] });
      navigate({ to: "/workspace" });
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "That invitation could not be accepted."),
  });

  if (!invites.data?.length) return null;

  return (
    <div className="mb-6 space-y-3">
      {invites.data.map((i) => (
        <div key={i.id} className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm">
            You've been invited to <span className="font-semibold">{i.orgName}</span> as {i.role}.
          </p>
          <button
            onClick={() => accept.mutate(i.id)}
            disabled={accept.isPending}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {accept.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Join {i.orgName}
          </button>
        </div>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function SignOutButton({ inline = false }: { inline?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    // Order matters: stop in-flight protected reads before the session goes,
    // then drop their cached results so Back cannot restore them.
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <button
      onClick={signOut}
      className={
        inline
          ? "mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          : "absolute top-6 right-6 z-50 flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur hover:text-foreground"
      }
    >
      <LogOut className="h-3.5 w-3.5" />
      Sign out
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
