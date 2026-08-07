import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { CountUp, Reveal } from "@/components/marketing/Reveal";
import { ShareCardButton } from "@/components/marketing/ShareCardButton";
import { EmbedWidgetSection } from "@/components/marketing/EmbedWidgetSection";

import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import {
  BandDiagram,
  HostHistogram,
  PriceMovesDonut,
  SaturationGauge,
} from "@/components/marketing/IntelligenceCharts";
import type { IntelligencePayload } from "@/lib/intelligence.functions";
import type { PriceMove } from "@/lib/intelligence/intelligence.server";
import { bandCardId, moveCardId, repricerCardId, spreadCardId } from "@/lib/intelligence/share-cards";
import { LABELS, notesForMonth, notesNewestFirst } from "@/lib/intelligence/notes";

/**
 * The Intelligence report body.
 *
 * One renderer serves two routes: the live open month at /intelligence and any
 * closed month at /intelligence/YYYY-MM. The markup and the anchors are
 * identical on both, which is what makes a shared per-card anchor resolve to
 * the same card on the frozen page that the reader clicked on the live one.
 */

export interface ReportContext {
  /** Frozen month key when this is an archive page, else null (live page). */
  frozenMonth: string | null;
  /** Month a share link should cite: this frozen month, or the newest archive. */
  citableMonth: string | null;
  archive: { month: string; frozenAt: string }[];
}

const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 0.01 ? 4 : 3)}`);
const signedPct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

export const dateLabel = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

/* ---------------------------------------------------------------------------
 * Primitives. No cards, no fills — the number is the object, the label is a
 * caption, and separation comes from space and hairlines.
 * ------------------------------------------------------------------------- */

function Figure({
  value,
  label,
  sub,
  format,
  tone = "default",
  size = "lg",
  cardId,
  ctx,
}: {
  value: number;
  label: string;
  sub?: string;
  format?: (n: number) => string;
  tone?: "default" | "up" | "down" | "brand";
  size?: "lg" | "xl";
  cardId?: string;
  ctx?: ReportContext;
}) {
  const toneClass =
    tone === "up"
      ? "text-destructive"
      : tone === "down"
        ? "text-saving"
        : tone === "brand"
          ? "text-primary"
          : "text-foreground";
  return (
    <div id={cardId} className="group scroll-mt-28">
      <CountUp
        value={value}
        format={format}
        className={`block font-semibold tracking-[-0.045em] ${toneClass} ${
          size === "xl" ? "text-6xl sm:text-7xl" : "text-5xl sm:text-6xl"
        }`}
      />
      <div className="mt-3 flex items-center gap-1.5">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        {cardId && ctx ? (
          <ShareCardButton
            cardId={cardId}
            month={ctx.citableMonth}
            title={`${format ? format(value) : value} — ${label}`}
          />
        ) : null}
      </div>
      {sub ? (
        <p className="mt-2 max-w-[26ch] text-xs leading-relaxed text-muted-foreground/80">{sub}</p>
      ) : null}
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal className="max-w-3xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.75rem] sm:leading-[1.05]">
        {title}
      </h2>
      {children ? (
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">{children}</p>
      ) : null}
    </Reveal>
  );
}

function MoveList({
  rows,
  direction,
  ctx,
}: {
  rows: PriceMove[];
  direction: "up" | "down";
  ctx: ReportContext;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No {direction === "up" ? "increases" : "decreases"} recorded this month.
      </p>
    );
  }
  const accent = direction === "up" ? "text-destructive" : "text-saving";
  return (
    <ul className="mt-6 divide-y divide-border/60 border-t border-border/60">
      {rows.map((r, i) => {
        const id = moveCardId(direction === "up" ? "increase" : "decrease", r.modelKey, r.host);
        return (
          <Reveal as="li" key={`${r.modelKey}-${r.host}-${r.observedAt}`} delay={i * 70}>
            <div
              id={id}
              className="group flex items-baseline justify-between gap-6 py-5 scroll-mt-28"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-foreground">{r.modelKey}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.hostLabel}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                  <p className={`num text-2xl font-semibold tabular-nums tracking-tight ${accent}`}>
                    {signedPct(r.pct)}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    blended
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {r.inputPrev != null ? usd(r.inputPrev) : "—"} →{" "}
                    {r.inputNow != null ? usd(r.inputNow) : "—"} in
                    {r.inputPct != null ? ` (${signedPct(r.inputPct)})` : ""} ·{" "}
                    {r.outputPrev != null ? usd(r.outputPrev) : "—"} →{" "}
                    {r.outputNow != null ? usd(r.outputNow) : "—"} out
                    {r.outputPct != null ? ` (${signedPct(r.outputPct)})` : ""}
                  </p>
                </div>
                <ShareCardButton
                  cardId={id}
                  month={ctx.citableMonth}
                  title={`${r.modelKey} at ${r.hostLabel}: ${signedPct(r.pct)}`}
                />
              </div>
            </div>
          </Reveal>
        );
      })}
    </ul>
  );
}

const PILLARS = [
  {
    title: "Live price sync",
    body: "Per-host prices refresh continuously from public provider feeds. A recommendation is priced against the catalog as it stands the moment you see it — not a quarterly snapshot.",
  },
  {
    title: "Independent benchmark scores",
    body: "Quality comes from published third-party evaluations, per task class. We do not run our own private eval and we are never paid for placement.",
  },
  {
    title: "The equivalence band",
    body: "A candidate model only qualifies when its score sits inside the band around your current model for the task class in question. Cheaper-but-worse never clears.",
  },
  {
    title: "Measurement margin",
    body: "Every score carries its own uncertainty. We compute the real margin and require the gap to survive it before a switch is offered.",
  },
  {
    title: "Latency ceilings",
    body: "Median latency is part of the decision, not an afterthought. Set a ceiling and candidates that breach it are dropped before cost is even compared.",
  },
  {
    title: "Refusals with reasons",
    body: "When nothing clears, you get a stated reason — not a weaker suggestion. A quiet downgrade would cost you more than the saving is worth.",
  },
] as const;

/**
 * Frozen payloads were written by older code and can lack arrays added later.
 * Backfill them so an archived month never blanks the page.
 */
function withDefaults(data: IntelligencePayload): IntelligencePayload {
  return {
    ...data,
    topIncreases: data.topIncreases ?? [],
    topDecreases: data.topDecreases ?? [],
    repricers: data.repricers ?? [],
    spreads: data.spreads ?? [],
    bandWinners: data.bandWinners ?? [],
    saturation: data.saturation ?? [],
    hostBuckets: data.hostBuckets ?? [],
  };
}

export function IntelligenceReport({
  data,
  ctx,
  hero,
}: {
  data: IntelligencePayload;
  ctx: ReportContext;
  hero: React.ReactNode;
}) {
  const d = withDefaults(data);
  return (
    <>
      {hero}
      <PriceMoves data={d} ctx={ctx} />
      <MarketStructure data={d} ctx={ctx} />
      <QualityPerDollar data={d} ctx={ctx} />
      <EmbedWidgetSection />
      <NotesRail ctx={ctx} />
      <Archive ctx={ctx} />

      <Method />

    </>
  );
}


export function HeroFigures({ data, ctx }: { data: IntelligencePayload; ctx: ReportContext }) {
  return (
    <Reveal delay={120} className="mt-20 grid gap-14 sm:grid-cols-3 sm:gap-8">
      <Figure
        size="xl"
        value={data.liveModels}
        label="Models tracked"
        sub="Active entries in the live catalog."
        cardId="kpi-models"
        ctx={ctx}
      />
      <Figure
        size="xl"
        value={data.liveHosts}
        label="Providers tracked"
        sub="Distinct real providers with at least one live price. Aggregator listings are excluded."

        cardId="kpi-providers"
        ctx={ctx}
      />
      <Figure
        size="xl"
        value={data.changesTotal}
        label={`Price moves in ${data.monthLabel}`}
        sub={`${data.increases} up · ${data.decreases} down. ${data.newListings} new listings are counted separately.`}
        cardId="kpi-moves"
        ctx={ctx}
      />
    </Reveal>
  );
}

export function HeroCta() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-5">
      <Link to="/auth" className="btn-gradient px-6 py-3 text-sm">
        Start free
      </Link>
      <a
        href={BOOK_DEMO_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
      >
        Book a Demo
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}

function PriceMoves({ data, ctx }: { data: IntelligencePayload; ctx: ReportContext }) {
  const maxChanges = Math.max(1, ...data.repricers.map((r) => r.changes));
  return (
    <section className="px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Price moves" title={`What changed in ${data.monthLabel}`}>
          Recorded from the append-only price ledger — every observed move, per model and per host,
          on both the input and output side.
        </SectionHead>

        <Reveal delay={80} className="mt-16">
          <PriceMovesDonut
            increases={data.increases}
            decreases={data.decreases}
            newListings={data.newListings}
            monthLabel={data.monthLabel}
          />
        </Reveal>

        <Reveal delay={100} className="mt-20 grid gap-12 sm:grid-cols-4 sm:gap-8">
          <Figure
            value={data.changesTotal}
            label="Total moves"
            sub="Increases plus decreases. New listings are not folded in."
            cardId="kpi-moves-total"
            ctx={ctx}
          />
          <Figure
            value={data.increases}
            label="Increases"
            tone="up"
            cardId="kpi-increases"
            ctx={ctx}
          />
          <Figure
            value={data.decreases}
            label="Decreases"
            tone="down"
            cardId="kpi-decreases"
            ctx={ctx}
          />
          <Figure
            value={data.newModels}
            label="New models"
            sub={`First seen in ${data.monthLabel}.`}
            cardId="kpi-new-models"
            ctx={ctx}
          />
        </Reveal>

        <div className="mt-24 grid gap-16 lg:grid-cols-2 lg:gap-14">
          <div>
            <Reveal>
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <ArrowUpRight className="h-4 w-4 text-destructive" />
                Top 5 increases
              </h3>
            </Reveal>
            <MoveList rows={data.topIncreases} direction="up" ctx={ctx} />
          </div>
          <div>
            <Reveal>
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <ArrowDownRight className="h-4 w-4 text-saving" />
                Top 5 decreases
              </h3>
            </Reveal>
            <MoveList rows={data.topDecreases} direction="down" ctx={ctx} />
          </div>
        </div>

        <div className="mt-24">
          <Reveal className="max-w-2xl">
            <h3 className="text-sm font-semibold tracking-tight">Who reprices most</h3>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Ranked over everything we hold — we began recording price moves on{" "}
              {dateLabel(data.trackingSince)}, so this is a short window, not a 90-day history.
            </p>
          </Reveal>
          {data.repricers.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">No repricing recorded yet.</p>
          ) : (
            <ul className="mt-8 divide-y divide-border/60 border-t border-border/60">
              {data.repricers.map((r, i) => (
                <Reveal as="li" key={r.host} delay={i * 60}>
                  <div
                    id={repricerCardId(r.host)}
                    className="group flex items-center gap-6 py-5 scroll-mt-28"
                  >
                    <span className="num w-6 shrink-0 text-xs tabular-nums text-muted-foreground/70">
                      {i + 1}
                    </span>
                    <span className="w-40 shrink-0 truncate text-sm font-medium">{r.hostLabel}</span>
                    <span className="relative hidden h-[3px] flex-1 overflow-hidden rounded-full bg-border sm:block">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-primary"
                        style={{ width: `${(r.changes / maxChanges) * 100}%` }}
                      />
                    </span>
                    <span className="ml-auto shrink-0 text-right sm:ml-0">
                      <span className="num text-2xl font-semibold tabular-nums tracking-tight">
                        {r.changes}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        moves · {r.models} model{r.models === 1 ? "" : "s"}
                      </span>
                    </span>
                    <ShareCardButton
                      cardId={repricerCardId(r.host)}
                      month={ctx.citableMonth}
                      title={`${r.hostLabel}: ${r.changes} price moves`}
                    />
                  </div>
                </Reveal>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function MarketStructure({ data, ctx }: { data: IntelligencePayload; ctx: ReportContext }) {
  const maxSpread = Math.max(1, ...data.spreads.map((s) => s.spreadPct));
  return (
    <section className="border-t border-border/60 px-5 py-28 sm:px-8 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Market structure" title="The same weights cost wildly different money">
          Identical model, different real provider. Aggregator listings are excluded, so every gap
          below is a genuine provider-to-provider spread you could act on today.
        </SectionHead>

        <Reveal delay={100} className="mt-16 grid gap-12 sm:grid-cols-3 sm:gap-8">
          <Figure
            value={data.multiHostModels}
            label="Models on 2+ providers"
            cardId="kpi-multi-host"
            ctx={ctx}
          />
          <Figure value={data.medianHostsPerModel} label="Median providers per model" />
          <Figure value={data.maxHostsPerModel} label="Most providers on one model" />
        </Reveal>

        {data.hostBuckets.length > 0 ? (
          <Reveal delay={140} className="mt-20 max-w-3xl">
            <HostHistogram buckets={data.hostBuckets} />
          </Reveal>
        ) : null}

        {data.spreads.length > 0 ? (
          <ul className="mt-20 divide-y divide-border/60 border-t border-border/60">
            {data.spreads.map((s, i) => (
              <Reveal as="li" key={s.modelKey} delay={i * 60}>
                <div
                  id={spreadCardId(s.modelKey)}
                  className="group grid gap-4 py-7 scroll-mt-28 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-10"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium tracking-tight">{s.displayName}</p>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {s.modelKey}
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <span className="num shrink-0 text-xs font-medium tabular-nums text-saving">
                        {usd(s.cheapest)}
                      </span>
                      <span className="relative h-[3px] w-full max-w-xs overflow-hidden rounded-full bg-border">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-saving to-destructive"
                          style={{ width: `${Math.max(8, (s.spreadPct / maxSpread) * 100)}%` }}
                        />
                      </span>
                      <span className="num shrink-0 text-xs font-medium tabular-nums text-destructive">
                        {usd(s.dearest)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {s.cheapestHost} → {s.dearestHost} · {s.hosts} provider
                      {s.hosts === 1 ? "" : "s"} · per MTok in
                    </p>

                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <span className="num text-4xl font-semibold tabular-nums tracking-[-0.04em] sm:text-5xl">
                        +{Math.round(s.spreadPct)}%
                      </span>
                      <p className="mt-1 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        spread
                      </p>
                    </div>
                    <ShareCardButton
                      cardId={spreadCardId(s.modelKey)}
                      month={ctx.citableMonth}
                      title={`${s.displayName}: +${Math.round(s.spreadPct)}% provider spread`}
                    />
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        ) : null}

        <Reveal>
          <Link
            to="/models"
            className="mt-14 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-70"
          >
            Browse the full live catalog
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function QualityPerDollar({ data, ctx }: { data: IntelligencePayload; ctx: ReportContext }) {
  if (data.bandWinners.length === 0) return null;
  return (
    <section className="border-t border-border/60 px-5 py-28 sm:px-8 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <SectionHead
          eyebrow="Quality per dollar"
          title="The cheapest model that still clears the band"
        >
          For each task class we take the leading published score, subtract that evaluation&apos;s
          measured margin, and pick the cheapest model still above the line. Only suites with a real
          measured margin appear — a benchmark without one cannot back a claim.
        </SectionHead>

        <ul className="mt-16 divide-y divide-border/60 border-t border-border/60">
          {data.bandWinners.map((w, i) => (
            <Reveal as="li" key={w.taskClass} delay={i * 80}>
              <div
                id={bandCardId(w.taskClass)}
                className="group grid gap-6 py-9 scroll-mt-28 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-12"
              >
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {w.taskClass}
                  </p>
                  <p className="mt-3 text-xl font-medium tracking-tight">{w.displayName}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{w.modelKey}</p>
                  <p className="mt-4 max-w-xl text-xs leading-relaxed text-muted-foreground">
                    Scores {w.score.toFixed(2)} on {w.suite}; bar {w.bar.toFixed(2)} (leader{" "}
                    {w.topScore.toFixed(2)} − margin ±{w.margin.toFixed(2)}). {w.qualifying} model
                    {w.qualifying === 1 ? "" : "s"} clear it. Cheapest listing at {w.hostLabel}.
                  </p>
                  <BandDiagram winner={w} />
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <div className="sm:text-right">
                    <span className="num text-5xl font-semibold tabular-nums tracking-[-0.045em] text-saving sm:text-6xl">
                      {usd(w.pricePerMtok)}
                    </span>
                    <p className="mt-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      per MTok in
                    </p>
                  </div>
                  <ShareCardButton
                    cardId={bandCardId(w.taskClass)}
                    month={ctx.citableMonth}
                    title={`${w.taskClass}: ${w.displayName} clears the band at ${usd(w.pricePerMtok)}/MTok`}
                  />
                </div>
              </div>
            </Reveal>
          ))}
        </ul>

        {data.saturation.length > 0 ? (
          <div className="mt-24">
            <Reveal className="max-w-2xl">
              <h3 className="text-sm font-semibold tracking-tight">Benchmark saturation</h3>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                An evaluation stops being usable when the spread between models collapses into the
                measurement margin. We require the observed spread to exceed twice the margin; a
                ratio at or below 1.0 means the instrument can no longer tell models apart.
              </p>
            </Reveal>
            <ul className="mt-8 divide-y divide-border/60 border-t border-border/60">
              {data.saturation.map((s, i) => (
                <Reveal as="li" key={s.taskClass} delay={i * 60}>
                  <div className="flex flex-wrap items-center justify-between gap-6 py-7">
                    <div>
                      <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {s.taskClass} · {s.suite}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        spread {s.spread.toFixed(2)} vs margin ±{s.margin.toFixed(2)} across{" "}
                        {s.models} scored models — {s.ratio <= 1 ? "saturated" : "discriminating"}.
                      </p>
                    </div>
                    <SaturationGauge row={s} />
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Notes rail.
 *
 * On a frozen page it shows only the notes written against that month; on the
 * live page, the most recent notes overall. It renders nothing at all when
 * there is nothing to show, so the section never advertises analysis that does
 * not exist.
 */
function NotesRail({ ctx }: { ctx: ReportContext }) {
  const notes = ctx.frozenMonth ? notesForMonth(ctx.frozenMonth) : notesNewestFirst().slice(0, 3);
  if (notes.length === 0) return null;

  return (
    <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Notes" title="Why these numbers moved">
          Each note is labelled before its first sentence: a proven mechanism, a correlation we
          will not call a cause, or third-party data we have named.
        </SectionHead>
        <ul className="mt-10 divide-y divide-border/60 border-t border-border/60">
          {notes.map((n) => (
            <li key={n.slug}>
              <Reveal>
                <Link
                  to="/intelligence/notes/$slug"
                  params={{ slug: n.slug }}
                  className="group grid gap-4 py-8 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-10"
                >
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {LABELS[n.label].short}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xl font-semibold tracking-tight transition-colors group-hover:text-primary sm:text-2xl">
                      {n.title}
                    </span>
                    <span className="mt-3 block max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {n.deck}
                    </span>
                  </span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal>
          <Link
            to="/intelligence/notes"
            className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-70"
          >
            All notes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function Archive({ ctx }: { ctx: ReportContext }) {

  return (
    <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Archive" title="Every closed month, frozen and permanently linkable">
          At 00:00 UTC on the first of each month we write that month&apos;s final figures once and
          never touch them again. A correction is filed as a new restatement row that points back at
          the original — the number you cited stays exactly as you cited it.
        </SectionHead>
        {ctx.archive.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">
            No month has closed since we began recording. The first archive page appears at the next
            month boundary.
          </p>
        ) : (
          <ul className="mt-10 flex flex-wrap gap-3">
            {ctx.archive.map((a) => (
              <li key={a.month}>
                <Link
                  to="/intelligence/$month"
                  params={{ month: a.month }}
                  className={`inline-flex items-center rounded-full border px-4 py-2 text-sm transition-colors ${
                    ctx.frozenMonth === a.month
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/70 hover:border-foreground/40"
                  }`}
                >
                  {a.month}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {ctx.frozenMonth ? (
          <Reveal>
            <Link
              to="/intelligence"
              className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-70"
            >
              See the live, still-moving month
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

function Method() {
  return (
    <section className="border-t border-border/60 px-5 py-28 sm:px-8 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Method" title="How a switch gets measured" />
        <ul className="mt-16 divide-y divide-border/60 border-t border-border/60">
          {PILLARS.map((p, i) => (
            <Reveal as="li" key={p.title} delay={i * 60}>
              <div className="grid gap-3 py-7 sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-12">
                <h3 className="text-sm font-semibold tracking-tight">{p.title}</h3>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
        <Reveal>
          <Link
            to="/legal/methodology"
            className="mt-14 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-70"
          >
            Read the full methodology
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
