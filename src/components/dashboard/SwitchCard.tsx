import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Clock, Copy, Loader2, ShieldCheck } from "lucide-react";
import type { SwitchRow } from "@/lib/dashboard-data";
import {
  MOVED_SWITCH_LABEL,
  PENDING_SWITCH_LABEL,
  isSameTarget,
  supersededLabel,
  type ActiveSwitchTarget,
} from "@/lib/dashboard/pending-switch";

import { usd } from "@/lib/dashboard-data";
import { SwitchAction, actionLabelFor } from "@/components/dashboard/ExecutionNote";
import { FrictionTierBadge } from "@/components/dashboard/FrictionTierBadge";
import { SupersededNote } from "@/components/dashboard/SupersededNote";
import type { WorkloadOption } from "@/lib/dashboard/group";
import { isHeadlineEligible, CERTIFICATION_MARGIN_CAP } from "@/lib/engine/equivalence";

/** One certified switch opportunity, ranked by saving. */
export function SwitchCard({
  row,
  rank,
  onActivate,
  pending = false,
  error,
  actionLabel = "Switch now",
  disabledHint,
  ctaHref,
  ctaLabel,
  period,
  discovery = false,
  showDiscoveryUpsell = true,
  discoveryHref,
  readOnly = false,
  activeSwitch = null,
  supersededBy = null,
  supersededHere = false,
}: {
  row: SwitchRow;
  /** The window the saving was measured over, e.g. "last 7 days". */
  period: string;
  rank: number;
  /** Absent on the public demo: the row is read-only there. */
  onActivate?: () => void;
  pending?: boolean;
  error?: string | null;
  actionLabel?: string;
  disabledHint?: string;
  /** Where the read-only demo sends the visitor instead of activating. */
  ctaHref?: string;
  ctaLabel?: string;
  /**
   * Compare and Certify find and certify; they never execute. On those levels
   * the row routes the intent to Rightsize rather than offering an activation
   * that the level itself cannot honour.
   */
  discovery?: boolean;
  /**
   * Dispatch 219. Compare already has a page-level Certify upsell, so its
   * per-card discovery link is removed. Certify keeps the Rightsize link.
   */
  showDiscoveryUpsell?: boolean;
  discoveryHref?: string;
  /** The public demo is a showcase: the action renders as a label, not a link. */
  readOnly?: boolean;
  /**
   * Dispatch 212. The switch already running for this workload, if any, with
   * its real destination — not a boolean about this row's own destination.
   *
   * A switch can be running while the workload's traffic has not moved yet, so
   * the spend, and therefore the opportunity, is still on the rollups. The row
   * stays and states its real state. When the running switch targets something
   * other than this row proposes, the row says *that* rather than claiming to
   * be armed.
   */
  activeSwitch?: ActiveSwitchTarget | null;
  /**
   * Dispatch 231. Another mechanism claims this workload's money. The row is
   * still drawn — the section badge counted it — but it offers no action and
   * names where the better option lives instead.
   */
  supersededBy?: WorkloadOption | null;
  /** That better option is on this same page, so the note does not send anyone away. */
  supersededHere?: boolean;
}) {
  /*
   * Dispatch 217. Discovery tiers never reference execution, in any tense or
   * form. The execution-subtitle path was already gated (Dispatch 196); this
   * state pill was a second, independent path that bypassed it. Both are
   * silenced by the same flag now, so a genuinely running switch produces no
   * execution language on Compare or Certify.
   */
  const armed = !discovery && isSameTarget(activeSwitch, row.toModel, row.toHost);
  const superseded = !discovery && !!activeSwitch && !armed;

  const isStrongMatch =
    row.kind === "quality" && isHeadlineEligible({ qualityDelta: row.qualityDelta ?? null });

  return (
    <div className="group card-surface flex flex-col gap-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] sm:flex-row sm:items-center">
      <div className="flex w-full min-w-0 items-center gap-4">
        <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/40">
              {row.fromModel}
            </span>
            <span className="text-[11px] text-muted-foreground/70">{row.fromHost}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ArrowRight className="size-3.5 text-primary" />
            <span className="font-mono text-sm font-semibold text-primary">{row.toModel}</span>
            <span className="text-[11px] text-muted-foreground">{row.toHost}</span>
            {/*
              Arbitrage moves the identical weights to another provider, so no
              benchmark is involved. "Certified" is reserved for swaps a
              third-party measurement actually proved.
            */}
            {row.kind === "host" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                <Copy className="size-3" /> Same model
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-saving-soft px-2 py-0.5 text-[10px] font-semibold tracking-wide text-saving uppercase">
                <ShieldCheck className="size-3" /> Certified
              </span>
            )}
            {/*
              Dispatch 193. Display only: this badge is rendered next to the
              verdict, never consulted by the ranking that produced it.
            */}
            <FrictionTierBadge friction={row.friction} />
          </div>
          {row.kind === "quality" && row.note ? (
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {row.note}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-5 sm:pl-4">
        <div className="text-right">
          <div className="num text-xl text-saving">+{usd(row.saving)}</div>
          <div className="text-[11px] text-muted-foreground">
            in the {period} · −{row.savingPct}%
          </div>
        </div>
        <div className="hidden w-24 sm:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${row.savingPct}%`,
                background: "var(--gradient-saving)",
              }}
            />
          </div>
        </div>
        {/*
          Dispatch 196. Compare and Certify identify and certify; they never
          execute (see `discovery` above). Passing them an execution state made
          them render "Rerouting automatically" beside a card that offers no
          activation at all — a present-tense execution claim about a candidate
          nobody has activated. Discovery rows carry no execution copy, in any
          tense: the row states what those tiers really produced, and routes
          the intent to the level that owns execution.
        */}
        {supersededBy ? (
          <SupersededNote option={supersededBy} here={supersededHere} className="max-w-72 text-right" />
        ) : (
        <SwitchAction
          execution={discovery || superseded ? undefined : row.execution}
          /* Dispatch 197: an active-but-unmoved switch is armed, not "once active". */
          /* Dispatch 212: only the running destination is armed; a superseded
             alternative carries no execution copy at all. */
          mode={armed ? "armed" : "prospective"}
        >
        {armed || superseded ? (
          // State, not action: the switch exists, the traffic does not yet.
          // Ahead of every other branch, because it is the truth about the row.
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3.5 py-2 text-xs font-medium text-primary">
            <Clock className="size-3.5" />
            {armed
              ? activeSwitch!.moved
                ? MOVED_SWITCH_LABEL
                : PENDING_SWITCH_LABEL
              : supersededLabel(activeSwitch!)}
          </span>
        ) : discovery ? (
          showDiscoveryUpsell ? (
            <div className="flex flex-col items-end gap-1 text-right">
              <Link
                to={discoveryHref ?? "/pricing"}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                Certified — switch via Rightsize
                <ArrowUpRight className="size-3.5" />
              </Link>
              <p className="max-w-56 text-[11px] leading-snug text-muted-foreground/80">
                Found and certified here. Nothing on this level moves traffic.
              </p>
            </div>
          ) : null
        ) : readOnly ? (

          // The demo is read-only whatever else was passed in: this branch is
          // deliberately ahead of onActivate so no caller can reintroduce a
          // live action or an "Activate in your workspace" CTA on /demo.
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary">
            Switch
          </span>
        ) : onActivate ? (
          <button
            type="button"
            onClick={onActivate}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] transition-transform active:scale-95 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {pending ? "Switching…" : actionLabelFor(row.execution, actionLabel)}
          </button>
        ) : (
          <Link
            to={ctaHref ?? "/auth"}
            title={disabledHint ?? "Sign in to your own workspace to activate switches"}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
          >
            {ctaLabel ?? "Sign in to activate"}
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
        </SwitchAction>
        )}
      </div>
    </div>
  );
}
