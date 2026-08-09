import type { SwitchExecution } from "@/lib/dashboard/execution-copy";
import { executionCopy } from "@/lib/dashboard/execution-copy";

/**
 * Dispatch 157. The one renderer for "what would this switch actually do".
 *
 * Every switch-rendering surface in the product — Lists A and B, the
 * right-size cards, the hero's one-click switch, Govern's eligible and refused
 * lists, and the active-switches panel — renders this component against the
 * `execution` the server decided with `phaseFor` / `decideExecutable`. No
 * surface gets to word it differently, and none can silently reuse Phase 1's
 * automatic execution as a blanket claim.
 */
const TONE: Record<string, string> = {
  automatic: "border-saving/30 bg-saving-soft text-saving",
  needs_your_action: "border-primary/30 bg-primary-soft text-primary",
  not_available_yet: "border-border bg-muted text-muted-foreground",
};

const DARK_TONE: Record<string, string> = {
  automatic: "border-white/25 bg-white/10 text-[oklch(0.86_0.16_155)]",
  needs_your_action: "border-white/25 bg-white/10 text-white/85",
  not_available_yet: "border-white/20 bg-white/5 text-white/65",
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
  const tone = (dark ? DARK_TONE : TONE)[c.state];
  return (
    <span
      title={c.detail}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${tone} ${className}`}
    >
      {c.label}
    </span>
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
