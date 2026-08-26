# Homepage: one numbered story, not two

## Problem

The homepage now carries two numbered step lists telling overlapping stories:

1. **The spine strip** (new, below the marquee): 01 Measure, 02 Compare, 03 Certify, 04 Switch, 05 Govern — the five-level product ladder.
2. **The "How It Works" teaser grid**: 01 Connect, 02 Map, 03 Verdict, 04 Switch — the setup mechanic from `HOW_STEPS`.

"Switch" appears in both lists at different positions meaning different things, and Map/Verdict roughly restate Measure/Compare/Certify. Two numbered frameworks on one page reads as confusion, not structure.

## Decision

The spine strip is the single numbered framework on the homepage. The How It Works section stops being a numbered list and becomes what it actually is: the answer to "what do I have to do?" — connect once, plus the proof.

## Changes (`src/routes/index.tsx` only)

1. **HowItWorks teaser — remove the 4-tile numbered grid.** Replace with one short, unnumbered statement built from the Connect step's own copy: point your SDK base URL at the Verification Engine in your environment, nothing moves, decisions start flowing. No step numbers anywhere in the section.
2. **Keep everything else in the section as-is**: headline ("Connect once. Governed decisions on every workload."), the "four levels are a standard" line linking to /standard, the Compare dashboard screenshot, and the "See how it works in full" link to /how-it-works.
3. **Spine strip stays untouched** — it is now the only numbered sequence on the page. Optionally add a small muted label above it ("The five levels") so visitors understand what the five beats are. Recommend yes: one line, no other styling change.
4. **`src/lib/how-it-works.ts` is not touched.** The full four-step flow (Connect / Map / Verdict / Switch, with bodies and details) remains the content of the dedicated /how-it-works page, where a numbered mechanic list is appropriate and stands alone.

## Result

- One numbered story per page: five levels on the homepage, four mechanic steps on /how-it-works.
- Homepage section order reads cleanly: hero promise → spine (what the product is) → How It Works (what you do: connect once) → proof screenshot.
- No copy claims are deleted from the site — Map/Verdict/Switch detail still lives on /how-it-works.

## Out of scope

- No changes to /how-it-works, /standard, or any other page.
- No metadata changes needed (no copy change that alters the value proposition).
