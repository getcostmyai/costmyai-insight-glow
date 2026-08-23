import type { PlanTier } from "./engine/types";

/**
 * The one feature-bullet list per plan that every surface renders from.
 *
 * There used to be two: `INCLUDES` in src/routes/pricing.tsx and
 * `PLAN_FEATURES` in src/routes/index.tsx. They drifted, and the drift was not
 * cosmetic — between them they mis-stated seat allowances, put objective
 * selection one rung too high, and sold invoice reconciliation as a Govern
 * feature when the entitlement row grants it from Certify.
 *
 * Every bullet below is checked against `public.plan_entitlements` (the row the
 * gate actually reads) and against the `requirePlan(...)` call on the mutation
 * that performs the action. Where the two pages disagreed, the entitlement row
 * decided — not whichever file looked more complete.
 *
 * Verified against plan_entitlements at the time of writing:
 *
 *   plan       host_arb quality manual auto  objectives recon  max_seats
 *   compare    true     false   false  false false      false  3
 *   certify    true     true    false  false true       true   10
 *   rightsize  true     true    true   false true       true   25
 *   govern     true     true    true   true  true       true   null
 *
 * Seat numbers are the sold allowance recorded in that table; they are not
 * enforced in application code today, so treat them as a commercial statement
 * that a future enforcement change must keep in step with.
 */
export const PLAN_FEATURES: Record<PlanTier, readonly string[]> = {
  compare: [
    "Same model, cheaper host — across every priced host",
    "Live price catalog, re-synced continuously across every tracked provider",
    "Metadata-only ingest, no provider keys",
    "Spend, tokens and requests over 24h / 7d / 30d",
    "Up to 3 workspace members",
  ],
  certify: [
    "Everything in Compare",
    "Quality-matched cheaper models, cheapest that clears the bar",
    "Published evaluation, score and measurement margin per claim",
    "Refusals with reasons when nothing clears",
    "Objectives: cost, latency ceiling, quality floor",
    "Invoice reconciliation against your own provider bills",
    "Up to 10 workspace members",
  ],
  rightsize: [
    "Everything in Certify",
    "Oversized-workload detection per task class",
    "Manual switch activation, pause and one-click rollback",
    "Up to 25 workspace members",
  ],
  govern: [
    "Everything in Rightsize",
    "Autonomous switching inside the equivalence band",
    "Re-checked at the moment of action, not only at evaluation",
    "Full audit trail of every automated decision",
    "Unlimited workspace members",
  ],
} as const;
