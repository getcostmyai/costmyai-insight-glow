import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Loader2, RefreshCw } from "lucide-react";

import { listJobHealth } from "@/lib/ops.functions";
import { UNHEALTHY, type JobVerdict } from "@/lib/ops/jobs";

export const Route = createFileRoute("/_authenticated/admin/jobs")({
  head: () => ({
    meta: [
      { title: "Scheduled job health — CostMyAI internal" },
      {
        name: "description",
        content: "Last outcomes for every scheduled collector, sync, backup and payout run.",
      },
      { property: "og:title", content: "Scheduled job health" },
      { property: "og:description", content: "Internal cron health board." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JobsPage,
});

const VERDICT_STYLE: Record<JobVerdict, string> = {
  healthy: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  stale: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  failing: "bg-destructive/10 text-destructive ring-destructive/20",
  empty: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  "never-run": "bg-muted text-muted-foreground ring-border",
};

const OUTCOME_STYLE: Record<string, string> = {
  ok: "text-emerald-600",
  quiet: "text-muted-foreground",
  empty: "text-amber-600",
  failed: "text-destructive",
};

function JobsPage() {
  const read = useServerFn(listJobHealth);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["job-health"],
    queryFn: () => read({ data: undefined }),
    refetchInterval: 60_000,
    retry: false,
  });

  const unhealthy = (data?.jobs ?? []).filter((j) => UNHEALTHY.includes(j.verdict));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-[0.14em]">Internal</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Scheduled job health</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Every scheduled job, judged on its own cadence. A job that stops firing is reported
            before anything it once succeeded at.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : (
        <>
          <p className="mb-6 text-sm text-muted-foreground">
            {unhealthy.length === 0
              ? `All ${data?.jobs.length ?? 0} jobs healthy.`
              : `${unhealthy.length} of ${data?.jobs.length ?? 0} jobs need attention: ${unhealthy
                  .map((j) => j.label)
                  .join(", ")}.`}
          </p>

          <div className="divide-y divide-border border-y border-border">
            {(data?.jobs ?? []).map((job) => (
              <section key={job.job} className="py-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${VERDICT_STYLE[job.verdict]}`}
                  >
                    {job.verdict.replace("-", " ")}
                  </span>
                  <h2 className="text-base font-semibold tracking-tight">{job.label}</h2>
                  <code className="font-mono text-[11px] text-muted-foreground">
                    {job.job} · {job.schedule}
                  </code>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{job.what}</p>
                <p className="mt-1 text-sm">{job.reason}</p>

                <ul className="mt-3 space-y-1">
                  {job.recent.slice(0, 5).map((run) => (
                    <li key={run.startedAt} className="font-mono text-[11px] text-muted-foreground">
                      {run.startedAt.slice(0, 19).replace("T", " ")}{" "}
                      <span className={OUTCOME_STYLE[run.outcome ?? ""] ?? ""}>
                        {run.outcome ?? "legacy"}
                      </span>{" "}
                      rows={run.rowsWritten ?? "?"}
                      {run.error ? ` · ${run.error.slice(0, 90)}` : ""}
                    </li>
                  ))}
                  {job.recent.length === 0 && (
                    <li className="font-mono text-[11px] text-muted-foreground">no runs on record</li>
                  )}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
