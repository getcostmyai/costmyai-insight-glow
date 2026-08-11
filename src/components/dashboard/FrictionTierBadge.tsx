import { AlertTriangle, CircleHelp, Plug, ShieldQuestion } from "lucide-react";

import type { FrictionBadge as Badge, ParityStatus } from "@/lib/switching/friction";

/**
 * Dispatch 193 — the switching-friction tier, rendered.
 *
 * Display only. Nothing here is read back by the engine: the badge is handed
 * a value that was computed after the row was already ranked.
 *
 * It never prints an effort estimate. There is no hour count, no day count and
 * no cost, because none of those would be a measurement.
 */

const TONE: Record<Badge["tier"], string> = {
  low: "border-saving/30 bg-saving-soft text-saving",
  moderate: "border-primary/30 bg-primary-soft text-primary",
  high: "border-border bg-muted text-muted-foreground",
};

const STATUS_MARK: Record<ParityStatus, string> = {
  ok: "✓",
  risk: "!",
  unobservable: "–",
  unknown: "?",
};

export function FrictionTierBadge({ friction }: { friction?: Badge }) {
  if (!friction) return null;
  return (
    <span className="group/friction relative inline-flex">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${TONE[friction.tier]}`}
        aria-label={`${friction.label}. ${friction.summary}`}
      >
        {friction.tier === "low" ? (
          <Plug className="size-3" />
        ) : friction.tier === "moderate" ? (
          <ShieldQuestion className="size-3" />
        ) : (
          <AlertTriangle className="size-3" />
        )}
        {friction.label}
      </span>

      <span className="pointer-events-none absolute top-full left-0 z-20 mt-2 hidden w-80 rounded-xl border border-border bg-background p-3 text-left shadow-[var(--shadow-float)] group-hover/friction:block">
        <span className="block text-xs leading-relaxed text-foreground">{friction.summary}</span>
        <span className="mt-2 block space-y-1">
          {friction.parity.map((c) => (
            <span key={c.label} className="block text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-mono">{STATUS_MARK[c.status]}</span>{" "}
              <span className="font-medium text-foreground">{c.label}:</span> {c.detail}
            </span>
          ))}
        </span>
        <span className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <CircleHelp className="mt-0.5 size-3 shrink-0" />
          {friction.revalidationRecommended
            ? "Re-validation recommended before you rely on this switch. We do not estimate how long that takes — that depends on your own test suite, not on anything we measure."
            : "No re-validation indicated: same weights, same request and response shape."}
        </span>
      </span>
    </span>
  );
}
