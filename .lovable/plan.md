# Intelligence Notes — topic mapping and build sequence (Dispatch 142)

Architecture was approved in the previous plan (labels, exhibit primitive, lead detector, monthly cadence tied to the freeze). This plan does not re-litigate it. It maps the researched topics onto it, reports honestly which ones have a real exhibit available today, and sequences the build.

## Data readiness, measured

Checked against production before writing anything:

```text
price_history           1,569 rows, 253 real moves across 43 models, 7 distinct days
                        earliest observation 2026-07-31 — tracked history is one week
                        1,290 of the rows are "new" (catalogue backfill), not moves
benchmarks              2 sync runs: 2026-08-06 (7 rows, partial) and 2026-08-07 (822 rows)
                        overlapping model/suite/task pairs across runs: 0
model_catalog           383 models, all first_seen within 30 days (backfill), 16 inactive
host_prices             355 models served by more than one real provider
usage_events            6 real (non-synthetic) events, 0 unparsed
billing_captures        0 real captures; 1 reconciliation
monthly_kpi_snapshot    6 frozen months
```

Two consequences that decide the sequence: there is no benchmark history yet (zero comparable pairs across runs), and there is no real billed-invoice corpus yet (zero real captures). Every topic that depends on either is pending a real trigger, not writable today.

## Topic mapping

| # | Topic | Label | Data source | Exhibit artifact | Ready? |
|---|---|---|---|---|---|
| T1.1 | Quality-equivalence verdicts operationalized | proven-mechanism | `benchmarks` x `benchmark_margins`, `separationOfScores`, the engine's refusal path | A real refusal: an instrument whose measured spread is inside `SEPARATION_FACTOR x margin`, shown with the numbers, next to a pairing the same engine did certify | Yes — the saturation table on the live page already carries real measured ratios |
| T1.2 | Billing-accuracy findings | proven-mechanism | The captured Gemini envelope; `src/lib/ingest/__tests__/dispatch-109.test.ts` | The verbatim `usageMetadata` object: `candidatesTokenCount: 1`, `thoughtsTokenCount: 67`, plus the Cohere v2 envelope that fell through to the heuristic tier | Yes |
| T1.3 | Silent model drift | proven-mechanism *when it fires*; nothing publishable before | `benchmarks` re-measured over time, Govern's verify-at-action path | A model whose measured score moved across two runs with no version change | **No.** Zero overlapping pairs exist. Needs roughly 3-4 weeks of benchmark runs before a delta is even expressible. Write the architecture piece (T1.3b) instead, and hold the finding |
| T1.3b | Why an announced-deprecation tracker structurally cannot see drift | correlated | Competitor feature surfaces + our own verify-at-action design | Side-by-side: what a deprecation calendar observes (announcements) vs what a verdict re-check observes (a live measurement at action time). Argument, not a caught instance — labeled as analysis | Yes, if it makes no claim to have caught one |
| T1.4 | Silent price cut via capability increase at flat sticker | correlated | `price_history` (flat) joined to `benchmarks` (rising) for the same vendor line | A vendor line where price held while measured score rose | **No.** Requires benchmark history we do not have. The Anthropic Opus example is third-party reporting; usable only as a `third-party` sidebar, never as our measurement |
| T1.5 | Verification against primary sources | proven-mechanism | The competitor claim vs Microsoft's official FAQ | Both quotes side by side with URLs and retrieval dates | Yes — but see the risk note below |
| T2.1 | Reasoning/agentic token overhead | proven-mechanism | Same as T1.2, framed as market mechanism rather than parser bug | The Gemini envelope + a price-per-token vs tokens-per-task decomposition | Yes |
| T2.2 | Price war / silent cuts | correlated | `price_history` — 253 real moves, 58 of them above 25% | The real move distribution over the tracked window, with the window's true length stated | Partial. Honest only if it says "one week of tracked history" out loud; otherwise wait for the second frozen month with full coverage |
| T2.3 | Regional / deployment-tier pricing confusion | third-party + proven-mechanism hybrid | Vendor primary docs; our own `region` column | Primary-doc quotes plus our own per-region rows where we hold them | Yes, with the `third-party` label on the vendor-doc portions |
| T2.4 | Hidden cost layers beyond token price | correlated | Confirmed for Azure only | The Azure line item, explicitly scoped to Azure | Partial — publish scoped to what is confirmed, do not generalize to AWS/GCP |
| T2.5 | Deprecation calendars | — | 16 inactive models in `model_catalog` | Delisting timestamps we observed directly | Skip as a standalone. Parity with an existing competitor is not worth a note. Fold the 16 real delistings into T1.3b as supporting evidence |

## Honest answer on #3 and #4

Neither is writable today, and neither should be forced.

**Silent drift (T1.3)** has zero measurable history: the first benchmark run wrote 7 rows, the second wrote 822, and they share no model/suite/task pair. The earliest a real drift exhibit can exist is after several consecutive full runs, and the detector has to be watching before then or the instance passes unrecorded. The correct action now is to build the detector for it, not the note.

**Silent price cuts (T1.4)** needs price and quality tracked simultaneously over the same window. Price history is one week; quality history is one run. The Anthropic example is real but it is someone else's observation — presenting it as a CostMyAI finding would be exactly the failure the labeling rule exists to prevent.

Both stay on the board as detector targets with a written trigger condition, and get written when a real instance fires.

## Risk flagged on T1.5

Publishing "a competitor site states X, the vendor's own FAQ says Y" is factually defensible and strategically loaded. It reads as a takedown of a named single-person project. Recommended: keep the primary-source verification discipline as a *method* note, using the vendor-doc contradiction anonymized to "a widely cited tracker," and let the reader verify. Same evidentiary value, no target on a person. If the founder wants it named, that is a deliberate call and should be made explicitly, not by default.

## Sequenced build

**Phase 0 — infrastructure (blocking, ~1 week).** Notes corpus, routes, renderer, `Exhibit` primitive, label enforcement tests, decomposition chart, sitemap entries. Nothing publishes without this.

**Phase 1 — Note 1: reasoning-token overhead (T2.1 / T1.2 merged).** Confirmed as the bootstrap piece, and the research strengthens it: the mainstream narrative is saturated, so the note leads with the *verification* angle — everyone says tokens per task are rising; here is the envelope that proves the reported count was wrong, from our own connector. Ready today. Attaches to the newest frozen month.

**Phase 2 — lead detector, built against the two topics that are not ready.** Detectors for score-delta-without-version-change (T1.3) and flat-price-rising-quality (T1.4), plus the price-move and spread detectors from the original plan. Each writes a lead with evidence and a trigger threshold. This is the step that converts "not ready" into "will be caught when it happens."

**Phase 3 — Note 2: quality-equivalence verdicts (T1.1).** Ready today, uses the saturation and band-winner data already on the live page. Deliberately second: it is the strongest structural differentiator but it needs Note 1 to have established the evidentiary style first.

**Phase 4 — Note 3: primary-source verification as method (T1.5, anonymized).** Ready today, short, and it makes the labeling discipline itself the subject.

**Phase 5 — held for a real trigger.** T1.3 and T1.4 notes, written when the detector fires. T2.2 becomes writable once two full frozen months of price history exist (approximately October). T2.3 and T2.4 are backlog, publishable any time capacity allows, scoped strictly to what is confirmed.

## Revision to the earlier plan

One change: Phase 2 (detector) moves ahead of the second and third notes rather than shipping after the whole note set. Nothing else in the approved architecture changes. The reason is timing, not preference — the two most defensible topics can only be evidenced by instances we have not yet observed, and an instance that occurs before the detector exists is lost.
