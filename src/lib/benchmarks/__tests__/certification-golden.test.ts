/**
 * Golden certification suite.
 *
 * Every scenario below is tagged REAL or SYNTHETIC and the two are never
 * treated as equivalent proof:
 *
 *   REAL      — the workload, price, score and margin rows are verbatim from
 *               the live ledger, captured in
 *               golden/certification-2026-08-17.json on 17 August 2026.
 *   SYNTHETIC — constructed by hand because the live population cannot
 *               currently produce that state. Exactly two things are
 *               synthetic here: the saturated-instrument fixture (cell 2) and
 *               the two `__spread_*__` anchor rows described below.
 *
 * Pinning rule: assertions are on computed SEPARATIONS and on verdicts, never
 * on an individual model's raw score. One model moving in the next AA sync
 * must not break this file; only an instrument's spread crossing
 * SEPARATION_THRESHOLD should, which is exactly the event worth failing on.
 */
import { describe, expect, it } from "vitest";

import golden from "./golden/certification-2026-08-17.json";
import { buildScoreLookup, findQualityMatches } from "../../engine/equivalence";
import type { BenchmarkRow, MarginRow, PriceRow, UsageAggregate } from "../../engine/types";
import {
  AA_FIELDS,
  resolveLadder,
  SEPARATION_THRESHOLD,
  type AaField,
} from "../task-ladder";

type Instrument = { separation: number; scored_models: number; min_score: number; max_score: number; suite: string; margin: number };
const INSTRUMENTS = golden.instruments as Record<AaField, Instrument>;

/**
 * SYNTHETIC (scaffolding only): two anchor rows per instrument reproducing the
 * captured population's min and max. Separation is a whole-population
 * measurement, so certifying against a two-model fixture would report a
 * separation production never saw. These anchors restore the real spread
 * without committing ~700 score rows. They carry no verdict of their own —
 * they are never cheaper than anything, because they have no price row.
 */
const benchmarks: BenchmarkRow[] = [
  ...(golden.scores as BenchmarkRow[]),
  ...Object.entries(INSTRUMENTS).flatMap(([field, i]) => [
    { model_key: "__spread_min__", suite: i.suite, task_class: field, score: i.min_score },
    { model_key: "__spread_max__", suite: i.suite, task_class: field, score: i.max_score },
  ]),
];
const margins: MarginRow[] = Object.entries(INSTRUMENTS).map(([field, i]) => ({
  suite: i.suite,
  task_class: field,
  margin: i.margin,
}));
const prices = golden.prices as PriceRow[];
const usage = golden.usage as UsageAggregate[];

const workload = (modelKey: string, taskHint: string) => {
  const found = usage.filter((u) => u.model_key === modelKey && u.task_hint === taskHint);
  expect(found.length).toBeGreaterThan(0);
  return found;
};
const only = (keys: string[]) => prices.filter((p) => keys.includes(p.model_key));
const run = (u: UsageAggregate[], p: PriceRow[] = prices) =>
  findQualityMatches(u, p, benchmarks, margins);

describe("golden separations (REAL, pinned 2026-08-17)", () => {
  const lookup = buildScoreLookup(benchmarks, margins);

  it.each(AA_FIELDS)("reproduces the captured separation for %s", (field) => {
    expect(lookup.separation(field)).toBeCloseTo(INSTRUMENTS[field].separation, 3);
  });

  it("every live instrument discriminates today, by a wide margin", () => {
    for (const field of AA_FIELDS) {
      expect(INSTRUMENTS[field].separation).toBeGreaterThan(SEPARATION_THRESHOLD);
    }
    // The narrowest live instrument. If this ever approaches 10.0, cell 2
    // stops being synthetic and this file needs a real row for it.
    expect(Math.min(...AA_FIELDS.map((f) => INSTRUMENTS[f].separation))).toBeCloseTo(43.2, 1);
  });
});

describe("cell 1 — Valid + Discriminating => CERTIFY (REAL)", () => {
  it("generation resolves to Long Context Reasoning and certifies gpt-5.1 @ azure", () => {
    const resolution = resolveLadder("generation", (f) => INSTRUMENTS[f].separation);
    expect(resolution.field).toBe("lcr");
    expect(resolution.rung).toBe(0);

    const { recommendations } = run(workload("openai/gpt-5.1", "generation"));
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].marginUsed).toBe(INSTRUMENTS.lcr.margin);
    expect(recommendations[0].monthlySavingUsd).toBeGreaterThan(0);
    // Negative delta inside the measured band still certifies, and says so.
    expect(recommendations[0].note).toContain("measurement precision");
  });

  it("code resolves to Terminal-Bench and certifies qwen3-coder-next @ alibaba", () => {
    const resolution = resolveLadder("code", (f) => INSTRUMENTS[f].separation);
    expect(resolution.field).toBe("terminalbench_v2_1");

    const { recommendations } = run(workload("qwen/qwen3-coder-next", "code"));
    const alibaba = recommendations.find((r) => r.fromHost === "alibaba");
    expect(alibaba).toBeDefined();
    expect(alibaba!.marginUsed).toBe(INSTRUMENTS.terminalbench_v2_1.margin);
    expect(alibaba!.qualityDelta).toBeGreaterThan(0);
  });

  it("classification resolves to Long Context Reasoning and certifies gpt-5.6-luna @ azure", () => {
    const { recommendations } = run(workload("openai/gpt-5.6-luna", "classification"));
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].kind).toBe("quality_match");
  });
});

describe("cell 2 — Valid + Saturated => REFUSE (SYNTHETIC)", () => {
  /*
   * CONSTRUCTED, NOT REAL. No live instrument is saturated today — the
   * narrowest separates by 43.2 points against a 10.0 threshold — so this cell
   * has no real-data example and this fixture exists purely so the branch has
   * coverage. It must never be cited as evidence about the live ledger.
   */
  const saturated = (field: AaField, separation: number) => (f: AaField) =>
    f === field ? separation : 0;

  it("refuses a valid task when its only rung sits just under the threshold", () => {
    const r = resolveLadder("classification", saturated("lcr", 9.9));
    expect(r.field).toBeNull();
    expect(r.refusal).toBe("benchmark_not_discriminating");
    expect(r.detail).toContain("threshold 10.0");
  });

  it("certifies at exactly the threshold — the boundary is inclusive", () => {
    expect(resolveLadder("classification", saturated("lcr", 10.0)).field).toBe("lcr");
  });

  it("falls to a later rung rather than refusing when only the first is saturated", () => {
    const r = resolveLadder("reasoning", (f) => (f === "hle" ? 4.2 : 60.0));
    expect(r.field).toBe("gpqa");
    expect(r.rung).toBe(1);
  });

  it("refuses when every rung of a multi-rung ladder is saturated", () => {
    const r = resolveLadder("coding", () => 9.99);
    expect(r.field).toBeNull();
    expect(r.refusal).toBe("benchmark_not_discriminating");
    expect(r.tried).toHaveLength(2);
    expect(r.tried.every((t) => !t.passed)).toBe(true);
  });
});

describe("cells 3 and 4 — Invalid instrument => REFUSE (REAL)", () => {
  it("refuses the four live unlabelled-traffic rollups without reading separation at all", () => {
    const unknown = usage.filter((u) => u.task_hint === "unknown");
    expect(unknown.length).toBeGreaterThan(0);
    const { recommendations, refusals } = run(unknown);
    expect(recommendations).toHaveLength(0);
    for (const r of refusals) {
      expect(r.reason).toBe("no_valid_instrument");
      expect(r.detail).toContain("without a task label");
    }
  });

  it.each(golden.empty_ladder_tasks)("refuses %s, which no evaluation measures", (task) => {
    const r = resolveLadder(task, (f) => INSTRUMENTS[f].separation);
    expect(r.field).toBeNull();
    expect(r.refusal).toBe("no_valid_instrument");
    expect(r.detail).toContain("No independent evaluation currently measures");
  });

  /*
   * Documented, deliberate collapse: validity is evaluated first and
   * short-circuits, so an empty-ladder task refuses identically whether the
   * instruments happen to be discriminating or saturated. See the note in
   * resolveLadder() and docs/CERTIFICATION-MATRIX.md.
   */
  it("returns an identical verdict whether instruments discriminate or are saturated", () => {
    const discriminating = resolveLadder("translation", () => 99);
    const saturatedToo = resolveLadder("translation", () => 0.1);
    expect(discriminating).toEqual(saturatedToo);
    expect(discriminating.tried).toEqual([]);
  });
});

describe("no_baseline_score — both wordings and the sentinel (REAL)", () => {
  it("says 'not covered by the feed' for a model with no certifiable score at all", () => {
    const { refusals } = run(workload("openai/o1-pro", "generation"));
    expect(refusals[0].reason).toBe("no_baseline_score");
    expect(refusals[0].detail).toContain("is not covered by the independent benchmark feed yet");
    expect(refusals[0].detail).not.toContain("but not on");
  });

  it("says 'measured, but not on this instrument' for a model scored elsewhere", () => {
    // gpt-4 carries a real GPQA score but none on LCR, the instrument
    // `generation` has to be judged on.
    const { refusals } = run(workload("openai/gpt-4", "generation"));
    expect(refusals[0].reason).toBe("no_baseline_score");
    expect(refusals[0].detail).toContain("but not on AA Long Context Reasoning");
    expect(refusals[0].detail).not.toContain("not covered by");
  });

  it("treats a stored 0.000 as the not-measured sentinel, never as a real score", () => {
    // qwen3-32b has lcr = 0.000 in the live ledger. A real score would give a
    // negative bar that anything clears.
    const { recommendations, refusals } = run(workload("qwen/qwen3-32b", "classification"));
    expect(recommendations).toHaveLength(0);
    expect(refusals[0].reason).toBe("no_baseline_score");
    expect(refusals[0].detail).toContain("recorded 0.000");
  });
});

describe("post-measurement refusals (REAL rows, restricted candidate set)", () => {
  it("no_cheaper_candidate: quality-equal options exist but none price below the baseline", () => {
    const { refusals } = run(
      workload("openai/gpt-5.1", "generation"),
      only(["openai/gpt-5.1", "anthropic/claude-opus-4.5"]),
    );
    expect(refusals[0].reason).toBe("no_cheaper_candidate");
  });

  it("no_candidate_clears_bar: the only cheaper option scores below the measured band", () => {
    const { refusals } = run(
      workload("openai/gpt-5.6-luna", "classification"),
      only(["openai/gpt-5.6-luna", "openai/gpt-oss-120b"]),
    );
    expect(refusals[0].reason).toBe("no_candidate_clears_bar");
  });

  it("saving_below_floor: a real certification worth under $1/month is refused", () => {
    // SYNTHETIC scaling of a real workload: same model, host, task and prices,
    // volume reduced to one request so the saving falls under the floor.
    const tiny = workload("openai/gpt-5.1", "generation").map((u) => ({
      ...u,
      requests: 1,
      input_tokens: 1_000,
      output_tokens: 200,
      cost_usd: 0.01,
    }));
    const { recommendations, refusals } = run(tiny);
    expect(recommendations).toHaveLength(0);
    expect(refusals[0].reason).toBe("saving_below_floor");
  });
});
