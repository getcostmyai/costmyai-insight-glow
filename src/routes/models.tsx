import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Search } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal, CountUp } from "@/components/marketing/Reveal";
import { catalogQuery, type CatalogPayload, type CatalogRow } from "@/lib/catalog.functions";

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

type SortKey = "price" | "quality" | "spread" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Cheapest first" },
  { key: "quality", label: "Highest quality" },
  { key: "spread", label: "Biggest host spread" },
  { key: "name", label: "A–Z" },
];

/** Percent gap between the dearest and cheapest verified host for one model. */
function hostSpread(row: CatalogRow): number | null {
  if (row.hosts.length < 2 || row.cheapestInput === null || row.cheapestInput <= 0) return null;
  const max = Math.max(...row.hosts.map((h) => h.input));
  return ((max - row.cheapestInput) / row.cheapestInput) * 100;
}

function ModelsPage() {
  const { data } = useSuspenseQuery(catalogQuery());

  return (
    <MarketingShell>
      <Hero data={data} />
      <Catalog data={data} />
      <ClosingCta />
    </MarketingShell>
  );
}

/* ---------------------------------- hero ---------------------------------- */

function Hero({ data }: { data: CatalogPayload }) {
  const stats = useMemo(() => {
    const spreads = data.rows.map(hostSpread).filter((v): v is number => v !== null);
    const topSpread = spreads.length ? Math.max(...spreads) : 0;
    return {
      models: data.rows.length,
      // Model makers (who trained the weights) — not the same as serving providers.
      vendors: data.vendors.length,
      providers: data.providers.length,
      topSpread,
    };
  }, [data]);


  return (
    <section className="relative overflow-hidden wash-hero">
      <div className="absolute inset-0 texture-dots opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-24 text-center sm:px-8 sm:pt-36">
        <Reveal
          as="p"
          className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          Model catalog
        </Reveal>

        <Reveal
          delay={80}
          as="h1"
          className="mt-6 text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[4.6rem]"
        >
          Same model. <span className="text-gradient-brand">Different price.</span>
        </Reveal>

        <Reveal
          delay={150}
          as="p"
          className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          The catalog the engine prices against — every verified host rate and the independent
          benchmark scores a quality claim has to clear.
        </Reveal>

        {data.live ? (
          <Reveal delay={200} className="mt-8 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-saving animate-pulse-dot" />
              <span className="font-semibold text-foreground">Live</span> catalog
            </span>
          </Reveal>
        ) : null}

        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-4">
          <HeroStat delay={0} value={stats.models} label="Models priced" />
          <HeroStat delay={80} value={stats.vendors} label="Model makers" />
          <HeroStat delay={160} value={stats.providers} label="Serving providers" />

          <HeroStat
            delay={240}
            value={Math.round(stats.topSpread)}
            format={(v) => `${Math.round(v)}%`}
            label="Widest host spread"
            accent
          />
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  value,
  label,
  format,
  delay,
  accent,
}: {
  value: number;
  label: string;
  format?: (v: number) => string;
  delay: number;
  accent?: boolean;
}) {
  return (
    <Reveal delay={delay} className="text-center">
      <CountUp
        value={value}
        format={format ?? ((v) => Math.round(v).toLocaleString())}
        className={`num block text-[2.4rem] font-semibold leading-none tracking-[-0.045em] sm:text-[3.1rem] ${
          accent ? "text-gradient-brand" : "text-foreground"
        }`}
      />
      <span className="mt-3 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </Reveal>
  );
}

/* -------------------------------- catalog --------------------------------- */

function Catalog({ data }: { data: CatalogPayload }) {
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("price");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = data.rows.filter(
      (r) =>
        (!vendor || r.vendor === vendor) &&
        (!needle ||
          r.display_name.toLowerCase().includes(needle) ||
          r.model_key.toLowerCase().includes(needle) ||
          r.hosts.some((h) => h.host_label.toLowerCase().includes(needle))),
    );

    const nullLast = (v: number | null) => (v === null ? Number.POSITIVE_INFINITY : v);
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.display_name.localeCompare(b.display_name);
      if (sort === "price") return nullLast(a.cheapestInput) - nullLast(b.cheapestInput);
      if (sort === "quality") return (b.intelligence ?? -1) - (a.intelligence ?? -1);
      return (hostSpread(b) ?? -1) - (hostSpread(a) ?? -1);
    });
  }, [data.rows, q, vendor, sort]);

  return (
    <section className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        {/* controls — borderless rail */}
        <div className="sticky top-16 z-20 -mx-5 bg-card/85 px-5 py-4 backdrop-blur-xl sm:-mx-8 sm:px-8">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a model, id or provider"
              aria-label="Search the catalog"
              className="w-full border-0 border-b border-border bg-transparent py-3 pl-8 text-lg tracking-[-0.01em] outline-none placeholder:text-muted-foreground/70 focus:border-primary"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={vendor === null} onClick={() => setVendor(null)}>
                All makers
              </FilterChip>

              {data.vendors.map((v) => (
                <FilterChip key={v} active={vendor === v} onClick={() => setVendor(v)}>
                  {v}
                </FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SORTS.map((s) => (
                <FilterChip key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
                  {s.label}
                </FilterChip>
              ))}
            </div>
          </div>
        </div>

        <p className="num mt-8 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {rows.length} of {data.rows.length} models
        </p>

        <div className="mt-4">
          {rows.map((r, i) => (
            <ModelRow key={r.model_key} row={r} index={i} />
          ))}
          <div className="border-t border-border" />
          {rows.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              Nothing in the catalog matches that. We only list models we hold a verified price for.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- model row -------------------------------- */

/** "text+image->text" -> "Multimodal" / "Text". Straight read of the catalog field. */
function modalityLabel(modality: string): string {
  const inputs = (modality.split("->")[0] ?? "").split("+").filter(Boolean);
  return inputs.length > 1 ? "Multimodal" : "Text";
}

function ModelRow({ row, index }: { row: CatalogRow; index: number }) {
  const [open, setOpen] = useState(false);
  const spread = hostSpread(row);
  const cheapest = row.hosts.length
    ? row.hosts.reduce((best, h) => (h.input < best.input ? h : best))
    : null;

  return (
    <Reveal delay={Math.min(index, 8) * 45} className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group grid w-full grid-cols-[1fr_auto] items-center gap-6 py-7 text-left transition-colors hover:bg-secondary/40 sm:grid-cols-[1.6fr_0.8fr_1fr_auto] sm:gap-8"
      >
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-[-0.02em] sm:text-xl">{row.display_name}</p>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{row.model_key}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Tag>{row.vendor}</Tag>
            <Tag>{modalityLabel(row.modality)}</Tag>
            <Tag>{row.tier}</Tag>
            {row.is_reasoning ? <Tag>reasoning</Tag> : null}
            {row.context_window ? (
              <Tag>
                <span className="num">{(row.context_window / 1000).toFixed(0)}k</span> ctx
              </Tag>
            ) : null}
          </div>
        </div>

        <div className="hidden sm:block">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Quality index
          </p>
          <p className="num mt-1 text-2xl font-semibold tracking-[-0.03em] text-primary">
            {row.intelligence === null ? (
              <span className="text-base text-muted-foreground/50">—</span>
            ) : (
              row.intelligence.toFixed(1)
            )}
          </p>
        </div>

        <div className="text-right sm:text-left">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Cheapest host
          </p>
          {row.cheapestInput === null ? (
            <p className="mt-1 text-sm text-muted-foreground">No verified price</p>
          ) : (
            <>
              <p className="num mt-1 text-2xl font-semibold tracking-[-0.03em]">
                ${row.cheapestInput.toFixed(2)}
                <span className="text-xs font-medium text-muted-foreground"> /1M in</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {cheapest?.host_label}
                {spread !== null && spread >= 1 ? (
                  <span className="num ml-2 rounded-full bg-saving-soft px-2 py-0.5 font-semibold text-saving">
                    −{Math.round(spread)}% vs dearest
                  </span>
                ) : null}
              </p>
            </>
          )}
        </div>

        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${
            open ? "rotate-180 text-primary" : ""
          }`}
        />
      </button>

      <div
        className={`grid transition-all duration-500 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="grid gap-10 pb-10 sm:grid-cols-2">
            <div>
              <p className="eyebrow">Benchmarks</p>
              <dl className="mt-4">
                <BenchRow label="Intelligence Index" value={row.intelligence?.toFixed(1) ?? null} />
                <BenchRow label="IFBench" value={row.ifbench?.toFixed(1) ?? null} />
                <BenchRow label="GPQA" value={row.gpqa?.toFixed(1) ?? null} />
                <BenchRow label="Coding (SciCode)" value={row.coding?.toFixed(1) ?? null} />
                <BenchRow
                  label="Time to first token"
                  value={row.ttftMs === null ? null : `${(row.ttftMs / 1000).toFixed(2)}s`}
                />
                <BenchRow
                  label="Output speed"
                  value={row.outputTps === null ? null : `${row.outputTps.toFixed(0)} t/s`}
                />
              </dl>
            </div>

            <div>
              <p className="eyebrow">Hosts · price per 1M tokens</p>
              {row.hosts.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No verified price on record.</p>
              ) : (
                <ul className="mt-4">
                  {[...row.hosts]
                    .sort((a, b) => a.input - b.input)
                    .map((h, i) => {
                      const max = Math.max(...row.hosts.map((x) => x.input));
                      const pct = max > 0 ? Math.max(4, (h.input / max) * 100) : 4;
                      return (
                        <li key={h.host_label} className="border-t border-border py-3">
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="truncate text-sm font-medium">{h.host_label}</span>
                            <span className="num shrink-0 text-sm">
                              ${h.input.toFixed(2)}
                              <span className="text-muted-foreground"> / ${h.output.toFixed(2)}</span>
                            </span>
                          </div>
                          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full rounded-full ${i === 0 ? "bg-saving" : "fill-gradient-brand"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  <li className="border-t border-border" />
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function BenchRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`num text-sm font-semibold ${value === null ? "text-muted-foreground/50" : ""}`}
      >
        {value ?? "—"}
      </dd>
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
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary-soft text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------- closing cta ------------------------------- */

function ClosingCta() {
  return (
    <section className="px-5 py-28 sm:px-8 sm:py-36">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3.4rem]">
          Now price it <span className="text-gradient-brand">against your own traffic.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Compare reads this same catalog and tells you what your current models would cost on the
          cheapest verified host. Free, forever.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/auth" className="btn-gradient px-6 py-3 text-[15px]">
            Start Compare, free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/pricing" className="btn-quiet px-6 py-3 text-[15px]">
            See the levels
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
