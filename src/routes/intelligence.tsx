import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Gauge,
  Layers,
  Scale,
  ShieldCheck,
  Timer,
} from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import {
  intelligenceQuery,
  type IntelligencePayload,
} from "@/lib/intelligence.functions";
import type { PriceMove } from "@/lib/intelligence/intelligence.server";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "Intelligence — live AI price and quality market data | CostMyAI" },
      {
        name: "description",
        content:
          "Live market intelligence on the AI model economy: models and providers tracked, price moves this month, multi-provider price spreads and the cheapest model clearing each measured quality band.",
      },
      { property: "og:title", content: "Intelligence — the live AI price and quality market" },
      {
        property: "og:description",
        content:
          "Price moves this month, provider-to-provider spreads on identical weights, and quality-per-dollar winners inside measured benchmark margins.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/intelligence" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/intelligence" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(intelligenceQuery()),
  component: IntelligencePage,
});

const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 0.01 ? 4 : 3)}`;
const signedPct = (n: number | null) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const dateLabel = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "up" | "down";
}) {
  const toneClass =
    tone === "up" ? "text-destructive" : tone === "down" ? "text-saving" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-6 backdrop-blur">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`num mt-3 text-4xl font-semibold tabular-nums tracking-tight ${toneClass}`}>
        {value}
      </p>
      {sub ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function MoveTable({ rows, direction }: { rows: PriceMove[]; direction: "up" | "down" }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        No {direction === "up" ? "increases" : "decreases"} recorded this month.
      </p>
    );
  }
  const accent = direction === "up" ? "text-destructive" : "text-saving";
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Model / host</th>
            <th className="px-4 py-3 text-right font-medium">Input $/MTok</th>
            <th className="px-4 py-3 text-right font-medium">Output $/MTok</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={`${r.modelKey}-${r.host}-${r.observedAt}`}>
              <td className="px-4 py-3">
                <span className="block font-mono text-xs text-foreground">{r.modelKey}</span>
                <span className="text-xs text-muted-foreground">{r.hostLabel}</span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className="text-muted-foreground">
                  {r.inputPrev != null ? usd(r.inputPrev) : "—"} →{" "}
                </span>
                <span className="font-semibold">{r.inputNow != null ? usd(r.inputNow) : "—"}</span>
                <span className={`ml-2 font-semibold ${accent}`}>{signedPct(r.inputPct)}</span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className="text-muted-foreground">
                  {r.outputPrev != null ? usd(r.outputPrev) : "—"} →{" "}
                </span>
                <span className="font-semibold">
                  {r.outputNow != null ? usd(r.outputNow) : "—"}
                </span>
                <span className={`ml-2 font-semibold ${accent}`}>{signedPct(r.outputPct)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PILLARS = [
  {
    icon: Activity,
    title: "Live price sync",
    body: "Per-host prices refresh continuously from public provider feeds. A recommendation is priced against the catalog as it stands the moment you see it — not a quarterly snapshot.",
  },
  {
    icon: Scale,
    title: "Independent benchmark scores",
    body: "Quality comes from published third-party evaluations, per task class. We do not run our own private eval and we are never paid for placement.",
  },
  {
    icon: Layers,
    title: "The equivalence band",
    body: "A candidate model only qualifies when its score sits inside the band around your current model for the task class in question. Cheaper-but-worse never clears.",
  },
  {
    icon: Gauge,
    title: "Measurement margin",
    body: "Every score carries its own uncertainty. We compute the real margin and require the gap to survive it before a switch is offered.",
  },
  {
    icon: Timer,
    title: "Latency ceilings",
    body: "Median latency is part of the decision, not an afterthought. Set a ceiling and candidates that breach it are dropped before cost is even compared.",
  },
  {
    icon: ShieldCheck,
    title: "Refusals with reasons",
    body: "When nothing clears, you get a stated reason — not a weaker suggestion. A quiet downgrade would cost you more than the saving is worth.",
  },
] as const;

function IntelligencePage() {
  const { data } = useSuspenseQuery(intelligenceQuery());
  return (
    <MarketingShell>
      <Hero data={data} />
      <PriceMoves data={data} />
      <MarketStructure data={data} />
      <QualityPerDollar data={data} />
      <Method />
    </MarketingShell>
  );
}

function Hero({ data }: { data: IntelligencePayload }) {
  return (
    <section className="wash-hero px-5 pb-14 pt-16 sm:px-8 sm:pt-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="eyebrow">Intelligence</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            The AI model market, <span className="text-gradient-brand">measured</span>.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Every number on this page is computed from the same live catalog and the same measured
            benchmark instruments the switching engine runs on. Nothing here is estimated.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Models tracked"
            value={data.liveModels.toLocaleString("en-GB")}
            sub="Active entries in the live catalog."
          />
          <Stat
            label="Providers tracked"
            value={data.liveHosts.toLocaleString("en-GB")}
            sub="Distinct hosts with at least one live price."
          />
          <Stat
            label={`Price changes in ${data.monthLabel}`}
            value={data.changesTotal.toLocaleString("en-GB")}
            sub={`${data.increases} up · ${data.decreases} down · ${data.newListings} new listings.`}
          />
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Tracking prices since {dateLabel(data.trackingSince)}. Month-to-date figures cover{" "}
          {data.monthLabel} (UTC).
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
            Start free
          </Link>
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Book a Demo
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function PriceMoves({ data }: { data: IntelligencePayload }) {
  return (
    <section className="border-y border-border bg-card px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">Price moves</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          What changed in {data.monthLabel}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Recorded from the append-only price ledger — every observed move, per model and per host,
          on both the input and output side.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          <Stat label="Total moves" value={data.changesTotal.toLocaleString("en-GB")} />
          <Stat label="Increases" value={data.increases.toLocaleString("en-GB")} tone="up" />
          <Stat label="Decreases" value={data.decreases.toLocaleString("en-GB")} tone="down" />
          <Stat
            label="New models"
            value={data.newModels.toLocaleString("en-GB")}
            sub={`First seen in ${data.monthLabel}.`}
          />
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ArrowUpRight className="h-4 w-4 text-destructive" />
              Top 5 increases
            </h3>
            <div className="mt-4">
              <MoveTable rows={data.topIncreases} direction="up" />
            </div>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ArrowDownRight className="h-4 w-4 text-saving" />
              Top 5 decreases
            </h3>
            <div className="mt-4">
              <MoveTable rows={data.topDecreases} direction="down" />
            </div>
          </div>
        </div>

        <div className="mt-10">
          <h3 className="text-sm font-semibold">Who reprices most</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Ranked over everything we hold — we began recording price moves on{" "}
            {dateLabel(data.trackingSince)}, so this is a short window, not a 90-day history.
          </p>
          {data.repricers.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No repricing recorded yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.repricers.map((r) => (
                <div key={r.host} className="rounded-2xl border border-border bg-background p-5">
                  <p className="text-sm font-semibold">{r.hostLabel}</p>
                  <p className="num mt-2 text-2xl font-semibold tabular-nums text-primary">
                    {r.changes}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    price moves across {r.models} model{r.models === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MarketStructure({ data }: { data: IntelligencePayload }) {
  return (
    <section className="px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">Market structure</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          The same weights cost wildly different money
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Identical model, different real provider. Aggregator listings are excluded, so every gap
          below is a genuine provider-to-provider spread you could act on today.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Models on 2+ providers"
            value={data.multiHostModels.toLocaleString("en-GB")}
          />
          <Stat label="Median providers per model" value={String(data.medianHostsPerModel)} />
          <Stat label="Most providers on one model" value={String(data.maxHostsPerModel)} />
        </div>

        {data.spreads.length > 0 ? (
          <div className="mt-8 space-y-3">
            {data.spreads.map((s) => (
              <div
                key={s.modelKey}
                className="rounded-2xl border border-border bg-card p-5 sm:flex sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.displayName}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{s.modelKey}</p>
                </div>
                <div className="mt-3 flex items-center gap-6 sm:mt-0">
                  <div className="text-right">
                    <p className="num text-sm font-semibold tabular-nums text-saving">
                      {usd(s.cheapest)}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.cheapestHost}</p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm font-semibold tabular-nums text-destructive">
                      {usd(s.dearest)}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.dearestHost}</p>
                  </div>
                  <div className="w-24 text-right">
                    <p className="num text-2xl font-semibold tabular-nums text-primary">
                      +{Math.round(s.spreadPct)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.hosts} provider{s.hosts === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <Link
          to="/models"
          className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Browse the full live catalog
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function QualityPerDollar({ data }: { data: IntelligencePayload }) {
  if (data.bandWinners.length === 0) return null;
  return (
    <section className="border-y border-border bg-card px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">Quality per dollar</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          The cheapest model that still clears the band
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          For each task class we take the leading published score, subtract that evaluation&apos;s
          measured margin, and pick the cheapest model still above the line. Only suites with a real
          measured margin appear — a benchmark without one cannot back a claim.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {data.bandWinners.map((w) => (
            <div key={w.taskClass} className="rounded-2xl border border-border bg-background p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {w.taskClass}
              </p>
              <p className="mt-3 text-sm font-semibold">{w.displayName}</p>
              <p className="font-mono text-xs text-muted-foreground">{w.modelKey}</p>
              <p className="num mt-4 text-3xl font-semibold tabular-nums text-saving">
                {usd(w.pricePerMtok)}
                <span className="ml-1 text-xs font-medium text-muted-foreground">/MTok in</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Scores {w.score.toFixed(2)} on {w.suite}; bar {w.bar.toFixed(2)} (leader{" "}
                {w.topScore.toFixed(2)} − margin ±{w.margin.toFixed(2)}). {w.qualifying} model
                {w.qualifying === 1 ? "" : "s"} clear it. Cheapest listing at {w.hostLabel}.
              </p>
            </div>
          ))}
        </div>

        {data.saturation.length > 0 ? (
          <div className="mt-10">
            <h3 className="text-sm font-semibold">Benchmark saturation</h3>
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
              An evaluation stops being usable when the spread between models collapses into the
              measurement margin. We require the observed spread to exceed twice the margin; a ratio
              at or below 1.0 means the instrument can no longer tell models apart.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {data.saturation.map((s) => (
                <div key={s.taskClass} className="rounded-2xl border border-border p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {s.taskClass} · {s.suite}
                  </p>
                  <p
                    className={`num mt-2 text-2xl font-semibold tabular-nums ${s.ratio <= 1 ? "text-destructive" : "text-saving"}`}
                  >
                    {s.ratio.toFixed(2)}×
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    spread {s.spread.toFixed(2)} vs margin ±{s.margin.toFixed(2)} across {s.models}{" "}
                    scored models — {s.ratio <= 1 ? "saturated" : "discriminating"}.
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Method() {
  return (
    <section className="px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">Method</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          How a switch gets measured
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-card p-6">
              <p.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-sm font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
        <Link
          to="/legal/methodology"
          className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Read the full methodology
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
