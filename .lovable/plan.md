# Hero: cut the load, keep the point

## What the hero does today

Between the headline and the fold it asks the visitor to absorb six separate blocks: a headline, a four-sentence paragraph that already introduces gateway metadata, forecasting, benchmarks, Govern and routing grants, a four-column mini-grid of value props, two CTAs, a privacy line, and three live KPI counters. Every element is good on its own; stacked, they compete, and the one sentence that should explain CostMyAI is the longest thing on the screen.

Two specific problems:

1. The subheadline front-loads mechanism (gateway metadata, Govern, routing grants) before the visitor knows what the product is. Those are objection-handling details, not first-contact details.
2. The four-card grid repeats the subheadline in shorter words. The visitor reads the same idea twice in two formats.

## The optimisation

Keep the hero to four beats: headline, one-sentence promise, proof of scale, action.

**1. Headline — unchanged.** "Stop overpaying for AI." is short, benefit-first, and owns the brand promise. No change.

**2. Subheadline — one sentence, outcome first.** Replace the four-sentence paragraph with a single line in the same style as the rest of the site:

> We watch what AI actually costs you, prove where the same quality costs less, and make the switch when it holds quality, automatically in Govern.

Mechanism words (metadata, gateway, routing grant) move down the page. The routing-consent nuance already has a proper home in How It Works and Architecture; the metadata promise stays in the hero as the short trust line.

**3. The four-card grid — cut from the hero entirely.** It duplicates the subheadline. The same four ideas (forecast, cheaper host, cheaper model, smaller model) are already the spine of the page below: the Estimator proves the first three interactively, and How It Works explains each mode in order. The hero does not need a preview of a preview.

**4. CTAs — unchanged in function, tightened in label.** Primary "See if you are overpaying" stays; it is the single best action on the page. Secondary "Book a Demo" stays.

**5. Trust line — keep, move directly under the CTAs.** "Metadata only. Never your prompt content." is one line and answers the first objection a technical buyer has. It stays.

**6. Live KPIs — keep, tighten the spacing.** The three counters with green live dots are the strongest non-verbal credibility signal on the page. With the grid removed they sit closer to the CTAs and land above the fold on a laptop, which they currently do not.

## What the hero looks like after

```text
            Stop overpaying for AI.

  We watch what AI actually costs you, prove where the
  same quality costs less, and make the switch when it
  holds quality, automatically in Govern.

      [ See if you are overpaying ]  [ Book a Demo ]

        Metadata only. Never your prompt content.
  ------------------------------------------------------
     1,240              70              318
  MODELS TRACKED   PROVIDERS PRICED   MARKET PRICE
                                      MOVES THIS MONTH
```

## Technical notes

- All changes are inside `Hero()` in `src/routes/index.tsx`; no data, query or server change.
- Removing the grid removes the only `lg:grid-cols-4` block in the hero; vertical rhythm gets re-tuned (`pt-28`/`pb-28` reduced) so the KPI row clears the fold at 1280x800.
- Meta description in the route `head()` stays as is; it serves search, not the visitor, and the longer mechanism copy is correct there.
- If the four cards move rather than disappear, that is a second small section edit in the same file.

## Open questions

Answer before build:

1. Where should the four value cards go — folded into the existing How It Works section, or dropped entirely because Estimator plus How It Works already cover them?
2. Is the one-sentence subheadline the right level of detail, or do you want a second short sentence covering automatic switching?
