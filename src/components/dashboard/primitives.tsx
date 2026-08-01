import { useEffect, useState } from "react";
import { Loader2, Pause, Play, Undo2 } from "lucide-react";

import { ranges, type RangeKey } from "@/lib/dashboard-queries";
import type { SwitchOpportunity } from "@/lib/dashboard.server";
import type { SwitchRow } from "@/lib/dashboard-data";

/**
 * Presentational pieces shared by every level page.
 *
 * They live apart from the pages so that Compare, Certify, Rightsize and
 * Govern can each have a genuinely different hero and section order while
 * still speaking one visual language — a stat is a stat everywhere.
 */

export const asSwitchRow = (o: SwitchOpportunity, kind: SwitchRow["kind"]): SwitchRow => ({
  fromModel: o.fromModel,
  fromHost: o.fromHostLabel || o.fromHost,
  toModel: o.toModel,
  toHost: o.toHostLabel || o.toHost,
  fromHostKey: o.fromHost,
  toHostKey: o.toHost,
  taskHint: o.taskHint,
  kind,
  saving: o.saving,
  savingPct: o.savingPct,
  basis: o.basis,
  note: o.note,
  qualityDelta: o.qualityDelta,
});

export function EmptyState({ text }: { text: string }) {
  return <div className="card-surface p-6 text-sm text-muted-foreground">{text}</div>;
}

export function RangeToggle({
  range,
  onChange,
  dark,
}: {
  range: RangeKey;
  onChange: (r: RangeKey) => void;
  dark?: boolean;
}) {
  return (
    <div
      className={`inline-flex gap-1 rounded-full p-1 text-xs font-medium ${
        dark ? "bg-white/10" : "bg-muted"
      }`}
    >
      {ranges.map((r) => {
        const on = r.key === range;
        return (
          <button
            key={r.key}
            onClick={() => onChange(r.key)}
            aria-pressed={on}
            className={`rounded-full px-3 py-1 transition-colors ${
              on
                ? dark
                  ? "bg-white/90 text-[oklch(0.22_0.07_285)]"
                  : "bg-card text-primary shadow-[var(--shadow-card)]"
                : dark
                  ? "text-white/70 hover:text-white"
                  : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export function HeroStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  accent: string;
}) {
  /**
   * A stat is three stacked rows — label, number, subtext — and it inherits
   * those rows from its parent grid via `subgrid`, so every card in a hero
   * shares one baseline per row no matter how far a label wraps. `min-w-0`
   * plus a clamped, non-wrapping number keeps a long spend figure inside its
   * own column instead of bleeding into the neighbouring card.
   */
  return (
    <div className="row-span-3 grid min-w-0 grid-rows-subgrid gap-1 border-l border-white/15 pl-4">
      <p className="self-start text-[11px] font-semibold tracking-widest text-white/55 uppercase">
        {label}
      </p>
      <div
        className="num min-w-0 self-end -tracking-tight whitespace-nowrap tabular-nums text-[clamp(0.95rem,1.1vw,1.5rem)]"
        style={{ color: accent, fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <p className="self-start text-[11px] break-words text-white/55">{sub}</p>
    </div>
  );
}


/**
 * A labelled band of hero stats. Govern needs two of them — everything
 * Rightsize shows, plus its own autonomy row — so the band is its own object.
 */
export function HeroStatRow({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title ? (
        <p className="mb-3 text-[11px] font-semibold tracking-widest text-white/45 uppercase">
          {title}
        </p>
      ) : null}
      {/* Three explicit row tracks so each stat's subgrid shares one baseline. */}
      <div className="grid grid-rows-[auto_auto_auto] gap-x-6 gap-y-7 sm:grid-cols-2 xl:grid-cols-5">
        {children}
      </div>

    </div>
  );
}

/** The dark level hero. Every level opens with one; only the content differs. */
export function LevelHero({
  eyebrow,
  headline,
  sub,
  stats,
  aside,
  children,
}: {
  eyebrow: React.ReactNode;
  headline: React.ReactNode;
  sub?: React.ReactNode;
  stats?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section
      className="animate-rise relative overflow-hidden rounded-3xl p-6 text-white sm:p-10"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div
        className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--gradient-spend)" }}
      />
      <div
        className={`relative grid gap-10 ${aside ? "lg:grid-cols-[1.15fr_auto] lg:items-center" : ""}`}
      >
        <div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">{eyebrow}</div>
          <h1 className="mt-4 text-3xl leading-tight font-semibold sm:text-[2.6rem]">{headline}</h1>
          {sub ? <p className="mt-3 max-w-xl text-sm text-white/70">{sub}</p> : null}
          {stats ? (
            <div className="mt-8 grid grid-rows-[auto_auto_auto] gap-x-6 gap-y-7 sm:grid-cols-2 xl:grid-cols-5">
              {stats}
            </div>
          ) : null}

          {children}
        </div>
        {aside ? <div className="lg:pl-6">{aside}</div> : null}
      </div>
    </section>
  );
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function Metric({
  value,
  label,
  tone,
  live,
}: {
  value: string;
  label: string;
  tone?: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={`num text-2xl ${tone ?? "text-foreground"}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
      <span className="flex items-baseline gap-1 text-xs text-muted-foreground">
        {label}
        {live && (
          <span className="animate-pulse-dot inline-block size-1.5 rounded-full bg-saving" />
        )}
      </span>
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  hint,
  badge,
  badgeTone,
  aside,
}: {
  eyebrow: string;
  title: string;
  hint: string;
  badge?: string;
  badgeTone?: "saving" | "opportunity" | "spend";
  aside?: React.ReactNode;
}) {
  const toneClass =
    badgeTone === "opportunity"
      ? "bg-opportunity-soft text-opportunity"
      : badgeTone === "spend"
        ? "bg-primary-soft text-primary"
        : "bg-saving-soft text-saving";
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        {aside}
        {badge && (
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ${toneClass}`}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

/** Server and browser time zones differ, so the clock is rendered after hydration. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => setText(new Date(iso).toLocaleTimeString("en-US")), [iso]);
  return <span suppressHydrationWarning>{text}</span>;
}

/**
 * Lifecycle controls for one switch. Pause is reversible, rollback is terminal —
 * the labels say so, because the database will not undo it.
 */
export function SwitchControls({
  state,
  busy,
  error,
  canAct,
  onAction,
}: {
  state: "active" | "paused";
  busy: boolean;
  error: string | null;
  canAct: boolean;
  onAction: (action: "pause" | "resume" | "rollback") => void;
}) {
  if (!canAct) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {state === "active" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("pause")}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          <Pause className="size-3.5" />
          Pause
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("resume")}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Play className="size-3.5" />
          Resume
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              "Roll this switch back for good? Traffic returns to the original model and the switch cannot be resumed.",
            )
          ) {
            onAction("rollback");
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-60"
      >
        <Undo2 className="size-3.5" />
        Roll back
      </button>
      {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
