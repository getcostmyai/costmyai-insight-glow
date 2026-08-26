# Clarity pass: make the verification promise unmissable

The review's real complaint is that a first-time visitor has to assemble the product themselves. Everything below is ordering, copy and one navigation change. No new sections, no redesign, no pricing change.

## 1. Hero wording

Chosen H1 from option D: **"You're overpaying for AI. We'll prove it in minutes."**

The H1 already does two jobs: it names the problem (overpaying) and promises the differentiator (proof, fast). The subline below it should explain *how* in one plain sentence, so a visitor does not have to read the rest of the page to understand the product.

### Subline options for H1 D

All options keep the CTA "Prove it on my numbers" and the micro-line "Metadata only. Never your prompt content."

#### A. Market + benchmark + only-when-proof-holds

> We price your real workloads against the live market, run cheaper candidates through an independent benchmark, and only recommend the switch when the proof holds.

The clearest explanation of the mechanism. It tells the visitor exactly what happens and why they can trust it.

#### B. Where, what, and the proof

> See exactly where your AI spend is leaking, which cheaper option matches your quality, and the proof that makes the switch safe.

More desire-creating. "Leaking" turns the problem into found money, while the second half restores the safety promise.

#### C. No estimates, no guesses

> No estimates, no guesses. We measure your actual usage, find the cheaper route for each workload, and prove the saving before you switch.

Punchy and direct. The negation works because the H1 already made a positive promise; this line explains the discipline behind it.

#### D. Same model, smaller model, both proven

> The same model is often cheaper somewhere else, and a smaller model is often just as good. We prove which is true for your workloads, then switch what passes.

Ties directly to the four levels (Compare / Certify / Rightsize / Govern) without using the words. Good if you want the subline to preview the product structure.

#### E. The trust-first version

> Point us at your usage. We show the cheaper route for every workload and the independent benchmark behind it. No prompts leave your environment.

Keeps the original D subline's trust beat but tightens the promise and moves the privacy claim into the same sentence.

### Recommendation

Use **A**. It is the only option that explains the full loop (price, benchmark, recommend only when proof holds) in one sentence, with no category jargon and no negative framing. It makes the H1 credible instead of just catchy.

If you want more punch, use **B**. It sacrifices a little mechanism detail for desire, but still closes with the safety word "proof".

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
