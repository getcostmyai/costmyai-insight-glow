/**
 * Copy for the three empty states that used to claim a check had run.
 *
 * "We evaluated and found nothing" and "there was nothing to evaluate" are two
 * different facts. Conflating them asserts a measurement that never happened,
 * which the Neutrality Charter forbids, so the wording lives here as pure
 * functions of the real evaluated count and is asserted by tests.
 */

/** Headline of a locked level block. */
export function lockedHeadline(input: {
  evaluated: number;
  count: number;
  what: string;
}): string {
  if (input.evaluated === 0) return "No traffic in this window, so there was nothing to check";
  if (input.count === 0) return `This check found nothing to ${input.what} in this window`;
  return `${input.count} ${input.what} finding${input.count === 1 ? "" : "s"} on your traffic`;
}

/** The sentence after the plan name in a locked level block. */
export function lockedMeasurementNote(evaluated: number): string {
  return evaluated === 0
    ? "Nothing has been measured yet — the check runs on your own traffic as soon as it starts arriving."
    : "We ran the check anyway — the number beside it is measured, not an estimate.";
}

/** Label under the money figure in a locked level block. */
export function lockedFigureLabel(evaluated: number, period: string): string {
  return evaluated === 0
    ? `nothing measured yet · ${period}`
    : `behind this level · ${period}`;
}

/** List C, when no workload was refused. */
export function nonQualifyingEmptyCopy(evaluated: number): string {
  return evaluated === 0
    ? "No workloads reached us in this window, so nothing was evaluated and nothing was refused."
    : "Every workload in this window produced a certified saving. Nothing was refused.";
}

/** Govern's autonomous gate, when nothing clears it. */
export function governGateEmptyCopy(input: {
  consideredCount: number;
  minMonthlySavingLabel: string;
}): string {
  return input.consideredCount === 0
    ? "No candidates were put in front of the gate in this window — the earlier levels found nothing to evaluate, so nothing was accepted and nothing was refused."
    : `Nothing currently clears the gate. That is a real answer, not an empty state — every candidate either fell below ${input.minMonthlySavingLabel}/mo or could not be certified.`;
}
