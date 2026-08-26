import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal, CountUp } from "@/components/marketing/Reveal";
import { catalogQuery, type CatalogPayload, type CatalogRow } from "@/lib/catalog.functions";

const URL = "https://www.costmyai.com/reports/cheapest-api-calls";
const TITLE = "Cheapest API call 2026: prices compared by model and provider | CostMyAI";
const DESCRIPTION =
  "Cheapest LLM API prices compared for 2026: which provider sells the cheapest API call for each model, live rates in USD per million tokens, and the gap to the dearest host.";

export const Route = createFileRoute("/reports/cheapest-api-calls")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Cheapest API call, by model and provider" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery()),
  component: CheapestApiCallsPage,
});

/** Providers actually serving the model — the aggregate listing is not one. */
const serving = (row: CatalogRow) => row.hosts.filter((h) => !h.aggregate);


/**
 * Share of the dearest verified host's INPUT price that a switch to the cheapest
 * one removes. Rebased on the dearest host, so it is bounded 0-100%. Input only —
 * never blended with output.
 */
function spreadPct(row: CatalogRow): number | null {
  const hosts = serving(row);
  if (hosts.length < 2 || row.cheapestInput === null || row.cheapestInput <= 0) return null;
  const max = Math.max(...hosts.map((h) => h.input));
  if (max <= 0) return null;
  return ((max - row.cheapestInput) / max) * 100;
}

function CheapestApiCallsPage() {
  const { data } = useSuspenseQuery(catalogQuery());
  return (
    <MarketingShell>
      <Hero data={data} />
      <Table data={data} />
      <ByProvider data={data} />
      <Method />
      <Cta />
    </MarketingShell>
  );
}

function Hero({ data }: { data: CatalogPayload }) {
  const stats = useMemo(() => {
    const priced = data.rows.filter((r) => r.cheapestInput !== null);
    const cheapest = priced.length ? Math.min(...priced.map((r) => r.cheapestInput!)) : 0;
    const spreads = data.rows.map(spreadPct).filter((v): v is number => v !== null);
    return {
      priced: priced.length,
      providers: data.providers.length,
      cheapest,
      topSpread: spreads.length ? Math.max(...spreads) : 0,
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
          Report
        </Reveal>
        <Reveal
          delay={80}
          as="h1"
          className="mt-6 text-[2.7rem] font-semibold leading-[1] tracking-[-0.045em] sm:text-[4.4rem]"
        >
          The cheapest API call, <span className="text-gradient-brand">model by model.</span>
        </Reveal>
        <Reveal
          delay={150}
          as="p"
          className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          Every model we hold a verified price for, ranked by what a million input tokens costs at
          its cheapest serving provider — and how much more the dearest one charges for the exact
          same weights.
        </Reveal>

        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-4">
          <Stat value={stats.priced} label="Models with a verified price" delay={0} />
          <Stat value={stats.providers} label="Serving providers" delay={80} />
          <Stat
            value={stats.cheapest}
            format={(v) => `$${v.toFixed(2)}`}
            label="Cheapest rate / 1M in"
            delay={160}
          />
          <Stat
            value={Math.round(stats.topSpread)}
            format={(v) => `${Math.round(v)}%`}
            label="Widest same-model gap (input price)"
            delay={240}
            accent
          />
        </div>
      </div>
    </section>
  );
}

function Stat({
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
        className={`num block text-[2.2rem] font-semibold leading-none tracking-[-0.045em] sm:text-[3rem] ${
          accent ? "text-gradient-brand" : "text-foreground"
        }`}
      />
      <span className="mt-3 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </Reveal>
  );
}

function Table({ data }: { data: CatalogPayload }) {
  const rows = useMemo(
    () =>
      data.rows
        .filter((r) => r.cheapestInput !== null && serving(r).length > 0)
        .sort((a, b) => (a.cheapestInput ?? 0) - (b.cheapestInput ?? 0))
        .slice(0, 40),
    [data.rows],
  );

  return (
    <section className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <Reveal as="h2" className="text-[1.9rem] font-semibold tracking-[-0.035em] sm:text-[2.6rem]">
          Cheapest verified price per model
        </Reveal>
        <Reveal
          as="p"
          delay={60}
          className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground"
        >
          Prices in USD per million tokens, cheapest first. Each row shows the cheapest verified
          host for input price and what the same host charges for output tokens.
        </Reveal>

        <div className="mt-10">
          <div className="hidden grid-cols-[2fr_1.1fr_0.9fr_0.9fr_1fr] gap-6 border-b border-border pb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:grid">
            <span>Model</span>
            <span>Cheapest host (input price)</span>
            <span className="text-right">$ / 1M in</span>
            <span className="text-right">$ / 1M out</span>
            <span className="text-right">Blended · gap</span>
          </div>

          {rows.map((r, i) => {
            const hosts = serving(r);
            const best = hosts.reduce((a, h) => (a.input <= h.input ? a : h));
            const blended = cheapestBlended(r);
            const gap = spreadPct(r);
            return (
              <Reveal
                key={r.model_key}
                delay={Math.min(i, 8) * 40}
                className="grid grid-cols-2 gap-4 border-b border-border py-5 sm:grid-cols-[2fr_1.1fr_0.9fr_0.9fr_1fr] sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold tracking-[-0.02em]">
                    {r.display_name}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {r.vendor}
                  </p>
                </div>
                <p className="truncate text-sm text-muted-foreground sm:self-center">
                  {best.host_label}
                </p>
                <p className="num text-right text-sm font-semibold sm:self-center">
                  ${best.input.toFixed(2)}
                </p>
                <p className="num text-right text-sm sm:self-center">${best.output.toFixed(2)}</p>
                <p className="num text-right text-sm sm:self-center">
                  {blended === null ? "—" : `$${blended.toFixed(2)}`}
                  {gap !== null && gap >= 1 ? (
                    <span className="num ml-2 rounded-full bg-saving-soft px-2 py-0.5 text-xs font-semibold text-saving">
                      −{Math.round(gap)}% cheaper on input price
                    </span>
                  ) : null}
                </p>
              </Reveal>
            );
          })}
        </div>

        <Reveal as="p" className="mt-8 text-sm text-muted-foreground">
          Showing the 40 cheapest of {data.rows.length} tracked models.{" "}
          <Link to="/models" className="text-primary underline-offset-4 hover:underline">
            Browse the full catalog
          </Link>{" "}
          to filter by vendor, quality score or host spread.
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Provider-by-provider view: how often each serving host is the cheapest way
 * to buy a model it carries, and what it charges on median. This is the cut
 * buyers actually search for — "which provider is cheapest" — as opposed to
 * the per-model ranking above.
 */
function ByProvider({ data }: { data: CatalogPayload }) {
  const providers = useMemo(() => {
    const acc = new Map<string, { carried: number; wins: number; rates: number[] }>();
    for (const row of data.rows) {
      const hosts = serving(row);
      if (!hosts.length) continue;
      const best = hosts.reduce((a, h) => (a.input <= h.input ? a : h));
      for (const h of hosts) {
        const entry = acc.get(h.host_label) ?? { carried: 0, wins: 0, rates: [] };
        entry.carried += 1;
        entry.rates.push(h.input);
        if (hosts.length > 1 && h.host_label === best.host_label) entry.wins += 1;
        acc.set(h.host_label, entry);
      }
    }
    return [...acc.entries()]
      .map(([host, v]) => {
        const sorted = [...v.rates].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
        return { host, carried: v.carried, wins: v.wins, median };
      })
      .filter((p) => p.carried >= 2)
      .sort((a, b) => b.wins - a.wins || a.median - b.median)
      .slice(0, 20);
  }, [data.rows]);

  if (!providers.length) return null;

  return (
    <section className="px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal as="h2" className="text-[1.9rem] font-semibold tracking-[-0.035em] sm:text-[2.6rem]">
          Which provider is cheapest, host by host
        </Reveal>
        <Reveal
          as="p"
          delay={60}
          className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground"
        >
          For every model sold by more than one provider, exactly one host has the lowest input
          rate. This counts those wins. A provider that carries many models but wins few is
          convenient rather than cheap.
        </Reveal>

        <div className="mt-10">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-6 border-b border-border pb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:grid">
            <span>Provider</span>
            <span className="text-right">Models carried</span>
            <span className="text-right">Cheapest on</span>
            <span className="text-right">Median $ / 1M in</span>
          </div>
          {providers.map((p, i) => (
            <Reveal
              key={p.host}
              delay={Math.min(i, 8) * 40}
              className="grid grid-cols-2 gap-4 border-b border-border py-4 sm:grid-cols-[2fr_1fr_1fr_1fr] sm:gap-6"
            >
              <p className="truncate text-base font-semibold tracking-[-0.02em]">{p.host}</p>
              <p className="num text-right text-sm text-muted-foreground sm:self-center">
                {p.carried}
              </p>
              <p className="num text-right text-sm font-semibold sm:self-center">
                {p.wins}
                {p.wins > 0 ? (
                  <span className="num ml-2 rounded-full bg-saving-soft px-2 py-0.5 text-xs font-semibold text-saving">
                    {Math.round((p.wins / p.carried) * 100)}%
                  </span>
                ) : null}
              </p>
              <p className="num text-right text-sm sm:self-center">${p.median.toFixed(2)}</p>
            </Reveal>
          ))}
        </div>

        <Reveal as="p" className="mt-8 text-sm text-muted-foreground">
          Want this priced against your own volumes?{" "}
          <Link
            to="/tools/llm-price-comparison"
            className="text-primary underline-offset-4 hover:underline"
          >
            Use the LLM pricing comparison calculator
          </Link>
          .
        </Reveal>
      </div>
    </section>
  );
}

function Method() {
  return (
    <section className="px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <Reveal as="h2" className="text-[1.8rem] font-semibold tracking-[-0.035em] sm:text-[2.4rem]">
          How to read a cheap API call
        </Reveal>
        <div className="mt-8 space-y-8 text-base leading-relaxed text-muted-foreground">
          <p>
            <span className="text-foreground">A price is per token, not per call.</span> An API call
            costs input tokens plus output tokens. Two providers can advertise the same headline
            rate and still bill differently once the output side is counted, which is why the
            blended column exists above.
          </p>
          <p>
            <span className="text-foreground">The same model has more than one price.</span> Open
            weight models are sold by several serving providers at once. Where that gap is wide, the
            cheapest call is the same model on a different host, not a weaker model.
          </p>
          <p>
            <span className="text-foreground">Cheapest is not automatically correct.</span> A model
            that is cheap per token but needs two attempts, or emits three times the output, is not
            cheap per finished task. We publish the benchmark scores next to every price on the{" "}
            <Link to="/models" className="text-primary underline-offset-4 hover:underline">
              model catalog
            </Link>{" "}
            so a quality claim has something to clear.
          </p>
          <p>
            Prices come from the same catalog our engine prices against, and aggregator listings are
            excluded from provider-to-provider gaps. The full sourcing rules are in the{" "}
            <Link
              to="/legal/methodology"
              className="text-primary underline-offset-4 hover:underline"
            >
              methodology
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="border-t border-border px-5 py-24 sm:px-8 sm:py-32">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3.2rem]">
          Price it <span className="text-gradient-brand">against your own traffic.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Compare reads this same catalog and shows what your current models would cost on the
          cheapest verified host. Free, forever.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/auth" className="btn-gradient px-6 py-3 text-[15px]">
            Start Compare, free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/models" className="btn-quiet px-6 py-3 text-[15px]">
            See every model
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
