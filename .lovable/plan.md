# Dispatch 119 — Stop three strings claiming a check ran when nothing was there to check

Three empty-state strings assert a measurement happened. On a workspace with zero ingested traffic that assertion is false. Each one gets split into two honest branches: "there was nothing to evaluate" vs. "we evaluated and found nothing".

## The signal used to tell the two apart

The dashboard snapshot already carries the count of workloads the engine actually looked at:

- `data.stats.workloads` — workloads in the window (`src/lib/engine/pipeline.ts:66`)
- `data.composition.consideredCount` — candidates Govern evaluated (`src/lib/dashboard/composition.ts:32`)

No new computation, no new query — both are already on screen elsewhere.

## The three fixes

### 1. Locked level copy — `src/components/dashboard/LevelState.tsx:74-81`

`LevelLocked` gains an `evaluated: number` prop (workloads behind the check). Its three call sites — Compare (`CompareLevel.tsx:148`), Certify (`CertifyLevel.tsx`), Rightsize (`RightsizeLevel.tsx:350`) — pass `data.stats.workloads`.

- `evaluated > 0`: keep today's sentence, including "We ran the check anyway — the number beside it is measured, not an estimate."
- `evaluated === 0`: headline becomes "No traffic in this window, so there was nothing to check", and the body drops the measurement claim entirely and says the level unlocks the detail once traffic arrives. The blurred dollar figure is $0 in that case and is labelled as such rather than as a withheld measurement.

### 2. List C empty state — `src/components/dashboard/TransparencyLists.tsx:199-203`

- `stats.workloads > 0`: keep "Every workload in this window produced a certified saving. Nothing was refused."
- `stats.workloads === 0`: "No workloads reached us in this window, so nothing was evaluated and nothing was refused."

The `n refused` badge stays accurate in both cases.

### 3. Govern gate empty — `src/components/dashboard/levels/GovernLevel.tsx:294-300`

- `composition.consideredCount > 0`: keep "That is a real answer, not an empty state — every candidate either fell below $X/mo or could not be certified."
- `consideredCount === 0`: "No candidates were put in front of the gate in this window — the earlier levels found nothing to evaluate, so nothing was accepted and nothing was refused." No claim about thresholds that were never applied.

## Verification

- Unit tests asserting each component renders the zero-evaluated branch when the count is 0 and the measured branch when it is greater than 0, so the wording can't silently regress.
- Playwright against a real (non-demo) signed-in workspace with zero ingested events, screenshotting each of the three strings in place: Certify locked block, List C empty card, Govern gate empty card.
