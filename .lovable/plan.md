# Clarity pass: make the verification promise unmissable

The review's real complaint is that a first-time visitor has to assemble the product themselves. Everything below is ordering, copy and one navigation change. No new sections, no redesign, no pricing change.

## 1. Hero wording

Today: "Stop overpaying for AI." / "You're likely overspending on AI. We prove it. You save. You grow."

Two constraints shape the rewrite. It must read the same to a solo founder and to an enterprise buyer, so no category jargon ("governance", "spend management") in the largest type — the search data backs this: "ai cost governance" gets 50 searches a month against 140 for "ai cost management", and neither is language a founder uses out loud. And it must carry the one thing no competitor can say: we prove the saving instead of estimating it, and we say no when we can't.

The lever is the verb. "Prove" is ownable, plain, and works at every company size. What follows are five whole-hero options, each written as a unit (headline, subline, CTA) so you can judge how it reads live, not as a slogan in isolation.

### A. Proof as the headline

- H1: "Cut your AI bill. **Without guessing.**" (gradient on the second sentence)
- Sub: "We find the cheaper way to run each workload and prove it holds the same quality before you switch. If we can't prove it, we tell you."
- CTA: "See what you could save"

Reads as a benefit first, differentiator second. Safest option, lowest risk of confusing anyone.

### B. The receipt

- H1: "Every AI saving, **proven before you switch.**"
- Sub: "You're likely overpaying for AI. We show you exactly where, run the cheaper option against an independent benchmark, and only recommend the switch when the evidence holds."
- CTA: "Find my savings"

Puts the proof promise into the H1 without any category word. Strongest fit with the rest of the site's voice.

### C. Same answer, less money

- H1: "Same answers. **Half the bill.**"
- Sub: "The same model is often cheaper somewhere else, and a smaller model is often just as good. We prove which is true for your workloads, then switch it safely."
- CTA: "See if you are overpaying"

The most desire-creating and the most concrete. "Half the bill" is a claim we would need to hedge or substantiate — usable if we soften to "a smaller bill" or tie it to a real figure from the catalog.

### D. The objection, answered

- H1: "You're overpaying for AI. **We'll prove it in minutes.**"
- Sub: "Point us at your usage and we show the cheaper route for each workload, with the benchmark evidence behind it. No prompts leave your environment."
- CTA: "Prove it on my numbers"

Speed plus proof. Works well with the estimator as the next click, and the CTA is the most inviting of the five.

### E. Nobody guesses with your money

- H1: "Stop paying for AI savings **nobody can prove.**"
- Sub: "Most tools estimate what you'd save. We measure it, benchmark it, and refuse the ones that don't hold up. Then we make the switch."
- CTA: "See the proof on your spend"

The sharpest positioning against the category, at the cost of leading with a negative.

### Recommendation

B for the headline, with D's CTA. "Every AI saving, proven before you switch." is plain enough for a founder, credible enough for an enterprise reviewer, contains no jargon, and makes "proven" the word people repeat back. Pairing it with "Prove it on my numbers" turns the estimator from a generic tool into the demonstration of the headline.

Whichever you choose, the micro-line stays "Metadata only. Never your prompt content." and the three live counters stay as they are.


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
