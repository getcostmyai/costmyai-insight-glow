import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Clock, Copy, Loader2, ShieldCheck } from "lucide-react";
import type { SwitchRow } from "@/lib/dashboard-data";
import { PENDING_SWITCH_LABEL } from "@/lib/dashboard/pending-switch";
import { usd } from "@/lib/dashboard-data";
import { SwitchAction, actionLabelFor } from "@/components/dashboard/ExecutionNote";
import { FrictionTierBadge } from "@/components/dashboard/FrictionTierBadge";

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
  discoveryHref,
  readOnly = false,
  pendingTraffic = false,
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
  discoveryHref?: string;
  /** The public demo is a showcase: the action renders as a label, not a link. */
  readOnly?: boolean;
  /**
   * A switch is already running for this pair, but the workload's traffic has
   * not moved yet, so the spend — and therefore the opportunity — is still on
   * the rollups. The row states that instead of offering an action.
   */
  pendingTraffic?: boolean;
}) {
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
        <SwitchAction execution={row.execution}>
        {pendingTraffic ? (
          // State, not action: the switch exists, the traffic does not yet.
          // Ahead of every other branch, because it is the truth about the row.
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3.5 py-2 text-xs font-medium text-primary">
            <Clock className="size-3.5" />
            {PENDING_SWITCH_LABEL}
          </span>
        ) : discovery ? (
          <Link
            to={discoveryHref ?? "/pricing"}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Certified — switch via Rightsize
            <ArrowUpRight className="size-3.5" />
          </Link>
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
      </div>
    </div>
  );
}
