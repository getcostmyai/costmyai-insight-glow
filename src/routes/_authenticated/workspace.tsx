import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Loader2, LogOut, PlugZap } from "lucide-react";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { supabase } from "@/integrations/supabase/client";
import { createWorkspace, listMyWorkspaces } from "@/lib/workspace.functions";
import { suggestWorkspaceName, validateWorkspaceName } from "@/lib/workspace/naming";

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
  component: WorkspacePage,
});

function WorkspacePage() {
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

  return (
    <div className="relative">
      <SignOutButton />
      <DashboardView scope="mine" />
    </div>
  );
}

function FirstWorkspace({ email }: { email: string | null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const suggested = useMemo(() => suggestWorkspaceName(email), [email]);
  const [name, setName] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateWorkspaceName(name);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createWorkspace({ data: { name } });
      await queryClient.invalidateQueries({ queryKey: ["my-workspaces"] });
      // The workspace exists on Compare; choosing a rung is the next step, and
      // any paid rung goes through checkout before it is provisioned.
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
          <PlugZap className="h-6 w-6 text-primary" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Name your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One workspace per AI stack. You'll connect your gateway next — CostMyAI reads usage
            metadata only, never your provider keys.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              placeholder="Acme"
            />
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
            Starts on Compare (free): same model, cheaper host. Upgrade any time.
          </p>
        </div>
      </div>
    </main>
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
          : "absolute right-6 top-6 z-50 flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur hover:text-foreground"
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
