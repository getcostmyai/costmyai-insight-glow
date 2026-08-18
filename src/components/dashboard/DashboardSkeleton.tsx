import { Link } from "@tanstack/react-router";
import { CreditCard, Handshake, Settings, Users } from "lucide-react";

import { DashboardMasthead } from "@/components/dashboard/DashboardChrome";
import { ICONS, PATHS } from "@/components/dashboard/DashboardSidebar";
import type { DashboardScope } from "@/lib/dashboard-queries";
import { LEVELS } from "@/lib/dashboard/levels";
import type { LevelKey } from "@/lib/dashboard/levels";

const accountNav = [
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Billing", to: "/billing", icon: CreditCard },
  { label: "Team", to: "/team", icon: Users },
  { label: "Partner", to: "/partner", icon: Handshake },
] as const;

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

/**
 * The chrome-preserving frame for "not yet" and "it failed".
 *
 * A dashboard whose snapshot is still resolving used to render nothing at all —
 * a white page with a cookie banner. The nav, the sidebar and the level
 * switcher do not depend on that query, so they should never disappear with it.
 */
export function DashboardFrame({
  scope,
  level,
  children,
}: {
  scope: DashboardScope;
  level: LevelKey;
  children: React.ReactNode;
}) {
  const paths = PATHS[scope];

  return (
    <div className="min-h-screen bg-background">
      <DashboardMasthead scope={scope} />
      <div className="mx-auto flex max-w-[1440px] gap-8 px-5 py-8 lg:px-8">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            <div>
              <Bar className="h-4 w-32" />
              <div className="mt-2 flex gap-2">
                <Bar className="h-5 w-20 rounded-full" />
                <Bar className="h-5 w-24 rounded-full" />
              </div>
            </div>
            <nav className="space-y-1">
              {LEVELS.map((meta) => {
                const Icon = ICONS[meta.key];
                const active = meta.key === level;
                return (
                  <Link
                    key={meta.key}
                    to={paths[meta.key]}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-primary-soft font-semibold text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4" />
                    {meta.label}
                  </Link>
                );
              })}
            </nav>
            <div className="space-y-1 border-t border-border pt-5">
              <p className="eyebrow px-3 pb-1">Account</p>
              {accountNav.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-8">{children}</main>
      </div>
    </div>
  );
}

/** The level body while the snapshot resolves — shaped like the real page. */
export function DashboardSkeleton({ scope, level }: { scope: DashboardScope; level: LevelKey }) {
  return (
    <DashboardFrame scope={scope} level={level}>
      <div
        data-testid="dashboard-skeleton"
        role="status"
        aria-busy="true"
        aria-label="Loading your workspace"
        className="space-y-8"
      >
        <div className="rounded-2xl border border-border bg-card p-6">
          <Bar className="h-3 w-28" />
          <Bar className="mt-4 h-9 w-56" />
          <Bar className="mt-3 h-3 w-72" />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Bar className="h-3 w-20" />
                <Bar className="h-6 w-28" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <Bar className="h-3 w-24" />
            <Bar className="h-7 w-40 rounded-full" />
          </div>
          <Bar className="mt-5 h-52 w-full" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-6">
              <Bar className="h-3 w-24" />
              <Bar className="mt-3 h-5 w-48" />
              <Bar className="mt-4 h-3 w-full" />
              <Bar className="mt-2 h-3 w-2/3" />
              <Bar className="mt-5 h-9 w-32 rounded-lg" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading your workspace…</span>
      </div>
    </DashboardFrame>
  );
}
