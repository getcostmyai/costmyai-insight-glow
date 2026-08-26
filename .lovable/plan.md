# Clarity pass: make the verification promise unmissable

The review's real complaint is that a first-time visitor has to assemble the product themselves. Everything below is ordering, copy and one navigation change. No new sections, no redesign, no pricing change.

## 1. Hero says what makes us different, not what every cost tool says

Today: "Stop overpaying for AI." / "You're likely overspending on AI. We prove it. You save. You grow."

"Stop overpaying" places us inside the crowded AI-cost-tool category. The differentiator ("We prove it") is the third sentence in a subline. The proof claim needs to move into the largest type, but the wording must still feel like a human promise, not a category statement.

### Direction A — the blunt contrast

- H1: "AI cost tools guess. We prove." with "We prove." in the brand gradient.
- Subline: "You're probably overpaying for AI. We show you exactly where, with independent benchmark evidence — or we refuse the claim."

### Direction B — the money-first promise

- H1: "Stop paying for AI savings that aren't real." with "aren't real" in the brand gradient.
- Subline: "Most tools estimate. CostMyAI proves every cheaper route against an independent benchmark, then makes the switch when it holds up."

### Direction C — the category reframe (recommended)

- H1: "AI Spend Governance, not AI cost opinions." with "Governance" in the brand gradient.
- Subline: "You're likely overspending on AI. We prove where, with independent benchmarks — and we refuse to certify anything that doesn't hold up."

### Direction D — the shortest, most provocative

- H1: "Your AI bill is lying to you." with "lying to you" in the brand gradient.
- Subline: "We prove what you're actually worth paying for — and we say no when the evidence isn't there."

### Recommendation

Use Direction C. It re-frames the category in two words (Spend Governance), keeps the money promise, and introduces "refuse" as a feature rather than a limitation. That single word is already a brand asset on the site and makes the promise concrete.

In all directions the primary CTA stays "See if you are overpaying" and the micro-line stays "Metadata only. Never your prompt content."

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
