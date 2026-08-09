/**
 * The switch plan — what a customer's container is told about its own active
 * switches (Dispatch 155, Stage 2).
 *
 * Pure and shared: the server builds this shape, the container consumes it,
 * and the tests exercise the same code both sides run. Nothing here reaches a
 * database, and nothing here re-derives canonicalisation — every key in a plan
 * was resolved by the server, by the same code that wrote `switches.to_host`.
 * A container that had to canonicalise for itself would eventually disagree
 * with us about what a switch matches, and it would disagree silently.
 */

import type { ProviderGateState } from "@/lib/dashboard/provider-gate";

/**
 * Which build phase can actually execute a given switch.
 *
 * 1 — same-host model swap. The container already fronts that provider with
 *     the customer's own key on every request; no grant, no new credential.
 * 2 — cross-provider routing on a rewritable shape (OpenAI-compatible or
 *     Anthropic). Needs an explicit routing grant.
 * 3 — Bedrock and Vertex. A fresh, correctly signed request per provider, not
 *     a rewrite of someone else's signed one. Sequenced last.
 */
export type SwitchPhase = 1 | 2 | 3;

export type SwitchBlockedReason =
  | "provider_not_connected"
  | "routing_not_granted"
  | "shape_not_supported_yet"
  | "first_switch_needs_confirmation";

export interface SwitchPlanEntry {
  /** `switches.id`. The container echoes this back as `route_reason`. */
  id: string;
  phase: SwitchPhase;
  /** Requests matching BOTH of these are candidates for this switch. */
  match: {
    /** Canonical source model key, plus every spelling that resolves to it. */
    model_keys: string[];
    /** Canonical source host key, plus every hostname that resolves to it. */
    hosts: string[];
  };
  /** What the request becomes. Model string is sent verbatim upstream. */
  target: {
    model_key: string;
    host: string;
  };
  /** Gate state of the destination provider for this workspace. */
  gate: ProviderGateState;
  /** True only when every gate for this switch is satisfied today. */
  executable: boolean;
  /** Present whenever `executable` is false. Never free text. */
  blocked_reason?: SwitchBlockedReason;
  /**
   * Autonomous mode still asks once before the first switch to a destination
   * this workspace has never executed a switch to.
   */
  needs_confirmation: boolean;
}

export interface SwitchPlan {
  /** Plan contract version, moved independently of the ingest payload version. */
  v: 1;
  org_id: string;
  generated_at: string;
  /** How long the container may serve this plan from memory. */
  poll_interval_ms: number;
  switches: SwitchPlanEntry[];
}

/** Shapes whose requests a container can legitimately rewrite in Phase 2. */
export const REWRITABLE_SHAPES = ["openai", "anthropic"] as const;

/**
 * Which phase a switch belongs to, from canonical keys only.
 *
 * Same host is Phase 1 whatever the shape: the container is not constructing a
 * new request, it is changing one string in a body it already forwards.
 */
export function phaseFor(input: {
  fromHost: string;
  toHost: string;
  toShape: string | null;
}): SwitchPhase {
  if (input.fromHost === input.toHost) return 1;
  if (input.toShape && (REWRITABLE_SHAPES as readonly string[]).includes(input.toShape)) return 2;
  return 3;
}

/**
 * The single place executability is decided. Pure, so every rule below is
 * provable without a database — including the one that matters most: a
 * cross-provider switch to a connected-but-not-granted provider is NOT
 * executable. Using a provider elsewhere is not permission to send traffic
 * there.
 */
export function decideExecutable(input: {
  phase: SwitchPhase;
  gate: ProviderGateState;
  autonomous: boolean;
  everSwitchedTo: boolean;
}): { executable: boolean; needsConfirmation: boolean; reason?: SwitchBlockedReason } {
  const { phase, gate, autonomous, everSwitchedTo } = input;
  const needsConfirmation = autonomous && !everSwitchedTo;

  if (gate === "not_connected") {
    return { executable: false, needsConfirmation, reason: "provider_not_connected" };
  }
  if (phase === 3) {
    return { executable: false, needsConfirmation, reason: "shape_not_supported_yet" };
  }
  if (phase === 2 && gate !== "granted") {
    return { executable: false, needsConfirmation, reason: "routing_not_granted" };
  }
  if (needsConfirmation) {
    return { executable: false, needsConfirmation, reason: "first_switch_needs_confirmation" };
  }
  return { executable: true, needsConfirmation };
}
