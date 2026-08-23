import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { marketingStatsQuery } from "@/lib/marketing.functions";
import { catalogQuery, type CatalogPayload, type CatalogRow } from "@/lib/catalog.functions";

const URL = "https://www.costmyai.com/tools/llm-price-comparison";
const TITLE = "LLM pricing comparison calculator | CostMyAI";
const DESCRIPTION =
  "Compare LLM API pricing across providers with your own token volumes. Enter monthly input and output tokens and see the real monthly cost of every model at its cheapest verified host.";

export const Route = createFileRoute("/tools/llm-price-comparison")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "LLM pricing comparison calculator" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(catalogQuery()),
      context.queryClient.ensureQueryData(marketingStatsQuery()),
    ]),
  component: LlmPriceComparisonPage,
});

const serving = (row: CatalogRow) => row.hosts.filter((h) => !h.aggregate);

/** Monthly cost in USD for the given token volumes at a specific host rate. */
function monthlyCost(inputM: number, outputM: number, rateIn: number, rateOut: number) {
  return inputM * rateIn + outputM * rateOut;
}

const money = (v: number) =>
  v >= 1000 ? `$${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`;

function LlmPriceComparisonPage() {
  const { data } = useSuspenseQuery(catalogQuery());
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  return (
    <MarketingShell>
      <Calculator data={data} moves={stats.priceChangesTracked} />
      <Notes />
      <Cta moves={stats.priceChangesTracked} />
    </MarketingShell>
  );
}

function Calculator({ data, moves }: { data: CatalogPayload; moves: number }) {

  // Volumes are expressed in millions of tokens per month — the unit every
  // published price list uses, so nobody has to convert anything.
  const [inputM, setInputM] = useState(50);
  const [outputM, setOutputM] = useState(10);
  const [vendor, setVendor] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    return data.rows
      .filter((r) => serving(r).length > 0)
      .filter((r) => vendor === "all" || r.vendor === vendor)
      .map((r) => {
        const hosts = serving(r)
          .map((h) => ({ ...h, cost: monthlyCost(inputM, outputM, h.input, h.output) }))
          .sort((a, b) => a.cost - b.cost);
        const best = hosts[0]!;
        const worst = hosts[hosts.length - 1]!;
        return {
          row: r,
          hosts,
          best,
          overpay: worst.cost - best.cost,
        };
      })
      .sort((a, b) => a.best.cost - b.best.cost);
  }, [data.rows, vendor, inputM, outputM]);

  const cheapest = rows[0];
  const dearest = rows[rows.length - 1];

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-[90%] mesh-brand mesh-drift"
        aria-hidden
      />
      <PriceDriftRibbon
        moves={moves}
        orientation="diagonal"
        className="absolute inset-x-0 top-0 h-[45%] opacity-[0.12] [mask-image:linear-gradient(180deg,#000,transparent)]"
      />
      <div className="absolute inset-0 texture-dots opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-24 sm:px-8 sm:pt-36">
        <Reveal
          as="p"
          className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          Calculator
        </Reveal>
        <Reveal
          delay={80}
          as="h1"
          className="mt-6 max-w-4xl text-[2.7rem] font-semibold leading-[1] tracking-[-0.045em] sm:text-[4.2rem]"
        >
          LLM pricing comparison, <span className="text-gradient-brand-wide">at your volume.</span>
        </Reveal>

        <Reveal
          delay={150}
          as="p"
          className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          Published rates are per million tokens, which tells you nothing until you multiply by your
          own traffic. Set your monthly volume and every tracked model reprices against it, at the
          cheapest provider actually serving it.
        </Reveal>

        {/* Controls */}
        <Reveal delay={220} className="mt-14 border-y border-border py-8">
          <div className="grid gap-10 sm:grid-cols-3">
            <VolumeSlider
              id="input-tokens"
              label="Input tokens / month"
              value={inputM}
              onChange={setInputM}
            />
            <VolumeSlider
              id="output-tokens"
              label="Output tokens / month"
              value={outputM}
              onChange={setOutputM}
            />
            <div>
              <label
                htmlFor="vendor"
                className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                Model maker
              </label>
              <select
                id="vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="all">All makers</option>
                {data.vendors.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Reveal>

        {/* Headline read */}
        {cheapest && dearest ? (
          <Reveal delay={280} className="mt-10 grid gap-8 sm:grid-cols-3">
            <Headline
              label="Cheapest option"
              value={money(cheapest.best.cost)}
              detail={`${cheapest.row.display_name} · ${cheapest.best.host_label}`}
            />
            <Headline
              label="Dearest tracked option"
              value={money(dearest.best.cost)}
              detail={`${dearest.row.display_name} · ${dearest.best.host_label}`}
            />
            <Headline
              label="Same-model overpay, worst case"
              value={money(Math.max(...rows.map((r) => r.overpay)))}
              detail="Identical weights, wrong host, per month"
              accent
            />
          </Reveal>
        ) : null}

        {/* Table */}
        <div className="mt-14">
          <div className="hidden grid-cols-[2fr_1.2fr_1fr_1fr_1fr] gap-6 border-b border-border pb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:grid">
            <span>Model</span>
            <span>Cheapest host</span>
            <span className="text-right">$ / 1M in</span>
            <span className="text-right">$ / 1M out</span>
            <span className="text-right">Your monthly cost</span>
          </div>

          {rows.slice(0, 60).map((entry, i) => {
            const open = expanded === entry.row.model_key;
            return (
              <div key={entry.row.model_key} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : entry.row.model_key)}
                  aria-expanded={open}
                  className="grid w-full grid-cols-2 gap-4 py-5 text-left sm:grid-cols-[2fr_1.2fr_1fr_1fr_1fr] sm:gap-6"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-base font-semibold tracking-[-0.02em]">
                      {entry.row.display_name}
                    </span>
                    <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
                      {entry.row.vendor}
                      {entry.hosts.length > 1 ? ` · ${entry.hosts.length} hosts` : ""}
                    </span>
                  </div>
                  <span className="truncate text-sm text-muted-foreground sm:self-center">
                    {entry.best.host_label}
                  </span>
                  <span className="num text-right text-sm sm:self-center">
                    ${entry.best.input.toFixed(2)}
                  </span>
                  <span className="num text-right text-sm sm:self-center">
                    ${entry.best.output.toFixed(2)}
                  </span>
                  <span className="num text-right text-sm font-semibold sm:self-center">
                    {money(entry.best.cost)}
                    {entry.overpay > 0.01 ? (
                      <span className="num ml-2 rounded-full bg-saving-soft px-2 py-0.5 text-xs font-semibold text-saving">
                        −{money(entry.overpay)}
                      </span>
                    ) : null}
                  </span>
                </button>

                {open && entry.hosts.length > 1 ? (
                  <div className="pb-5 pl-0 sm:pl-6">
                    {entry.hosts.map((h) => (
                      <div
                        key={h.host_label}
                        className="grid grid-cols-2 gap-4 border-t border-dashed border-border py-2.5 text-sm sm:grid-cols-[2fr_1fr_1fr_1fr]"
                      >
                        <span className="text-muted-foreground">{h.host_label}</span>
                        <span className="num text-right">${h.input.toFixed(2)}</span>
                        <span className="num text-right">${h.output.toFixed(2)}</span>
                        <span className="num text-right font-semibold">{money(h.cost)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          <p className="mt-8 text-sm text-muted-foreground">
            {rows.length > 60
              ? `Showing the 60 cheapest of ${rows.length} priced models. `
              : `Showing all ${rows.length} priced models. `}
            Tap any row to see every provider serving that model.{" "}
            <Link
              to="/reports/cheapest-api-calls"
              className="text-primary underline-offset-4 hover:underline"
            >
              Read the cheapest API call report
            </Link>{" "}
            or{" "}
            <Link to="/models" className="text-primary underline-offset-4 hover:underline">
              browse the full catalog
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

/** Log-ish stepped slider: token volumes span four orders of magnitude. */
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

function VolumeSlider({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const index = Math.max(
    0,
    STEPS.findIndex((s) => s >= value),
  );
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        {label}
      </label>
      <p className="num mt-3 text-[2rem] font-semibold leading-none tracking-[-0.04em]">
        {value.toLocaleString()}M
      </p>
      <input
        id={id}
        type="range"
        min={0}
        max={STEPS.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(STEPS[Number(e.target.value)]!)}
        className="mt-4 w-full accent-primary"
      />
    </div>
  );
}

function Headline({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`num mt-3 text-[2.2rem] font-semibold leading-none tracking-[-0.045em] ${
          accent ? "text-gradient-brand" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function Notes() {
  return (
    <section className="wash-brand border-t border-border px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-3xl">

        <Reveal as="h2" className="text-[1.8rem] font-semibold tracking-[-0.035em] sm:text-[2.4rem]">
          What this calculator does and does not assume
        </Reveal>
        <div className="mt-8 space-y-8 text-base leading-relaxed text-muted-foreground">
          <p>
            <span className="text-foreground">Rates are the published list prices</span> we hold a
            verified record for, in USD per million tokens. No committed-spend discounts, no
            enterprise agreements, no free tiers. If you have negotiated rates, your real number is
            lower than what you see here.
          </p>
          <p>
            <span className="text-foreground">Aggregator listings are excluded</span> from
            provider-to-provider comparisons. A reseller price is a real way to buy a model, but it
            is not a company serving weights, so counting it would flatter the spread.
          </p>
          <p>
            <span className="text-foreground">Cheapest per token is not cheapest per task.</span> A
            model that needs a retry, or emits three times the output for the same answer, costs
            more than this table suggests. Benchmark scores sit next to every price in the{" "}
            <Link to="/models" className="text-primary underline-offset-4 hover:underline">
              model catalog
            </Link>
            , and the sourcing rules are in the{" "}
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
          Stop estimating. <span className="text-gradient-brand">Price your real traffic.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Compare reads your actual usage instead of a slider, and shows what the same calls would
          have cost on the cheapest verified host. Free, forever.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/auth" className="btn-gradient px-6 py-3 text-[15px]">
            Start Compare, free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/reports/cheapest-api-calls" className="btn-quiet px-6 py-3 text-[15px]">
            Cheapest API call report
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
