# Host spread: bound the formula, split input vs output

## What changes

The "host spread" number on the models page currently divides the price gap by the
cheapest host, so it can read far above 100% (e.g. 1367%). It gets rebased on the
dearest host, so it always reads 0-100%. A second, separate spread on output price
is added next to it. Nothing is blended or averaged.

## Confirmed current state

- `src/routes/models.tsx:63-68` — `hostSpread()` returns `((max - cheapestInput) / cheapestInput) * 100`.
- `src/lib/catalog/catalog.server.ts:26-27` — `CatalogRow` already has both `cheapestInput` and `cheapestOutput`.
- `src/lib/catalog/catalog.server.ts:141-142` — `cheapestOutput` is already derived from the same `realHosts` array as `cheapestInput`. **No change needed in catalog.server.ts.**

### Every render site of the spread value (full grep, not just the two known ones)

| file:line | what it renders |
|---|---|
| `src/routes/models.tsx:51` | sort option label "Biggest host spread" |
| `src/routes/models.tsx:96-97` | headline stat `topSpread` (max over all rows) |
| `src/routes/models.tsx:162` | headline stat label "Widest host spread" |
| `src/routes/models.tsx:208` | explainer copy "The host spread is the arbitrage" |
| `src/routes/models.tsx:340` | sort comparator using `hostSpread` |
| `src/routes/models.tsx:412` | per-row badge value |
| `src/routes/models.tsx:459` | per-row label "Cheapest host" |
| `src/routes/models.tsx:471-473` | per-row badge text "−N% vs dearest" |

Out of the requested two files, `src/routes/reports.cheapest-api-calls.tsx:43-47`
carries an independent copy of the same unbounded formula (`spreadPct`) and renders
it at lines 183 and 193. It is the same bug. Flagged below as an explicit decision.

## Edits

1. **`hostSpread()`** — divide by `max`, add `if (max <= 0) return null;`. Bounded by
   construction, no cap.
2. **`outputHostSpread()`** — new sibling function directly below, identical shape but
   reading `h.output` / `row.cheapestOutput`.
3. **Headline stats** — compute `topOutputSpread` alongside `topSpread`, render a
   second `HeroStat` adjacent to the existing one. Labels become
   "Widest host spread (input price)" and "Widest host spread (output price)". The hero
   stat grid goes from 4 to 5 items; the grid classes adjust so it still lays out
   cleanly on mobile and desktop.
4. **Per-row card** — label becomes "Cheapest host (input price)"; the badge reads
   "−N% cheaper on input price". An output-spread badge is not added to the row (the
   row shows an input price only); the output dimension surfaces at the headline stat
   and in the expanded host list, which already lists per-host output prices.
5. **Sort option** relabelled "Biggest host spread (input price)" — the comparator
   keeps ranking on input.
6. **Cheapest host badge** stays ranked on input (`models.tsx:414-416` unchanged).
7. No blended, weighted, or ratio-based metric is introduced anywhere.

## After the build

I will read the live served page and paste the literal rendered text for
Llama 3.1 8B Instruct, DeepSeek V4 Flash 0731, and whichever model produces the
current headline spread — showing both input and output spread values from real
output, not a description.

## One decision for you

`reports.cheapest-api-calls.tsx` has the same unbounded formula and will keep showing
inflated percentages unless it is fixed too. Default in this plan: **fix it as well**
(same rebase, label "cheaper on input price"). Say so if you want it left untouched.
