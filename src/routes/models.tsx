import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Search } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { Reveal, CountUp } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { catalogQuery, type CatalogPayload, type CatalogRow } from "@/lib/catalog.functions";
import { marketingStatsQuery } from "@/lib/marketing.functions";
import { trackModelsEvent } from "@/lib/models-telemetry.functions";
import { shouldFire } from "@/lib/telemetry/fire-once";

export const Route = createFileRoute("/models")({
  head: () => ({
    meta: [
      { title: "Model catalog — same model, different price | CostMyAI" },
      {
        name: "description",
        content:
          "Every model we track, with each verified host rate side by side and the independent benchmark scores a quality claim has to clear. The same catalog the engine prices against.",
      },
      { property: "og:title", content: "Model catalog — same model, different price" },
      {
        property: "og:description",
        content:
          "Live per-host pricing and independent benchmark scores for every tracked model. Read the gap between hosts before you pay for it.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.costmyai.com/models" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/models" }],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQuery()),
      context.queryClient.ensureQueryData(marketingStatsQuery()),
    ]);
  },
  component: ModelsPage,
});

type SortKey = "price" | "quality" | "spread" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Cheapest first" },
  { key: "quality", label: "Highest quality" },
  { key: "spread", label: "Biggest host spread (input price)" },
  { key: "name", label: "A–Z" },
];

/** Providers serving this model — the aggregate listing is not one of them. */
const servingHosts = (row: CatalogRow) => row.hosts.filter((h) => !h.aggregate);

/**
 * Percent of the dearest verified provider's INPUT price that a switch to the
 * cheapest one removes. Rebased on the dearest host, so it is bounded 0-100% by
 * construction. Provider-to-provider only: quoting the aggregate listing as one
 * end of the gap would price a switch nobody can make (Dispatch 117).
 */
function hostSpread(row: CatalogRow): number | null {
  const serving = servingHosts(row);
  if (serving.length < 2 || row.cheapestInput === null || row.cheapestInput <= 0) return null;
  const max = Math.max(...serving.map((h) => h.input));
  if (max <= 0) return null;
  return ((max - row.cheapestInput) / max) * 100;
}

/** Same measurement on OUTPUT price. Single dimension, never blended with input. */
function outputHostSpread(row: CatalogRow): number | null {
  const serving = servingHosts(row);
  if (serving.length < 2 || row.cheapestOutput === null || row.cheapestOutput <= 0) return null;
  const max = Math.max(...serving.map((h) => h.output));
  if (max <= 0) return null;
  return ((max - row.cheapestOutput) / max) * 100;
}

function ModelsPage() {
  const { data } = useSuspenseQuery(catalogQuery());
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  const track = useServerFn(trackModelsEvent);

  // Module-scope guard, not a ref: hydration and the Suspense boundary both
  // remount this component for one real visit (see fire-once.ts).
  useEffect(() => {
    if (!shouldFire("models_page_viewed")) return;
    void track({ data: { event: "models_page_viewed" } }).catch(() => {});
  }, [track]);

  return (
    <MarketingShell>
      <Hero data={data} moves={stats.priceChangesTracked} />
      <HowToRead moves={stats.priceChangesTracked} />
      <Catalog data={data} />
      <ClosingCta />
    </MarketingShell>
  );
}

/* ---------------------------------- hero ---------------------------------- */

function Hero({ data, moves }: { data: CatalogPayload; moves: number }) {
  const stats = useMemo(() => {
    const spreads = data.rows.map(hostSpread).filter((v): v is number => v !== null);
    const topSpread = spreads.length ? Math.max(...spreads) : 0;
    const outputSpreads = data.rows.map(outputHostSpread).filter((v): v is number => v !== null);
    const topOutputSpread = outputSpreads.length ? Math.max(...outputSpreads) : 0;
    return {
      models: data.rows.length,
      // Models sold by more than one verified host — every one of these is a live price race.
      contested: data.rows.filter((r) => servingHosts(r).length > 1).length,
      providers: data.providers.length,
      topSpread,
      topOutputSpread,
    };
  }, [data]);

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
        aria-hidden
      />
      <PriceDriftRibbon
        moves={moves}
        orientation="diagonal"
        className="absolute inset-x-0 bottom-0 h-[34%] opacity-[0.10] [mask-image:linear-gradient(180deg,transparent,#000_80%)]"
      />
      <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />

      <div className="relative mx-auto max-w-5xl px-5 pb-20 pt-24 text-center sm:px-8 sm:pb-24 sm:pt-36">
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
          Same model. <span className="text-gradient-brand-wide">Different price.</span>
        </Reveal>

        <Reveal
          delay={150}
          as="p"
          className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          The catalog the engine prices against — every verified host rate, side by side, and the
          independent benchmark scores a quality claim has to clear.
        </Reveal>

        {data.live ? (
          <Reveal delay={200} className="mt-8 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-saving animate-pulse-dot" />
              <span className="font-semibold text-foreground">Live</span> catalog
            </span>
          </Reveal>
        ) : null}

        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-5">
          <HeroStat delay={0} value={stats.models} label="Models priced" />
          <HeroStat delay={80} value={stats.contested} label="Models with 2+ hosts" />
          <HeroStat delay={160} value={stats.providers} label="Serving providers" />
          <HeroStat
            delay={240}
            value={Math.round(stats.topSpread)}
            format={(v) => `${Math.round(v)}%`}
            label="Widest host spread (input price)"
            accent
          />
          <HeroStat
            delay={320}
            value={Math.round(stats.topOutputSpread)}
            format={(v) => `${Math.round(v)}%`}
            label="Widest host spread (output price)"
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
          accent ? "text-gradient-brand-wide" : "text-foreground"
        }`}
      />
      <span className="mt-3 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </Reveal>
  );
}

/* ------------------------------- how to read ------------------------------- */

const READ_ITEMS = [
  {
    title: "A serving provider sells the model",
    body: "Anthropic, Bedrock, Vertex, Fireworks and the rest each set their own rate for the very same weights. Aggregator listings are marked and never counted as one end of a gap, because that is a switch nobody can actually make.",
  },
  {
    title: "The host spread is the arbitrage",
    body: "When one model is sold by several providers at different rates, the gap between the cheapest and the dearest is money already on the table. It is the number the engine acts on, and the only one we headline.",
  },
  {
    title: "The quality index is the bar",
    body: "Independent benchmark scores — Intelligence Index, IFBench, GPQA, SciCode, latency and throughput. A cheaper host only wins if the model still clears the bar the workload needs.",
  },
];

function HowToRead({ moves }: { moves: number }) {
  return (
    <section className="relative overflow-hidden border-b border-border wash-brand">
      <PriceDriftRibbon
        moves={moves}
        orientation="horizontal"
        className="absolute inset-x-0 top-0 h-[26%] opacity-[0.12] [mask-image:linear-gradient(0deg,transparent,#000)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal
            as="p"
            className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            How to read this
          </Reveal>
          <Reveal
            delay={80}
            as="h2"
            className="mt-5 text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3.2rem]"
          >
            Three numbers, one decision.
          </Reveal>
        </div>

        <div className="mx-auto mt-14 max-w-4xl">
          {READ_ITEMS.map((item, i) => (
            <Reveal
              key={item.title}
              delay={i * 90}
              className="grid gap-3 border-t border-border py-9 sm:grid-cols-[1fr_1.6fr] sm:gap-10 sm:py-11"
            >
              <div className="flex items-baseline gap-3">
                <span className="num text-[11px] tracking-[0.18em] text-primary">{`0${i + 1}`}</span>
                <h3 className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
                  {item.title}
                </h3>
              </div>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </Reveal>
          ))}
          <div className="border-t border-border" />
        </div>

        <Reveal
          delay={120}
          as="p"
          className="mx-auto mt-12 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground"
        >
          See the{" "}
          <Link
            to="/reports/cheapest-api-calls"
            className="text-primary underline-offset-4 hover:underline"
          >
            cheapest API call report
          </Link>{" "}
          for the ranked view, or the{" "}
          <Link
            to="/tools/llm-price-comparison"
            className="text-primary underline-offset-4 hover:underline"
          >
            pricing comparison calculator
          </Link>{" "}
          to price it against your own volumes.
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------- catalog --------------------------------- */

function Catalog({ data }: { data: CatalogPayload }) {
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("price");

  const track = useServerFn(trackModelsEvent);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const onVendor = (next: string | null) => {
    setVendor(next);
    void track({ data: { event: "models_filtered", vendor: next } }).catch(() => {});
  };

  const onSort = (next: SortKey) => {
    setSort(next);
    void track({ data: { event: "models_sorted", sortKey: next } }).catch(() => {});
  };

  /**
   * Filter-as-you-type, one event per pause — same 450ms settle already proven
   * for `estimator_split_changed`, so a typed word is one observation rather
   * than one per keystroke.
   */
  const onSearch = (next: string) => {
    setQ(next);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (!next.trim()) return;
      void track({ data: { event: "models_searched", query: next } }).catch(() => {});
    }, 450);
  };

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
    <section id="catalog" className="scroll-mt-24">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        {/* controls — borderless rail */}
        <div className="sticky top-16 z-20 -mx-5 bg-background/85 px-5 py-4 backdrop-blur-xl sm:-mx-8 sm:px-8">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search a model, id or provider"
              aria-label="Search the catalog"
              className="w-full border-0 border-b border-border bg-transparent py-3 pl-8 text-lg tracking-[-0.01em] outline-none placeholder:text-muted-foreground/70 focus:border-primary"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={vendor === null} onClick={() => onVendor(null)}>
                All
              </FilterChip>

              {data.vendors.map((v) => (
                <FilterChip key={v} active={vendor === v} onClick={() => onVendor(v)}>
                  {v}
                </FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SORTS.map((s) => (
                <FilterChip key={s.key} active={sort === s.key} onClick={() => onSort(s.key)}>
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
  const serving = servingHosts(row);
  const cheapest = serving.length
    ? serving.reduce((best, h) => (h.input < best.input ? h : best))
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
          <p className="text-lg font-semibold tracking-[-0.02em] transition-colors group-hover:text-primary sm:text-xl">
            {row.display_name}
          </p>
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
            Cheapest host (input price)
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
        className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
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
                            <span className="truncate text-sm font-medium">
                              {h.host_label}
                              {h.aggregate ? (
                                <span className="ml-2 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                                  aggregator
                                </span>
                              ) : null}
                            </span>

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
    <section className="relative overflow-hidden border-t border-border px-5 py-24 sm:px-8 sm:py-32">
      <div
        className="pointer-events-none absolute inset-0 mesh-brand mesh-drift opacity-70"
        aria-hidden
      />
      <Reveal className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[3.6rem]">
          Now price it <span className="text-gradient-brand-wide">against your own traffic.</span>
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
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-quiet px-6 py-3 text-[15px]"
          >
            Book a Demo
          </a>
        </div>
      </Reveal>
    </section>
  );
}
