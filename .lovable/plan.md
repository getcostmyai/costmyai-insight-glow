# Borrowing Stripe's vibrancy without becoming Stripe

## My honest read of those screenshots

Stripe is not more colorful than us by much. It is more *committed*. Three things do the work:

1. **Color is an object, not a background tint.** Their gradients are large, saturated, aurora-like artwork with real internal structure (that orange/pink/indigo ribbon, the radial burst). Ours are 13-17% opacity radial washes that read as "slightly off-white". Same hue family, a tenth of the conviction.
2. **The palette is wider than one purple.** Indigo, violet, magenta, coral, amber all appear, but always as *one continuous gradient across a family*, never as separate flat brand colors. That is why it stays vibrant and not loud.
3. **Vibrancy is quarantined.** The colorful surfaces are the artwork panels and hero. All type, all data, all UI chrome stays near-black on near-white with hairline rules. Ninety percent of the page is calm; the ten percent that is colored is fully saturated.

We already have the calm ninety percent, and it is better than theirs at showing numbers honestly. What we lack is the ten percent. Right now our brand gradient only ever appears as a text fill and a button.

There is one real tension to name: their layout is card-heavy (bento tiles with gradient fills), and our standing rule is no cards, hairline rails only. I do not want to trade that away. The proposal below takes Stripe's *color energy* and leaves their *card grid* alone.

## What I'd change

**1. Make the brand gradient a real artwork, not a wash.**
Build one reusable ambient gradient field: a multi-stop indigo -> violet -> magenta -> coral mesh with a soft warm core, rendered as layered radial gradients with a slow drift animation (respecting reduced motion). Use it in exactly three places at first: behind the hero, behind the Estimator, behind the final CTA. Opacity meaningfully higher than today at the source, falling to zero well before any text.

**2. Widen the accent range inside the gradient only.**
Add coral/amber stops to the brand gradient family so it stops reading as flat purple. Semantic KPI colors (saving green, opportunity amber, spend purple) are untouched, because they encode meaning and cannot become decoration.

**3. Two-tone headlines.**
Stripe's headline trick: first sentence near-black, the continuation in a muted grey, with only a few words in gradient. Costs nothing, immediately adds depth to hero, forecast, and the closing section.

**4. One gradient-filled artwork panel per marketing page.**
Not a bento grid. A single full-bleed rounded panel, gradient interior, our real product surface floating in it (the dashboard screenshots we already have in `public/images/how-it-works/`). This is the one place cards are allowed, because it is a frame around an image, not a content card.

**5. Living numbers.**
Stripe puts a live counter above the fold ("Global GDP processed"). We have a genuine equivalent: real prices tracked, real price moves observed. Give the hero stat row a subtle continuous tick rather than a one-shot CountUp.

## What I would not copy

Their bento card grid, their dense product-shot collages, and their marketing-first stat framing. Our credibility comes from hairlines and unadorned numbers. Adding gradient tiles everywhere would read as a Stripe pastiche and would break the Intelligence standard.

## Technical notes

- All new values land in `src/styles.css` as tokens next to `--gradient-brand`: extra stops for the widened family, a `--mesh-brand` layered-radial definition, and an `@utility mesh-brand` plus a drift keyframe with a `prefers-reduced-motion` off-switch. No per-page gradient literals, same rule as today.
- Two-tone headline is a `text-muted-foreground` span inside the existing `h1`/`h2`; no new component.
- The artwork panel becomes a small `GradientPanel` component in `src/components/marketing/`, used by the marketing shell pages, taking an image and an aspect ratio.
- The washes `--wash-hero` / `--wash-section` stay defined so nothing breaks, but the hero switches to the mesh.
- Light mode is the target; dark-mode token values get the equivalent treatment so nothing goes muddy.

## Suggested order

Start with one page only: the homepage hero plus the closing CTA. See it live, judge whether the saturation is right, then roll the same tokens across `/pricing`, `/how-it-works`, `/standard`, `/intelligence`. No page-by-page reinvention.
