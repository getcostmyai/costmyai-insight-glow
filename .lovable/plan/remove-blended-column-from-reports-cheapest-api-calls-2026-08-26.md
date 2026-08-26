# Remove BLENDED column from /reports/cheapest-api-calls

## Goal
Delete the BLENDED column and all supporting code from `src/routes/reports.cheapest-api-calls.tsx`, leaving only the $/1M IN and $/1M OUT columns sourced from the lowest-input host.

## Changes

1. Delete `cheapestBlended()` (lines 35-41).
2. Remove the "Blended · gap" column header (line 192).
3. In the row render (lines 195-231):
   - Remove `const blended = cheapestBlended(r);` (line 198).
   - Remove the `<p>` that renders `blended` (lines 221-222).
   - Keep the gap badge rendered in the same cell by moving it to the $/1M OUT column or to a new trailing cell. Decision: place the `−X% cheaper on input price` badge in the rightmost cell (previously "Blended · gap") so the row still has a visual action element.
4. Rewrite the explanatory paragraph (lines 180-184) to remove the blended description. New copy will describe input/output pricing only.
5. Do not add any new computed figure.

## Host-selection audit
After the blended column is removed, every host-specific value in a row is sourced from the same selection:
- `$ / 1M in`: `best.input`
- `$ / 1M out`: `best.output`
- `best` is defined at line 197 as `hosts.reduce((a, h) => (a.input <= h.input ? a : h))` (lowest-input host).
- The `−X% cheaper on input price` badge uses `spreadPct(r)`, which is derived from `row.cheapestInput`. `row.cheapestInput` is the same lowest-input value used to select `best`, so it is consistent with the row's host selection.

No other column pulls from a different host selection.

## Verification
After build, capture the literal rendered text for the row:
- Model: Mistral Nemo
- Vendor: mistralai
- Cheapest host: DeepInfra

Confirm the BLENDED value is gone and the remaining $/1M IN, $/1M OUT, and gap badge values are unchanged.
