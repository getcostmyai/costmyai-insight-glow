import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { catalogQuery, type CatalogRow } from "@/lib/catalog.functions";

export const Route = createFileRoute("/models")({
  head: () => ({
    meta: [
      { title: "Model catalog — live prices and benchmark scores | CostMyAI" },
      {
        name: "description",
        content:
          "Browse every model CostMyAI tracks: live per-provider prices, cheapest host, benchmark scores by task class. The buy-side view, read from the same catalog the engine prices against.",
      },
      { property: "og:title", content: "Model catalog — live prices and benchmark scores" },
      {
        property: "og:description",
        content:
          "Every tracked model with its live per-provider pricing and independent benchmark scores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery()),
  component: ModelsPage,
});

function ModelsPage() {
  const { data } = useSuspenseQuery(catalogQuery());
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.rows.filter(
      (r) =>
        (!vendor || r.vendor === vendor) &&
        (!needle ||
          r.display_name.toLowerCase().includes(needle) ||
          r.model_key.toLowerCase().includes(needle) ||
          r.hosts.some((h) => h.host_label.toLowerCase().includes(needle))),
    );
  }, [data.rows, q, vendor]);

  return (
    <MarketingShell>
      <section className="wash-hero">
        <div className="mx-auto max-w-6xl px-5 pb-10 pt-20 sm:px-8">
          {data.live ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-saving animate-pulse-dot" />
              <span className="font-semibold text-foreground">Live</span> catalog
            </span>
          ) : null}
          <h1 className="mt-6 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
            Every model we price, <span className="text-gradient-brand">side by side.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            The same catalog the engine prices against: per-provider rates, the cheapest host, and
            the independent benchmark scores a quality claim would have to clear.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <label className="relative flex-1 min-w-[16rem]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search model, id or provider"
                aria-label="Search the catalog"
                className="w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary/50"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <FilterChip active={vendor === null} onClick={() => setVendor(null)}>
              All vendors
            </FilterChip>
            {data.vendors.map((v) => (
              <FilterChip key={v} active={vendor === v} onClick={() => setVendor(v)}>
                {v}
              </FilterChip>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <p className="num mb-4 text-sm text-muted-foreground">
          {rows.length} of {data.rows.length} models
        </p>
        <div className="space-y-3">
          {rows.map((r) => (
            <ModelCard key={r.model_key} row={r} />
          ))}
          {rows.length === 0 ? (
            <div className="card-surface p-10 text-center text-sm text-muted-foreground">
              Nothing in the catalog matches that. We only list models we hold a verified price for.
            </div>
          ) : null}
        </div>

        <div className="mt-12 text-center">
          <Link to="/auth" className="btn-gradient px-6 py-3 text-[15px]">
            Price this catalog against your own traffic — free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

function ModelCard({ row }: { row: CatalogRow }) {
  return (
    <div className="card-surface grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto]">
      <div className="min-w-0">
        <p className="text-lg font-semibold tracking-tight">{row.display_name}</p>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{row.model_key}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Tag>{row.vendor}</Tag>
          <Tag>{row.tier}</Tag>
          {row.is_reasoning ? <Tag>reasoning</Tag> : null}
          {row.context_window ? (
            <Tag>
              <span className="num">{(row.context_window / 1000).toFixed(0)}k</span> ctx
            </Tag>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <p className="eyebrow">Hosts</p>
        <div className="mt-2 space-y-1.5">
          {row.hosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verified price on record.</p>
          ) : (
            row.hosts.map((h) => (
              <div
                key={h.host_label}
                className="flex items-center justify-between gap-4 rounded-lg bg-secondary px-3 py-1.5"
              >
                <span className="truncate text-sm">{h.host_label}</span>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  ${h.input.toFixed(2)} / ${h.output.toFixed(2)} per Mtok
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="lg:text-right">
        <p className="eyebrow">Benchmarks</p>
        {row.scores.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Unscored</p>
        ) : (
          <div className="mt-2 space-y-1">
            {row.scores.map((s) => (
              <p key={`${s.task_class}:${s.suite}`} className="text-sm">
                <span className="text-muted-foreground">
                  {s.task_class} · {s.suite}{" "}
                </span>
                <span className="num font-semibold">{s.score.toFixed(1)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary/45 bg-primary-soft text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
