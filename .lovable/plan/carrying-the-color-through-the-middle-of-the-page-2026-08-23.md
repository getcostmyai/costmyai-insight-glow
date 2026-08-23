# Carrying the color through the middle of the page

## My read

You are right, and the reason is structural: the mesh currently exists in exactly two places (hero, closing CTA) and everything between them is `wash-section` at 13-17% opacity, which reads as "very slightly off-white". So the page now has two loud bookends and eight quiet sections, and the quiet ones look unfinished rather than calm.

The fix is not "add gradient everywhere" — that would kill the credibility the hairline style buys us. It is: give the middle a **rhythm**, and give two or three sections a real piece of **artwork** that is ours, not Stripe's.

## 1. A three-tier surface rhythm

Right now sections alternate between `wash-section` and `bg-card`, which is barely a difference. Replace that with three deliberate tiers, applied in a repeating pattern down the page:

- **Tier 0 — plain.** `bg-background`, hairline top rule. Most sections.
- **Tier 1 — tinted.** A new `wash-brand` at meaningfully higher opacity than today's wash, but still text-safe, with the widened indigo → violet → magenta stops so it reads as brand color rather than grey.
- **Tier 2 — mesh.** Full `mesh-brand`, reserved for the hero, one mid-page anchor, and the closing CTA.

Assignment down the current order:

```text
Hero            tier 2  mesh
Marquee         tier 0
How It Works    tier 1  + artwork (existing GradientPanel)
Still Moving    tier 2  mesh anchor  <- the new mid-page moment
Estimator       tier 1
Built For       tier 0
Forecast        tier 1  + artwork
Architecture    tier 0  + artwork
Pricing         tier 1
Neutrality      tier 0
FAQ             tier 0
Closing         tier 2  mesh
```

Nothing gets a card. The tint is on the section band, edge to edge, with the same hairline rails.

## 2. Artwork that is ours, not Stripe's

Stripe's artwork is decorative gradient blobs. Ours should be **the data**, drawn beautifully. Three pieces, each replacing something currently flat:

- **Still Moving — the price-drift ribbon.** A wide, full-bleed SVG of real tracked price moves over the last 90 days as a flowing band, gradient-stroked in the brand family, drifting slowly. This is the page's centre of gravity: "prices move, constantly", said visually. It sits on the tier-2 mesh.
- **Forecast — upgrade the existing diagram.** `ForecastDiagram` stays structurally the same but the projected region becomes a gradient-filled cone in brand colors instead of a grey band, with the actual line in near-black. One change, big payoff, and it makes the honesty argument visually.
- **Architecture — gradient flow lines.** `ArchitectureDiagram` keeps its boxes and labels; the connectors between them become animated gradient paths (metadata flowing left to right), reduced-motion off.

All three are SVG we draw, tied to real numbers where numbers exist. No stock illustration, no blobs, no bento tiles.

## 3. Small consistency fixes while in there

- The colored dividers between sections: replace the flat `border-border` rules on tier-1/tier-2 boundaries with a hairline that fades to brand color at the centre, so section transitions feel intentional.
- Section eyebrow labels pick up the brand color at low weight instead of `text-muted-foreground`, so the vocabulary matches the hero.
- Marquee provider logos currently sit on flat white; give that band a very light tier-1 tint so it does not read as a gap between hero and How It Works.

## What I would still not do

No bento grid, no card-per-feature, no gradient behind body copy, no second accent family outside the indigo → coral range. The KPI semantic colors (saving green, opportunity amber, spend purple) stay untouched — they mean something.

## Technical notes

- New tokens in `src/styles.css` next to `--mesh-brand`: `--wash-brand` (tier 1) and a `@utility wash-brand`, plus a `@utility rule-brand` for the fading divider. Dark-mode equivalents in the same block. `--wash-section` stays defined so nothing breaks, but stops being used on the homepage.
- `src/routes/index.tsx`: section wrapper classes only — swap `wash-section` / `bg-card` for the tier utilities per the table above. No content or component-internal changes for those sections.
- New `src/components/marketing/PriceDriftRibbon.tsx` for the Still Moving artwork, fed by the existing marketing stats query (extended with a 90-day price-move series if one is not already exposed; otherwise it renders from the move counts we already return).
- `ForecastDiagram.tsx` and `ArchitectureDiagram.tsx` get fill/stroke changes and a `prefers-reduced-motion` guard; their structure and labels stay.
- Verification: Playwright pass down the homepage at 1280 wide, screenshots at every section boundary to judge the rhythm, plus a contrast check on any text sitting over tier-1 tint.

## Suggested order

Ship the surface rhythm (step 1) and the divider/eyebrow fixes first — that alone removes the "lost middle" feeling and is cheap to judge live. Then the Still Moving ribbon, then the two diagram upgrades.
