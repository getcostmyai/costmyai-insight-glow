import { Link } from "@tanstack/react-router";
import { PlugZap } from "lucide-react";

import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { RangeToggle, LocalTime, Metric } from "@/components/dashboard/primitives";
import { SpendChart } from "@/components/dashboard/SpendChart";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { supabase } from "@/integrations/supabase/client";
import { usd } from "@/lib/dashboard-data";
import type { LevelKey } from "@/lib/dashboard/levels";
import { compact, int } from "@/lib/gateway-metrics";
import type { PlanTier } from "@/lib/engine/types";

/** Rendered from the one shared nav definition — see src/lib/nav.ts. */
const topNav = APP_NAV;


/**
 * The chrome every level page shares: masthead, the level switcher, account
 * links. The switcher is a real router navigation — each level is its own
 * route, and the locked ones are still reachable so they can show their real
 * teaser rather than a 404 or a silent no-op.
 */
export function DashboardShell({
  ctl,
  level,
  children,
}: {
  ctl: DashboardController;
  level: LevelKey;
  children: React.ReactNode;
}) {
  const { data, session, scope } = ctl;

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-8 px-5 lg:px-8">
          <Link to="/" className="text-xl font-bold tracking-tight">
            Cost<span className="text-primary">My</span>AI
          </Link>
          <nav className="hidden items-center gap-7 lg:flex">
            {topNav.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            {/* Session-driven, never route-driven: after an OAuth callback the
                session arrives asynchronously and this must follow it. */}
            {session.ready && session.signedIn ? (
              <>
                <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground sm:block">
                  {session.email}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
                >
                  Sign out
                </button>
              </>
            ) : session.ready ? (
              <a
                href="/auth"
                className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                Sign in
              </a>
            ) : null}
            <a
              href={session.ready && session.signedIn ? "/workspace" : "/auth"}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:scale-[1.02] active:scale-95"
            >
              {session.ready && session.signedIn
                ? scope === "demo"
                  ? "Go to my workspace"
                  : "Connect a gateway"
                : "See if you're overpaying"}
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] gap-8 px-5 py-8 lg:px-8">
        <DashboardSidebar
          workspaceName={data.workspace.name}
          plan={data.plan as PlanTier}
          level={level}
          scope={scope}
        />

        <main className="min-w-0 flex-1 space-y-8">
          {data.dataState === "awaiting_first_event" && <AwaitingFirstEvent />}
          {children}
          <p className="pb-6 text-center text-xs text-muted-foreground">
            Savings computed from your tracked traffic and current provider pricing · last read{" "}
            <LocalTime iso={data.generatedAt} />.
          </p>
        </main>
      </div>
    </div>
  );
}

function AwaitingFirstEvent() {
  return (
    <section className="flex flex-wrap items-center gap-5 rounded-2xl border border-dashed border-primary/35 bg-primary-soft/50 p-6">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <PlugZap className="size-5" />
      </span>
      <div className="min-w-60 flex-1">
        <p className="text-sm font-semibold text-primary">Waiting for your first event</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing has been ingested for this workspace yet, so no check has run. Point your gateway
          at CostMyAI — we backfill the previous 30 days on connect, so the first view is a full
          month of history, not an empty chart.
        </p>
      </div>
      <Link
        to="/settings"
        className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
      >
        Connect your gateway
      </Link>
    </section>
  );
}

/**
 * Spend, requests and tokens over the selected window. Shown on Overview and
 * Compare, where the question is "what am I actually spending?" — the deeper
 * levels are about individual switches and do not repeat it.
 */
export function UsageSection({ ctl }: { ctl: DashboardController }) {
  const { data, range, setRange, metric, setMetric, activeRange, live, liveSeries } = ctl;

  return (
    <section className="card-surface p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Gateway usage · {activeRange.long}</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <Metric value={usd(live.spend)} label="spend" tone="text-spend" live />
            <Metric value={int(live.requests)} label="requests" live />
            <Metric value={compact(live.inputTokens)} label="input tok" live />
            <Metric value={compact(live.outputTokens)} label="output tok" live />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <RangeToggle range={range} onChange={setRange} />
          <div className="flex gap-1 rounded-full bg-muted p-1 text-xs font-medium">
            {(
              [
                ["spend", "Spend"],
                ["requests", "Requests"],
                ["tokens", "Tokens"],
              ] as const
            ).map(([key, t]) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  metric === key
                    ? "bg-card text-primary shadow-[var(--shadow-card)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6">
        <SpendChart series={liveSeries} metric={metric} />
      </div>
      {/* The freshness label is a clock reading: the server renders it minutes
          before the browser hydrates, so the two legitimately differ. */}
      <p className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
        {data.coverage.untrackedModels > 0
          ? `${data.coverage.untrackedModels} model${data.coverage.untrackedModels === 1 ? "" : "s"} excluded from the spend total — no pricing data available. `
          : "Every model in this window has live pricing coverage. "}
        Prices verified {data.coverage.pricesSyncedAgo}.
      </p>

    </section>
  );
}
