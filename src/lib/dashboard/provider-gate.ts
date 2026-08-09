/**
 * Provider gating for switch execution (Dispatch 155).
 *
 * Pure and client-safe on purpose: the copy and the precedence live here, next
 * to `PENDING_SWITCH_LABEL`, so Rightsize, Govern and `/demo` cannot drift into
 * three different accounts of the same state.
 *
 * Two distinct, customer-driven facts decide whether a switch can actually be
 * executed. They are separate because they mean different things:
 *
 *   connected — this workspace has real, observed traffic to that provider.
 *               Sticky: once seen, always connected. A workspace whose rollups
 *               are a few days old has not stopped having an account, and a
 *               label that flips back to "not connected" over a quiet weekend
 *               would be a lie about the customer's own setup.
 *   granted   — the customer has separately given one container its own key
 *               for that destination (`COSTMYAI_ROUTE_KEY_<PROVIDER>`). Using a
 *               provider elsewhere is not permission to send traffic to it.
 *
 * Recommendation is never gated by either. Compare, Certify, Rightsize and
 * Govern keep recommending across the whole market; only execution waits.
 */

export type ProviderGateState = "not_connected" | "connected" | "granted";

export interface ProviderGate {
  /** Canonical host key, resolved server-side. Never re-derived downstream. */
  host: string;
  state: ProviderGateState;
  /** Most recent observed traffic to this provider, or null if never seen. */
  lastSeenAt: string | null;
  /** Seen within the rolling window. Informational only — never gates anything. */
  activeRecently: boolean;
  /**
   * This workspace has previously executed a real switch to this provider.
   * The first autonomous switch to an untested destination asks once.
   */
  everSwitchedTo: boolean;
}

/** First detection looks back this far. It is a floor, not an expiry. */
export const PROVIDER_SEEN_WINDOW_DAYS = 30;

export const providerGateCopy = {
  not_connected: (provider: string, currentProvider: string) => ({
    label: `Connect ${provider} first`,
    detail:
      `This switch sends traffic to ${provider}. Connect it the way you connected ` +
      `${currentProvider} — your account, your key, your container. We never hold the credential.`,
  }),
  connected: (provider: string) => ({
    label: `Allow routing to ${provider}`,
    detail:
      `${provider} is connected and reporting. To let a switch send traffic there, give that ` +
      `container its own ${provider} key. It stays in your environment; we never see it.`,
  }),
} as const;

/**
 * Shown on any recommendation whose destination this workspace has never used.
 *
 * A brand-new account starts at the provider's entry rate limit, which is a
 * real operational cost of taking the saving and belongs next to the number,
 * not in a runbook nobody opens.
 */
export const NEW_PROVIDER_RATE_TIER_NOTE =
  "You have not used this provider yet. New accounts typically start on the provider's lowest rate tier, so check its limits against this workload before moving traffic.";

/**
 * The first autonomous switch to a provider this workspace has never executed a
 * switch to is confirmed by a human, once. Every later switch to the same
 * provider runs unattended as normal — this narrows the untested case, it does
 * not weaken autonomous mode.
 */
export function needsFirstSwitchConfirmation(
  gate: Pick<ProviderGate, "everSwitchedTo">,
  autonomous: boolean,
): boolean {
  return autonomous && !gate.everSwitchedTo;
}

export const FIRST_SWITCH_CONFIRM_LABEL = "Confirm first switch to this provider";

/** Can this switch actually move traffic right now? */
export function isExecutable(gate: ProviderGate | undefined): boolean {
  return gate?.state === "granted";
}
