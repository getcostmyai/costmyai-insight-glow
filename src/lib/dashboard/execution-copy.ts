/**
 * What a switch is actually doing to traffic right now, in words (Dispatch 156).
 *
 * Dispatch 150 found the product claiming one blanket capability — "switches
 * it, manually or automatically" — across three materially different cases.
 * Phase 1 became genuinely automatic in Stage 4; Phase 2 still waits on the
 * customer's own routing grant; Phase 3 (Bedrock, Vertex) cannot be executed
 * automatically at all, because those requests are signed per provider and we
 * refuse to rewrite a signed request.
 *
 * One source of truth for all three so no surface can quietly reuse Phase 1's
 * capability as if it applied everywhere. Pure and client-safe: the state is
 * decided server-side from the same `phaseFor` / `decideExecutable` the
 * container's plan is built from, and only rendered here.
 */

import type { SwitchBlockedReason, SwitchPhase } from "@/lib/ingest/switch-plan";
import type { ProviderGateState } from "./provider-gate";

export type SwitchExecutionState =
  /** Phase 1, gate satisfied. Traffic is being rerouted with no further action. */
  | "automatic"
  /** Executable in principle, but only after the customer does something named. */
  | "needs_your_action"
  /** Not executable by CostMyAI at all yet. Recorded and priced, never implied. */
  | "not_available_yet";

export interface SwitchExecution {
  state: SwitchExecutionState;
  phase: SwitchPhase;
  gate: ProviderGateState;
  blockedReason?: SwitchBlockedReason;
  /** Destination provider, for copy that names it. */
  toHost: string;
}

export interface ExecutionCopy {
  state: SwitchExecutionState;
  /** Short status, safe next to a badge. */
  label: string;
  /** The honest sentence: what is happening, and if not, what has to happen. */
  detail: string;
}

/** Display names for the hosts this copy names out loud. */
const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  azure: "Azure OpenAI",
  anthropic: "Anthropic",
  google: "Google (Gemini / Vertex)",
  vertex: "Google Vertex",
  bedrock: "AWS Bedrock",
  deepinfra: "DeepInfra",
  coreweave: "CoreWeave",
  ionstream: "IonStream",
  alibaba: "Alibaba",
  baidu: "Baidu",
  groq: "Groq",
  venice: "Venice",
};

const providerName = (host: string) =>
  PROVIDER_NAMES[host] ??
  host
    .split(/[-_.]/)
    .map((p) => (p.length <= 3 ? p.toUpperCase() : p[0]!.toUpperCase() + p.slice(1)))
    .join(" ");

export function executionCopy(x: SwitchExecution): ExecutionCopy {
  const provider = providerName(x.toHost);

  if (x.state === "automatic") {
    return {
      state: "automatic",
      label: "Rerouting automatically",
      detail:
        `Same provider, same credential: your container rewrites the model on each matching ` +
        `request and sends it to ${provider} itself. Nothing for you to do, and it reverses ` +
        `the moment you pause it.`,
    };
  }

  if (x.state === "not_available_yet") {
    return {
      state: "not_available_yet",
      label: "Not executed by us yet",
      detail:
        `${provider} requests carry the model in the URL and, on Bedrock, a per-request AWS ` +
        `signature. We will not rewrite a signed request or forge a path, so CostMyAI cannot ` +
        `move this traffic automatically today. The saving is measured and priced here, but ` +
        `the change has to be made in your own stack.`,
    };
  }

  switch (x.blockedReason) {
    case "provider_not_connected":
      return {
        state: "needs_your_action",
        label: `Connect ${provider} first`,
        detail:
          `This switch sends traffic to ${provider}, which this workspace has never used. ` +
          `Nothing is being rerouted. Connect it the way you connected the source provider, ` +
          `then allow routing — your account, your key, your container.`,
      };
    case "first_switch_needs_confirmation":
      return {
        state: "needs_your_action",
        label: "Confirm the first switch",
        detail:
          `Everything is in place, but this workspace has never switched to ${provider} before. ` +
          `Autonomous mode asks once, here. Nothing is rerouted until you confirm; every later ` +
          `switch to ${provider} runs unattended as normal.`,
      };
    case "routing_not_granted":
    default:
      return {
        state: "needs_your_action",
        label: `Allow routing to ${provider}`,
        detail:
          `${provider} is connected and reporting, but using a provider elsewhere is not ` +
          `permission to send traffic to it. Give that container its own ${provider} key ` +
          `(COSTMYAI_ROUTE_KEY_${x.toHost.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}) and ` +
          `this switch starts rerouting. Until then it is recorded, not running.`,
      };
  }
}

/** Server-side classification, from the same decision the container is sent. */
export function executionStateFor(input: {
  phase: SwitchPhase;
  executable: boolean;
  blockedReason?: SwitchBlockedReason;
}): SwitchExecutionState {
  if (input.executable) return "automatic";
  if (input.phase === 3 || input.blockedReason === "shape_not_supported_yet") {
    return "not_available_yet";
  }
  return "needs_your_action";
}
