import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Banknote,
  ClipboardList,
  Gauge,
  Lightbulb,
  Loader2,
  Split,
} from "lucide-react";

import { getAdminOverview } from "@/lib/admin/overview.functions";
import { ADMIN_WINDOWS, eventLabel, type AdminWindow } from "@/lib/admin/overview";
import { stageLabel } from "@/lib/partner-funnel";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin command center — CostMyAI internal" },
      {
        name: "description",
        content:
          "One front door to the platform: visitor funnel, event breakdown and the state of every internal queue.",
      },
      { property: "og:title", content: "Admin command center" },
      { property: "og:description", content: "Internal platform overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminHome,
});

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function AdminHome() {
  const read = useServerFn(getAdminOverview);
  const [windowDays, setWindowDays] = useState<AdminWindow>(30);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["admin-overview", windowDays],
    queryFn: () => read({ data: { windowDays } }),
    retry: false,
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Gauge className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-[0.14em]">Internal</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Command center</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Real numbers from real events. Nothing here is estimated, and anything that is not
            measured yet says so.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ADMIN_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowDays(w)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                w === windowDays
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {w}d
            </button>
          ))}
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
      </header>

      {isLoading ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading
        </div>
      ) : error ? (
        <p className="mt-10 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load the overview."}
        </p>
      ) : data ? (
        <>
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Visitor funnel — last {data.windowDays} days
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Events" value={data.totals.events.toLocaleString()} />
              <Stat label="Distinct visitors" value={data.totals.visitors.toLocaleString()} />
              <Stat
                label="Distinct sessions"
                value={data.totals.sessions.toLocaleString()}
                note={
                  data.totals.legacyEvents > 0
                    ? `${data.totals.legacyEvents.toLocaleString()} events pre-date session tracking and are excluded`
                    : undefined
                }
              />
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 text-right font-medium">Visitors</th>
                    <th className="px-4 py-3 text-right font-medium">From previous</th>
                  </tr>
                </thead>
                <tbody>
                  {data.funnel.map((r) => (
                    <tr key={r.stage} className="border-t border-border">
                      <td className="px-4 py-3">{stageLabel(r.stage)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {r.visitors.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {r.ratePct === null ? "—" : `${r.ratePct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Distinct visitors per stage across the whole platform, partner-referred or not.
              Synthetic rows are excluded. Zero is a real answer.
            </p>
          </section>

          <section className="mt-12">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Event breakdown
            </h2>
            {data.events.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No events recorded in this window.
              </p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Event</th>
                      <th className="px-4 py-3 text-right font-medium">Events</th>
                      <th className="px-4 py-3 text-right font-medium">Visitors</th>
                      <th className="px-4 py-3 text-right font-medium">Sessions</th>
                      <th className="px-4 py-3 text-right font-medium">Pre-session rows</th>
                      <th className="px-4 py-3 text-right font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e) => (
                      <tr key={e.eventType} className="border-t border-border">
                        <td className="px-4 py-3">
                          {eventLabel(e.eventType)}
                          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                            {e.eventType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {e.events.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {e.visitors.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {e.sessions.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {e.legacyEvents.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground">
                          {e.lastAt ? e.lastAt.slice(0, 16).replace("T", " ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              "Pre-session rows" are events written before session tracking existed. They carry no
              session id and are never counted as sessions.
            </p>
          </section>

          <section className="mt-12">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Queues and health
            </h2>
            {data.summary.errors.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {data.summary.errors.map((e) => (
                  <li key={e} className="text-xs text-destructive">
                    {e}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card
                to="/admin/jobs"
                icon={<Activity className="h-4 w-4" />}
                title="Scheduled jobs"
                value={
                  data.summary.jobs
                    ? `${data.summary.jobs.healthy}/${data.summary.jobs.total} healthy`
                    : null
                }
                detail={
                  data.summary.jobs
                    ? `${data.summary.jobs.stale} stale · ${data.summary.jobs.failing} failing`
                    : "Could not be read"
                }
                alarm={Boolean(
                  data.summary.jobs && data.summary.jobs.stale + data.summary.jobs.failing > 0,
                )}
              />
              <Card
                to="/admin/leads"
                icon={<Lightbulb className="h-4 w-4" />}
                title="Intelligence leads"
                value={
                  data.summary.leadsPending === null
                    ? null
                    : `${data.summary.leadsPending} awaiting triage`
                }
                detail="Detector output with no editorial decision yet"
                alarm={(data.summary.leadsPending ?? 0) > 0}
              />
              <Card
                to="/admin/partner-applications"
                icon={<ClipboardList className="h-4 w-4" />}
                title="Partner applications"
                value={
                  data.summary.applicationsPending === null
                    ? null
                    : `${data.summary.applicationsPending} pending`
                }
                detail="Applications waiting on a review decision"
                alarm={(data.summary.applicationsPending ?? 0) > 0}
              />
              <Card
                to="/admin/payouts"
                icon={<Banknote className="h-4 w-4" />}
                title="Payout queue"
                value={
                  data.summary.payouts
                    ? `${usd(data.summary.payouts.amountUsd)} · ${data.summary.payouts.count} partner${data.summary.payouts.count === 1 ? "" : "s"}`
                    : null
                }
                detail={
                  data.summary.payouts
                    ? `Unpaid commission, ${data.summary.payouts.environment} environment`
                    : "Could not be read"
                }
                alarm={(data.summary.payouts?.count ?? 0) > 0}
              />
              <Card
                to="/admin/referrals"
                icon={<Split className="h-4 w-4" />}
                title="Acquisition split"
                value={
                  data.summary.referrals
                    ? `${data.summary.referrals.partnerPct}% via partner`
                    : null
                }
                detail={
                  data.summary.referrals
                    ? `${data.summary.referrals.total} workspaces · ${data.summary.referrals.direct} direct · ${data.summary.referrals.partnerReferred} referred`
                    : "Could not be read"
                }
              />
            </div>
          </section>

          <section className="mt-12 rounded-2xl border border-dashed border-border p-6">
            <h2 className="text-sm font-semibold">Not yet tracked</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Two things this dashboard cannot answer today, because nothing captures them yet.
              These are real gaps, not empty charts:
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <span className="font-medium">Page-level traffic.</span>{" "}
                <span className="text-muted-foreground">
                  Which URLs get visited. Lead events are recorded per action, not per pageview, so
                  there is no per-URL count to show. Requires a new capture step on every route.
                </span>
              </li>
              <li>
                <span className="font-medium">Traffic source beyond partner referrals.</span>{" "}
                <span className="text-muted-foreground">
                  Referrer and campaign are not stored on lead events — only a partner id when a
                  referral cookie is present. Everything else arrives as "unknown". Requires
                  capturing referrer and UTM parameters at first visit.
                </span>
              </li>
            </ul>
          </section>

          <p className="mt-10 font-mono text-[11px] text-muted-foreground">
            read at {data.readAt.slice(0, 19).replace("T", " ")} UTC
          </p>
        </>
      ) : null}
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Card({
  to,
  icon,
  title,
  value,
  detail,
  alarm = false,
}: {
  to: "/admin/jobs" | "/admin/leads" | "/admin/partner-applications" | "/admin/payouts" | "/admin/referrals";
  icon: React.ReactNode;
  title: string;
  value: string | null;
  detail: string;
  alarm?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{title}</span>
      </div>
      <p
        className={`mt-3 text-xl font-semibold tabular-nums ${
          value === null ? "text-destructive" : alarm ? "text-primary" : ""
        }`}
      >
        {value ?? "Unavailable"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </Link>
  );
}
