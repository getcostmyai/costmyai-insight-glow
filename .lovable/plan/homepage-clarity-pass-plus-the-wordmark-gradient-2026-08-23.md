# Homepage clarity pass, plus the wordmark gradient

## 1. The wordmark picks up the hero gradient

Today "My" in CostMyAI is flat `text-primary`, while the hero's "for AI." now runs the widened indigo → violet → magenta → coral gradient. They should be the same mark.

`Wordmark.tsx` is already the single source for that mark, so the change is one line: `My` renders with `text-gradient-brand-wide`. That propagates automatically to the main nav, the footer, and every other place the wordmark appears. No per-page edits, no new token.

One caveat worth naming: gradient text at 13-15px can look muddy on low-DPI screens. If the small footer/nav instance reads poorly live, the fallback is a slightly tightened gradient (fewer stops across the two letters) rather than reverting one surface — the mark must stay identical everywhere.

## 2. My honest read on homepage clarity

Current order: Hero → Marquee → Estimator → StillMoving → Forecast → HowItWorks → Architecture → BuiltFor → Pricing → Neutrality → FAQ → Closing.

A first-time visitor meets an interactive Estimator and then five long forecast principles before anyone has told them what the product actually does. The Estimator is a great asset, but it asks for input from someone who does not yet know why they should give it. And Forecast is the longest section on the page for what is, to a new buyer, the third-most-interesting capability behind "find cheaper" and "prove it holds quality".

So: yes to moving How It Works up, yes that Forecast is too long here.

### The order I'd ship

```text
Hero            promise + live proof of scale
Marquee         providers we price
How It Works    what the product does, 4 steps + one real screenshot
StillMoving     why this is continuous, not an audit
Estimator       now they know what they're estimating
Built For       "this is me"
Forecast        condensed
Architecture    the technical objection
Pricing
Neutrality / FAQ / Closing
```

Three moves, in plain terms:

- **How It Works goes directly under the marquee.** Understanding before interaction. It already carries the Compare screenshot, so it is also the first visual proof of the real product.
- **Estimator moves after StillMoving.** It becomes the "now try it on your own numbers" beat instead of the opening ask.
- **Built For moves ahead of Forecast** so self-recognition ("agency", "scale-up") happens while attention is still high, and the detailed forecast argument sits with Architecture as the depth block for readers who kept going.

### Cutting Forecast down

Keep the section head, the three-cell Actual / Projected / Point-or-range strip, and the diagram. Reduce the five long principles to three short ones on the homepage:

1. What you already spent is never guessed
2. A spike is not a trend
3. A range when a number would be dishonest

Bodies trimmed to roughly one sentence each. The dropped two (weekly shape, retired/new workloads) are real differentiators but belong on the forecasting blog post the section already links to — that link becomes the honest destination for depth rather than a footnote under a wall of text.

Net effect: roughly a screen and a half of scroll removed from the middle of the page.

## 3. What I would not change

Hero copy, pricing, Neutrality, FAQ, closing CTA all stay as they are. No new sections, no cards — the hairline rail standard holds. This is ordering and trimming only, so it is easy to judge live and easy to revert one move at a time if you disagree with any single one.

## Technical notes

- `src/components/marketing/Wordmark.tsx`: swap `text-primary` for `text-gradient-brand-wide` on the `My` span. Single edit, propagates everywhere.
- `src/routes/index.tsx`: reorder the JSX inside `HomePage()`; no component internals change for the moved sections. `FORECAST_PRINCIPLES` drops from five entries to three with shortened bodies.
- Section anchors (`#how`, `#forecast`, `#estimator`) keep their ids, so nav hash links and footer links keep working unchanged.
- `src/lib/__tests__/marketing-front-page.test.ts` asserts the Neutrality callout appears before the FAQ comment marker — untouched by these moves, but it gets re-run to confirm.
- Verification: Playwright pass over the homepage at desktop width, screenshots at the new section boundaries, plus a close-up of the nav and footer wordmark to judge the small-size gradient.
