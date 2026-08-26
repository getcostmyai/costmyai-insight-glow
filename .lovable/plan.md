# Clarity pass: make the verification promise unmissable

The review's real complaint is that a first-time visitor has to assemble the product themselves. Everything below is ordering, copy and one navigation change. No new sections, no redesign, no pricing change.

## 1. Hero wording

Chosen H1 from option D: **"You're overpaying for AI. We'll prove it in minutes."**

The H1 already does two jobs: it names the problem (overpaying) and promises the differentiator (proof, fast). The subline below it should explain *how* in one plain sentence, so a visitor does not have to read the rest of the page to understand the product.

### Subline options for H1 D

All options keep the CTA "Prove it on my numbers" and the micro-line "Metadata only. Never your prompt content." They all start with the punchy negation from option C and replace the weak standalone word "proof" with explicit **quality + price proof**.

#### A. Full loop, both proofs stated

> No estimates, no guesses. We measure your actual usage, price every workload against the live market, and run cheaper options through independent benchmarks. Only when the quality proof and the price proof both hold do we recommend the switch.

Most complete. Two short sentences, no jargon, and the visitor sees exactly what is being proven.

#### B. One-sentence punch

> No estimates, no guesses. We measure your real usage, find the cheaper route for each workload, and prove it with independent benchmarks for both quality and price.

The best balance of punch and clarity. It explains the loop in a single breath.

#### C. Certify tie-in

> No estimates, no guesses. We price your workloads against the live market, run cheaper candidates through independent benchmarks, and certify the switch only when quality and price both pass.

Ties the subline to the Certify level without naming it. "Certify" is stronger than "proof" on its own.

#### D. Bars, not proofs

> No estimates, no guesses. We compare every workload to the live market, prove the saving with independent benchmarks, and only switch what clears both the quality bar and the price bar.

Avoids repeating "proof" and makes the two gates feel like a filter.

#### E. Shortest

> No estimates, no guesses. We find the cheaper route for every workload and prove it holds quality at a lower price before the switch.

Shortest and most direct. Good if the hero needs to stay visually light.

### Note on "benchmark" vs "benchmarks"

Use **benchmarks** plural. The verification engine draws from multiple independent benchmark sources, so the subline should reflect that.

### Recommendation

Use **B**. It keeps the punchy start you liked, replaces the weak "proof" with explicit "quality and price", and still explains the full mechanism in one sentence. It is plain enough for a founder and credible enough for an enterprise reviewer.

If you want to lean harder into the product's Certify language, use **C** instead.

The micro-line "Metadata only. Never your prompt content." and the three live counters stay as they are.


## 2. The Standard becomes reachable, not footer-only

`/standard` is currently linked from one place: the footer. It is the strongest conceptual asset on the site and no visitor path reaches it.

- Add "The Standard" to the main marketing nav in `MarketingShell`.
- Add one line under the How It Works four-step block linking to it: "The four levels are a standard, not a feature list. Read The CostMyAI Standard."

## 3. One spine, stated once, near the top

Insert a compact five-beat strip immediately after the provider marquee, above How It Works: Measure -> Compare -> Certify -> Switch -> Govern, one short line each. Hairline rail treatment, no cards. This is the mental model the review says is missing; everything below it then reads as support rather than as competing stories.

How It Works keeps its four steps and screenshot; the strip is the one-glance version above it.

## 4. Trim the competing stories in the middle

Order today: Hero, Marquee, HowItWorks, StillMoving, Estimator, BuiltFor, Forecast, TrustBeat, Architecture, Pricing, Neutrality, FAQ, Closing.

Two moves only:

- Forecast is the longest block for the third-most-interesting capability. Keep the head, the three-cell strip and the diagram; cut the principle bodies to one sentence each and send depth to the forecasting post it already links.
- StillMoving and Forecast both argue "prices keep moving". Keep the argument in StillMoving; Forecast drops its restatement.

## 5. Name the free-tier ceiling where a free user meets it

The review's conversion point. On the Compare level, where a cheaper host is found but no certified claim exists, state the reason plainly rather than showing an empty state: cheaper host found, potential difference $X, quality certification unavailable because benchmark evidence does not support this switch yet, with the upgrade link. Copy and placement only, inside the existing locked-level component; no gating logic changes.

## Not in this plan

Pricing changes, model-catalogue SEO pages, funnel instrumentation and Time to First Defensible Finding. Those are product and measurement work, not clarity, and each deserves its own pass.

## Technical notes

- `src/routes/index.tsx`: hero copy, new spine strip component, Forecast principle trim, section order.
- `src/components/marketing/MarketingShell.tsx`: nav entry for `/standard`.
- `src/components/dashboard/LevelState.tsx` / `CompareLevel.tsx`: locked-certification copy.
- Anchors (`#how`, `#estimator`, `#forecast`) keep their ids so nav and footer links keep working.
- Final step: refresh `head()` on `/` (title, description, og:title, og:description) to match the new hero promise.
