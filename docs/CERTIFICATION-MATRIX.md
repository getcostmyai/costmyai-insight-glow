# Certification matrix — correction to the four-cell canon

Captured 17 August 2026. Applies to `src/lib/benchmarks/task-ladder.ts` and
`src/lib/engine/equivalence.ts`.

## The canon says four cells. The engine has three paths.

| Validity | Discrimination | Verdict | Code path |
| --- | --- | --- | --- |
| Valid | Discriminating | CERTIFY | `resolveLadder` returns a `field`; `findQualityMatches` proceeds |
| Valid | Saturated | REFUSE `benchmark_not_discriminating` | every rung's separation < `SEPARATION_THRESHOLD` (10.0) |
| Invalid | Discriminating | REFUSE `no_valid_instrument` | same branch as below |
| Invalid | Saturated | REFUSE `no_valid_instrument` | same branch as above |

Cells 3 and 4 are **intentionally indistinguishable**. Validity is evaluated
first and short-circuits: with no admissible instrument for the task there is
no separation to read, so both return the same `refusal`, the same `detail`
and an empty `tried` list.

Distinguishing them would mean printing the separation of an instrument we
have just ruled inadmissible for that work — which reads as "we measured you
against X, and X was fine" when nothing was measured. That is the borrowed
instrument claim the ladder exists to prevent. Engineering call, no product
decision needed.

## Cell 2 has no real example today

Live separations on 17 August 2026 (whole-population spread, non-fixture rows):

| Instrument | Separation | Margin |
| --- | --- | --- |
| Terminal-Bench v2.1 | 85.768 | ±10.368 |
| AA Long Context Reasoning | 83.333 | ±9.698 |
| GPQA Diamond | 60.000 | ±5.901 |
| Humanity's Last Exam | 53.700 | ±1.607 |
| τ³-Banking | 50.309 | ±8.146 |
| SciCode | 43.200 | ±5.222 |

The narrowest is four times the threshold, so no live task can land in cell 2.
The GPQA saturation published in Intelligence Note 2 is a *top-cohort subset*
effect; the engine measures full-population spread and does not fire on it.

Cell 2 is therefore covered by an explicitly constructed fixture in
`src/lib/benchmarks/__tests__/certification-golden.test.ts`, labelled
SYNTHETIC there and never presented as evidence about the live ledger. If
SciCode's separation ever approaches 10.0, the golden suite fails on the
`Math.min(...)` guard and cell 2 gets a real row.

## Golden dataset

`src/lib/benchmarks/__tests__/golden/certification-2026-08-17.json` — a dated
snapshot of the real score, margin, price and usage rows behind the scenarios.
Tests assert on computed **separations and verdicts**, never on an individual
model's raw score, so a routine AA sync cannot break them.
