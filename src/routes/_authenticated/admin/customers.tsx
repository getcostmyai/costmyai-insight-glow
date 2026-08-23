import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users } from "lucide-react";

import { getCustomerDirectory } from "@/lib/admin/customers.functions";
import type { CustomerRow } from "@/lib/admin/customers";
import { eventLabel } from "@/lib/admin/overview";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customer directory — CostMyAI internal" },
      {
        name: "description",
        content:
          "Every real workspace, its resolved plan, measured spend and the funnel activity it came from.",
      },
      { property: "og:title", content: "Customer directory" },
      { property: "og:description", content: "Internal read-only view of every real workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomerDirectoryPage,
});

const usd = (n: number) =>
  n === 0
    ? "$0.00"
    : n < 0.01
      ? `$${n.toFixed(4)}`
      : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

function CustomerDirectoryPage() {
  const read = useServerFn(getCustomerDirectory);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => read(),
    retry: false,
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Customer directory</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every real workspace, read-only. The plan shown is the level the workspace may actually use,
        resolved the same way every gate resolves it — not the raw column. Spend is measured from
        daily usage rollups, never estimated. There is no action here: no admin write-path to a
        customer account exists.
      </p>

      {isLoading ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading
        </div>
      ) : error ? (
        <p className="mt-10 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load the directory."}
        </p>
      ) : data ? (
        <>
          <p className="mt-6 text-xs text-muted-foreground">
            {data.rows.length} workspace{data.rows.length === 1 ? "" : "s"} shown · plan resolved
            against the <span className="font-mono">{data.environment}</span> payment environment ·
            excluded: {data.excluded.testHarness} test harness, {data.excluded.noContact} with no
            contact (creator deleted), {data.excluded.synthetic} demo
          </p>

          {data.rows.length === 0 ? (
            <p className="mt-10 text-sm text-muted-foreground">
              No workspace survives filtering yet.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {data.rows.map((row) => (
                <CustomerCard key={row.orgId} row={row} />
              ))}
            </div>
          )}

          <p className="mt-10 font-mono text-[11px] text-muted-foreground">
            read at {data.readAt.slice(0, 19).replace("T", " ")} UTC
          </p>
          <Link to="/admin" className="mt-6 inline-block text-xs text-primary hover:underline">
            ← Back to command center
          </Link>
        </>
      ) : null}
    </main>
  );
}

function CustomerCard({ row }: { row: CustomerRow }) {
  const planDisagrees = row.effectivePlan !== row.recordedPlan;
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{row.name}</h2>
            {row.internal ? (
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                Internal / Founder
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {row.email}
            {row.fullName ? ` · ${row.fullName}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan</p>
          <p className="text-lg font-semibold capitalize tabular-nums">{row.effectivePlan}</p>
        </div>
      </div>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-4">
        <Field label="Signed up" value={day(row.createdAt)} />
        <Field label="Spend 30d" value={usd(row.spend30dUsd)} />
        <Field label="Spend lifetime" value={usd(row.spendLifetimeUsd)} />
        <Field label="Seats" value={String(row.seats)} />
      </dl>

      {planDisagrees ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          The workspace record says <span className="font-mono">{row.recordedPlan}</span>, but no
          current subscription backs it in this environment, so the usable level is{" "}
          <span className="font-mono">{row.effectivePlan}</span>.
          {row.otherEnvSubscription ? (
            <>
              {" "}
              A <span className="font-mono">{row.otherEnvSubscription.environment}</span>{" "}
              subscription exists ({row.otherEnvSubscription.plan},{" "}
              {row.otherEnvSubscription.status}) — test mode, and it grants nothing here.
            </>
          ) : null}
        </p>
      ) : row.subscription ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Subscription {row.subscription.status}
          {row.subscription.currentPeriodEnd
            ? ` until ${day(row.subscription.currentPeriodEnd)}`
            : ""}
          .
        </p>
      ) : null}

      <div className="mt-4 border-t border-border pt-4 text-xs">
        <p className="font-medium">Where they came from</p>
        {row.partner ? (
          <p className="mt-1 text-muted-foreground">
            Referred by {row.partner.name} ({row.partner.code})
            {row.referredAt ? ` on ${day(row.referredAt)}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">Direct — no partner referral</p>
        )}
        {row.firstVisitorId === null ? (
          <p className="mt-2 text-muted-foreground">
            <span className="font-medium text-foreground">No funnel data.</span> This signup carried
            no visitor id, so there is nothing to link back to.
          </p>
        ) : row.funnel.length === 0 ? (
          <p className="mt-2 text-muted-foreground">
            <span className="font-medium text-foreground">No funnel data.</span> A visitor id is
            recorded, but no events survive against it.
          </p>
        ) : (
          <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            {row.funnel.map((t, i) => (
              <li key={`${t.eventType}-${t.at}`}>
                {i > 0 ? <span className="mr-2">→</span> : null}
                <span className="text-foreground">{eventLabel(t.eventType)}</span>{" "}
                <span className="font-mono text-[10px]">{t.at.slice(0, 10)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
