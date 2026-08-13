import { ArrowRight, Sparkles } from "lucide-react";

import { usd } from "@/lib/dashboard-data";
import { PLAN_META } from "@/lib/engine/types";
import type { MechanismKind, WorkloadGroup } from "@/lib/dashboard/group";

/**
 * Dispatch 213 — what collapses underneath a merged workload card.
 *
 * The card above states the workload's best option. Everything else the three
 * mechanisms found on the *same* workload sits here: visible, ranked, and
 * explicitly framed as alternatives to one decision rather than as extra money.
 *
 * Locked findings are count-only, on purpose. `gateLevel` already withheld the
 * row; a teaser that named the model or the saving would hand back exactly the
 * detail the plan gate exists to sell. So the teaser says how many and behind
 * which plan, and nothing else — the same subtractive rule Dispatch 164 set.
 */

const MECHANISM_LABEL: Record<MechanismKind, string> = {
  host_arbitrage: "Same model, cheaper host",
  quality_match: "Quality-proven model swap",
  rightsize: "Right-size to a smaller model",
};

export function WorkloadAlternatives({
  group,
  period,
  upsellHref,
}: {
  group: WorkloadGroup | null;
  period: string;
  /** Where a locked teaser sends the reader. Same destination as the page upsell. */
  upsellHref?: string;
}) {
  if (!group) return null;
  const { alternatives, locked } = group;
  if (alternatives.length === 0 && locked.length === 0) return null;

  return (
    <div className="mt-1 space-y-2">
      {alternatives.length > 0 ? (
        <details className="card-surface group/alt overflow-hidden px-4 py-3">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground marker:hidden">
            <span className="text-foreground">
              {alternatives.length} other option{alternatives.length === 1 ? "" : "s"}
            </span>{" "}
            found on this same workload — same decision, not extra saving
          </summary>
          <ul className="mt-3 space-y-2 border-t border-border pt-3">
            {alternatives.map((a) => (
              <li
                key={`${a.kind}|${a.toModel}|${a.toHost}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
              >
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="font-mono text-foreground">{a.toModel}</span>
                <span className="text-muted-foreground">{a.toHostLabel || a.toHost}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {MECHANISM_LABEL[a.kind]}
                </span>
                <span className="num ml-auto text-saving">+{usd(a.saving, 0)}</span>
                <span className="text-[11px] text-muted-foreground">in the {period}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {locked.map((l) => {
        const meta = PLAN_META[l.requiredPlan];
        const body = (
          <>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="eyebrow text-primary">Already found on your traffic · {meta.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {l.count} more alternative{l.count === 1 ? "" : "s"} behind {meta.label}
              </p>
            </div>
            <span className="ml-auto text-xs font-semibold text-primary">
              Unlock {meta.label}
            </span>
          </>
        );
        return upsellHref ? (
          <a
            key={l.requiredPlan}
            href={upsellHref}
            className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft/60 px-4 py-3 transition-transform hover:-translate-y-0.5"
          >
            {body}
          </a>
        ) : (
          <div
            key={l.requiredPlan}
            className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft/60 px-4 py-3"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
