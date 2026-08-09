import { Ban, CheckCircle2, KeyRound, MousePointerClick, PlugZap } from "lucide-react";
import type { ComponentType } from "react";

import type { ExecutionTone, SwitchExecution } from "@/lib/dashboard/execution-copy";
import { executionCopy } from "@/lib/dashboard/execution-copy";

/**
 * Dispatch 157/159. The one renderer for "what would this switch actually do".
 *
 * Every switch-rendering surface renders these components against the
 * `execution` the server decided with `phaseFor` / `decideExecutable`. Dispatch
 * 159 adds two rules on top: the label is a *subtitle of the Switch control*,
 * never a stray paragraph at the other end of the card, and the four real
 * distances-to-action each get their own treatment.
 *
 *   automatic      solid saving green — the only "nothing left to do" state
 *   allow_routing  filled indigo — close: one config step on their own box
 *   confirm_once   filled indigo — one click, here
 *   connect_first  dashed indigo outline, no fill — a whole new vendor first
 *   not_available  flat neutral, struck — our limitation, not their task
 */
const TONE: Record<ExecutionTone, string> = {
  automatic: "border-saving/35 bg-saving-soft text-saving",
  allow_routing: "border-primary/35 bg-primary-soft text-primary",
  confirm_once: "border-primary/35 bg-primary-soft text-primary",
  connect_first: "border-dashed border-primary/45 bg-transparent text-primary/80",
  not_available: "border-border/70 bg-muted text-muted-foreground",
};

const DARK_TONE: Record<ExecutionTone, string> = {
  automatic: "border-[oklch(0.86_0.16_155)]/40 bg-[oklch(0.86_0.16_155)]/15 text-[oklch(0.9_0.16_155)]",
  allow_routing: "border-white/30 bg-white/15 text-white",
  confirm_once: "border-white/30 bg-white/15 text-white",
  connect_first: "border-dashed border-white/45 bg-transparent text-white/85",
  not_available: "border-white/15 bg-white/5 text-white/60",
};

const HINT_TONE: Record<ExecutionTone, string> = {
  automatic: "text-saving/90",
  allow_routing: "text-muted-foreground",
  confirm_once: "text-muted-foreground",
  connect_first: "text-muted-foreground",
  not_available: "text-muted-foreground/80",
};

const ICON: Record<ExecutionTone, ComponentType<{ className?: string }>> = {
  automatic: CheckCircle2,
  allow_routing: KeyRound,
  confirm_once: MousePointerClick,
  connect_first: PlugZap,
  not_available: Ban,
};

export function ExecutionBadge({
  execution,
  dark = false,
  className = "",
}: {
  execution?: SwitchExecution;
  dark?: boolean;
  className?: string;
}) {
  if (!execution) return null;
  const c = executionCopy(execution);
  const Icon = ICON[c.tone];
  return (
    <span
      title={c.detail}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${
        (dark ? DARK_TONE : TONE)[c.tone]
      } ${className}`}
    >
      <Icon className="size-3" />
      {c.label}
    </span>
  );
}

/**
 * The badge plus its one-line hint, sized and aligned to sit *under* a button
 * as that button's subtitle. `align` follows the control it belongs to.
 */
export function ExecutionSubtitle({
  execution,
  dark = false,
  align = "right",
  className = "",
}: {
  execution?: SwitchExecution;
  dark?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  if (!execution) return null;
  const c = executionCopy(execution);
  return (
    <div
      className={`flex flex-col gap-1.5 ${align === "right" ? "items-end text-right" : "items-start text-left"} ${className}`}
    >
      <ExecutionBadge execution={execution} dark={dark} />
      <p
        title={c.detail}
        className={`max-w-56 text-[11px] leading-snug ${dark ? "text-white/60" : HINT_TONE[c.tone]}`}
      >
        {c.hint}
      </p>
    </div>
  );
}

/**
 * A Switch control with its execution state attached beneath it. Nothing else
 * may place the label somewhere else on the card.
 */
export function SwitchAction({
  execution,
  dark = false,
  align = "right",
  className = "",
  children,
}: {
  execution?: SwitchExecution;
  dark?: boolean;
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-2 ${align === "right" ? "items-end" : "items-start"} ${className}`}
    >
      {children}
      <ExecutionSubtitle execution={execution} dark={dark} align={align} />
    </div>
  );
}

export function ExecutionNote({
  execution,
  className = "",
}: {
  execution?: SwitchExecution;
  className?: string;
}) {
  if (!execution) return null;
  const c = executionCopy(execution);
  return (
    <div className={className}>
      <ExecutionBadge execution={execution} />
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.detail}</p>
    </div>
  );
}

/**
 * What the action on a row should say once execution is known. A switch that
 * cannot reroute today is still worth recording — but the button must not
 * claim it will move traffic.
 */
export function actionLabelFor(execution: SwitchExecution | undefined, fallback: string) {
  if (!execution || execution.state === "automatic") return fallback;
  return "Record switch";
}
