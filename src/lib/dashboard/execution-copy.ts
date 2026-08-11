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

/**
 * Dispatch 159. Four real distances-to-action, not a binary. The state alone
 * cannot carry this: "connect a brand-new vendor" and "flip one config on a
 * container you already run" are both `needs_your_action`, and they are not
 * the same ask.
 */
export type ExecutionTone =
  /** Live. Nothing left to do. */
  | "automatic"
  /** A new vendor relationship has to exist first: the biggest real ask. */
  | "connect_first"
  /** The vendor exists; one config step on infrastructure they already run. */
  | "allow_routing"
  /** One in-product confirmation, here. */
  | "confirm_once"
  /** Not resolvable by the customer at all today: our limitation, not theirs. */
  | "not_available";

export interface ExecutionCopy {
  state: SwitchExecutionState;
  tone: ExecutionTone;
  /** Short status, safe next to a badge. */
  label: string;
  /** One line, sized to sit directly under the button as its subtitle. */
  hint: string;
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

/**
 * Dispatch 196. Whether this switch is already running or is only a candidate.
 *
 * The `automatic` state is a statement about *execution mechanics* — the
 * container rewrites the request itself, no further setup — and never about
 * who decided to switch. Read in the present tense next to a candidate that
 * nobody has activated, "Rerouting automatically" reads as "the system decided
 * this on its own", which is a Govern-only claim and false everywhere else.
 * The tense follows the mode; the autonomy language stays on Govern's own
 * surfaces, where a human really was not in the loop.
 */
export type ExecutionMode = "live" | "prospective";

export function executionCopy(x: SwitchExecution, mode: ExecutionMode = "prospective"): ExecutionCopy {
  const provider = providerName(x.toHost);

  if (x.state === "automatic") {
    return {
      state: "automatic",
      tone: "automatic",
      label: mode === "live" ? "Rerouting now — no further setup" : "Reroutes automatically once active",
      hint:
        mode === "live"
          ? "Your container is rewriting matching requests. Reversible whenever you pause it."
          : "Nothing to set up on your side once you activate it. Reversible whenever you pause it.",
      detail:
        `Same provider, same credential: your container rewrites the model on each matching ` +
        `request and sends it to ${provider} itself. ` +
        (mode === "live"
          ? `That is happening now because this switch was activated — activating it is a ` +
            `decision, not something CostMyAI made for you. It reverses the moment you pause it.`
          : `Activating it is your decision; once activated there is no further setup, and it ` +
            `reverses the moment you pause it.`),
    };
  }


  if (x.state === "not_available_yet") {
    return {
      state: "not_available_yet",
      tone: "not_available",
      label: "Not executed by us yet",
      hint: `A CostMyAI limitation today, not a setting on your side. Measured and priced here; the change is made in your stack.`,
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
        tone: "connect_first",
        label: `Connect ${provider} first`,
        hint: `New vendor: create the ${provider} account and add its key (2-3 minutes), then allow routing.`,
        detail:
          `This switch sends traffic to ${provider}, which this workspace has never used. ` +
          `Nothing is being rerouted. Connect it the way you connected the source provider, ` +
          `then allow routing — your account, your key, your container.`,
      };
    case "first_switch_needs_confirmation":
      return {
        state: "needs_your_action",
        tone: "confirm_once",
        label: "Confirm the first switch",
        hint: `One confirmation, here. Every later switch to ${provider} runs unattended.`,
        detail:
          `Everything is in place, but this workspace has never switched to ${provider} before. ` +
          `Autonomous mode asks once, here. Nothing is rerouted until you confirm; every later ` +
          `switch to ${provider} runs unattended as normal.`,
      };
    case "routing_not_granted":
    default:
      return {
        state: "needs_your_action",
        tone: "allow_routing",
        label: `Allow routing to ${provider}`,
        hint: `${provider} is already connected. One key on the container you already run.`,
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
