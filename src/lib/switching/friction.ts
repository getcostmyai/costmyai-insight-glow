/**
 * Switching-friction tier (Dispatch 193) — DISPLAY ONLY.
 *
 * A badge shown next to a comparison or recommendation that answers one
 * question a saving figure cannot: how much work is this switch likely to be?
 *
 * Hard constraints, all of them deliberate:
 *
 *  1. Nothing in this module may ever be read by the engine. It is computed
 *     AFTER ranking, from already-ranked rows, and no ranking, sorting,
 *     filtering, gating or certification code path takes an input from it.
 *     `src/lib/switching/__tests__/friction-display-only.test.ts` fails the
 *     build if any engine file so much as imports this file.
 *  2. No labour estimate. Never an hour count, a day count, a story point or
 *     a cost. The re-validation flag is binary and unquantified, because a
 *     number here would be a fabrication and this product does not print
 *     fabricated numbers next to real ones.
 *  3. Provider-identity-blind. The tier is derived from the response-envelope
 *     shape the connector actually proved (Dispatches 176–180) and from the
 *     catalog's own capability columns — never from which vendor's name is on
 *     the endpoint.
 *  4. Anything not observed is reported as not observed. Tool calling and
 *     prompt caching are not visible in metered traffic (the connector holds
 *     token counters, never bodies), so they are listed as unobservable
 *     rather than silently passed or silently failed.
 */

import { shapeForHost, type KnownShape, type ShapeConfidence } from "@/lib/ingest/provider-shapes";

export type FrictionTier = "low" | "moderate" | "high";

export type ParityStatus = "ok" | "risk" | "unobservable" | "unknown";

export interface ParityCheck {
  /** What was compared, in the words a customer reads. */
  label: string;
  status: ParityStatus;
  /** The real fact behind the status. Never a guess dressed as a measurement. */
  detail: string;
}

export interface FrictionBadge {
  tier: FrictionTier;
  /** Short label rendered inside the badge. */
  label: string;
  /** One line explaining the tier, shown on hover / expanded. */
  summary: string;
  /** API-compatibility distance, from the proven envelope-shape table. */
  apiDistance: "same-shape" | "compatible-endpoint" | "different-shape" | "unknown";
  /** Per-workload feature-parity findings, in display order. */
  parity: ParityCheck[];
  /** Binary and unquantified. Never accompanied by an effort estimate. */
  revalidationRecommended: boolean;
}

/** What the workload was actually observed doing, from metered traffic only. */
export interface WorkloadSignals {
  /** Largest single request+response token total seen in the window. */
  peakTotalTokens: number | null;
  /** How many metered events that peak was drawn from. */
  events: number;
}

/** The capability columns the catalog really has for a model. */
export interface ModelCapabilities {
  modality: string | null;
  contextWindow: number | null;
  isReasoning: boolean | null;
}

export interface FrictionInput {
  /** Raw host keys, as stored in `current_prices.host`. */
  fromHost: string;
  toHost: string;
  fromModel: string;
  toModel: string;
  /** Same weights on another host, or a different model entirely. */
  sameModel: boolean;
  signals: WorkloadSignals | null;
  from: ModelCapabilities | null;
  to: ModelCapabilities | null;
  /** Mapper confidence for each side's response-envelope shape. */
  fromConfidence?: ShapeConfidence | null;
  toConfidence?: ShapeConfidence | null;
}

const TIER_LABEL: Record<FrictionTier, string> = {
  low: "Low friction",
  moderate: "Some friction",
  high: "Higher friction",
};

function apiDistance(fromHost: string, toHost: string): FrictionBadge["apiDistance"] {
  if (fromHost === toHost) return "same-shape";
  const a = shapeForHost(fromHost);
  const b = shapeForHost(toHost);
  if (!a || !b) return "unknown";
  if (a.shape === b.shape) return "same-shape";
  // A different native envelope that also publishes an endpoint speaking the
  // incumbent's shape is a client-config change, not a rewrite — but only when
  // the incumbent's own shape is the one that endpoint speaks (OpenAI).
  if (b.openAiCompatibleAlso && (a.shape as KnownShape) === "openai") return "compatible-endpoint";
  return "different-shape";
}

function confidenceChecks(input: FrictionInput): ParityCheck[] {
  const checks: ParityCheck[] = [];
  const sides: Array<{ label: string; host: string; confidence: ShapeConfidence | null }> = [
    {
      label: "Incumbent envelope confidence",
      host: input.fromHost,
      confidence: input.fromConfidence ?? null,
    },
    {
      label: "Candidate envelope confidence",
      host: input.toHost,
      confidence: input.toConfidence ?? null,
    },
  ];

  const dedupedSides =
    sides[0].host === sides[1].host && sides[0].confidence === sides[1].confidence
      ? [{ ...sides[0], label: "Envelope confidence" }]
      : sides;

  for (const side of dedupedSides) {
    if (side.confidence === "assumed") {
      checks.push({
        label: side.label,
        status: "unknown",
        detail: `The response envelope shape for ${side.host} has not been confirmed by a real metered call — it is assumed, not verified. Whether this switch is structurally as simple as it looks has not been confirmed.`,
      });
    } else if (side.confidence === "documented" || side.confidence === "verified") {
      checks.push({
        label: side.label,
        status: "ok",
        detail:
          side.confidence === "verified"
            ? `The response envelope shape for ${side.host} has been confirmed by a real metered call.`
            : `The response envelope shape for ${side.host} is documented by the vendor but not yet confirmed by a live metered call.`,
      });
    }
    // confidence === null: host has no shape entry at all; apiDistance()
    // already returns "unknown" for this pair and forces tier "high" on its
    // own, so a second warning here would be redundant — emit nothing.
  }

  return checks;
}

function parityChecks(input: FrictionInput): ParityCheck[] {
  const checks: ParityCheck[] = [];
  const { from, to, signals, sameModel } = input;

  // 1. Context length, against what this workload really sent — not a catalog
  //    spec sheet compared to another catalog spec sheet.
  if (sameModel) {
    checks.push({
      label: "Context length",
      status: "ok",
      detail: "Identical weights on another host — the context window does not change.",
    });
  } else if (signals?.peakTotalTokens && to?.contextWindow) {
    const fits = to.contextWindow >= signals.peakTotalTokens;
    checks.push({
      label: "Context length",
      status: fits ? "ok" : "risk",
      detail: fits
        ? `Largest request measured on this workload was ${signals.peakTotalTokens.toLocaleString()} tokens; the candidate accepts ${to.contextWindow.toLocaleString()}.`
        : `Largest request measured on this workload was ${signals.peakTotalTokens.toLocaleString()} tokens; the candidate accepts only ${to.contextWindow.toLocaleString()}.`,
    });
  } else {
    checks.push({
      label: "Context length",
      status: "unknown",
      detail: signals?.peakTotalTokens
        ? "The catalog publishes no context window for the candidate."
        : "No metered request on this workload to size the context against yet.",
    });
  }

  // 2. Modality. The workload's incumbent model states what it accepts; a
  //    candidate that accepts less is a real parity break.
  if (from?.modality && to?.modality) {
    const same = from.modality === to.modality;
    checks.push({
      label: "Input modality",
      status: same ? "ok" : "risk",
      detail: same
        ? `Both run ${from.modality}.`
        : `Incumbent is ${from.modality}, candidate is ${to.modality}.`,
    });
  } else {
    checks.push({
      label: "Input modality",
      status: "unknown",
      detail: "The catalog does not publish a modality for one side of this pair.",
    });
  }

  // 3. Reasoning behaviour: swapping a reasoning model for a non-reasoning one
  //    changes output shape and latency, whatever the benchmark says.
  if (!sameModel && from?.isReasoning != null && to?.isReasoning != null) {
    const same = from.isReasoning === to.isReasoning;
    checks.push({
      label: "Reasoning mode",
      status: same ? "ok" : "risk",
      detail: same
        ? from.isReasoning
          ? "Both are reasoning models."
          : "Neither is a reasoning model."
        : from.isReasoning
          ? "Incumbent is a reasoning model; the candidate is not."
          : "Candidate is a reasoning model; the incumbent is not.",
    });
  }

  // 4. Whether each side's envelope shape was ever actually confirmed.
  checks.push(...confidenceChecks(input));

  // 5. Things the meter genuinely cannot see. Said plainly, once.
  checks.push({
    label: "Tool calling & prompt caching",
    status: "unobservable",
    detail:
      "The Verification Engine meters token counters, never request or response bodies, so whether this workload uses function calling or prompt caching is not something we have measured. Check it yourself before switching.",
  });

  return checks;
}

/**
 * Compute the badge. Pure, synchronous, and consumed only by the renderer.
 */
export function frictionBadge(input: FrictionInput): FrictionBadge {
  const distance = apiDistance(input.fromHost, input.toHost);
  const parity = parityChecks(input);
  const risks = parity.filter((c) => c.status === "risk").length;
  const unknowns = parity.filter((c) => c.status === "unknown").length;

  let tier: FrictionTier;
  if (distance === "different-shape" || distance === "unknown" || risks > 0) tier = "high";
  else if (!input.sameModel || distance === "compatible-endpoint" || unknowns > 0) tier = "moderate";
  else tier = "low";

  const distanceLine =
    distance === "same-shape"
      ? input.fromHost === input.toHost
        ? "Same endpoint, same request and response shape."
        : "Both endpoints speak the same request and response shape."
      : distance === "compatible-endpoint"
        ? "Different native API, but the candidate publishes an endpoint in the shape you already call."
        : distance === "different-shape"
          ? "The candidate's API speaks a structurally different request and response shape."
          : "We have not established the candidate's envelope shape.";

  // Re-validation is recommended whenever the weights change or a parity check
  // came back anything other than clean. Binary, and never given a duration.
  const revalidationRecommended = !input.sameModel || risks > 0 || unknowns > 0;

  const summary = revalidationRecommended
    ? `${distanceLine} Re-validation recommended.`
    : `${distanceLine} No re-validation indicated.`;

  return {
    tier,
    label: TIER_LABEL[tier],
    summary,
    apiDistance: distance,
    parity,
    revalidationRecommended,
  };
}
