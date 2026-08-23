import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LogOut } from "lucide-react";

import { DashboardSidebar, type AccountKey } from "@/components/dashboard/DashboardSidebar";
import { useIsPlatformAdmin } from "@/hooks/use-platform-admin";
import { supabase } from "@/integrations/supabase/client";
import type { PlanTier } from "@/lib/engine/types";
import { listMyWorkspaces } from "@/lib/workspace.functions";

/**
 * Settings, Billing and Team, inside the product rather than beside it.
 *
 * These pages used to render bare, which dropped the level nav entirely and
 * left the browser's Back button as the only route home. They now share the
 * dashboard's chrome, so the workspace is never more than one click away.
 */
export function AccountShell({
  active,
  title,
  intro,
  children,
}: {
  active: AccountKey;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  const workspaces = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
    staleTime: 30_000,
  });
  const org = workspaces.data?.[0];
  const isAdmin = useIsPlatformAdmin();

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-5 lg:px-8">
          <Link to="/" className="text-xl font-bold tracking-tight">
            Cost<span className="text-primary">My</span>AI
          </Link>
          <Link
            to="/workspace"
            className="hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:flex"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
          {isAdmin ? (
            <Link
              to="/admin"
              className="hidden text-sm font-medium text-primary hover:text-primary/80 sm:block"
            >
              Admin
            </Link>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] gap-8 px-5 py-8 lg:px-8">
        <DashboardSidebar
          workspaceName={org?.name ?? "Your workspace"}
          plan={(org?.plan as PlanTier) ?? "compare"}
          level={null}
          scope="mine"
          account={active}
        />
        <main className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {intro ? (
            <div className="mt-2 max-w-2xl text-sm text-muted-foreground">{intro}</div>
          ) : null}
          <div className="mt-8 space-y-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
