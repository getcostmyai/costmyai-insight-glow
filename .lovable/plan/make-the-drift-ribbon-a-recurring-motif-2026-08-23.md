# Make the drift ribbon a recurring motif

Short answer: yes, slightly. Right now the ribbon appears exactly once, in "Why this is a system, not an audit". A single appearance reads as decoration for that one block. Repeating it two more times, quieter each time, turns it into the page's signature: the line that never holds still.

The fix is not "put the ribbon everywhere" — that would flatten the page. It is a three-beat rhythm.

## The rhythm

1. **Hero (whisper, diagonal)** — the band rotated to a shallow rising diagonal, very low opacity, mostly masked. Texture, not artwork. Introduces the shape.
2. **Why this is a system (statement, horizontal)** — unchanged. The loud one, where the argument and the artwork say the same thing.
3. **Spend forecast (echo, vertical)** — the band rotated a quarter turn and pinned to one side gutter, low opacity, so the forecast section reads as a column of movement beside the text rather than a repeat of the same stripe.

Closing CTA stays mesh-only so the page ends on colour, not pattern.

## Behaviour

- Same deterministic seed set everywhere, so it is recognisably one band seen from three angles, not three unrelated squiggles.
- Orientation is a prop: `horizontal` (default), `vertical`, `diagonal`. It only changes how the SVG box is rotated and stretched, never the path maths, so hydration stays stable.
- All three use the existing slow strand drift, and all stop under reduced-motion.
- Opacity ladder: hero ~15%, statement 40% (current), forecast ~18%. Never competes with text.
- Each instance keeps a mask fade along its own axis so no hard edge meets a section boundary.

## Technical notes

- `PriceDriftRibbon` gains one optional `orientation` prop; the placements are positioning, rotation and opacity only. Path generation is untouched.
- Rotation is done on the wrapper with a CSS transform plus an aspect-correcting scale, so `preserveAspectRatio="none"` still fills the intended area.
- Hero and Forecast instances need `stats` in scope; `Forecast` currently takes no props, so it gains `stats: MarketingStats` from the existing homepage loader data. No new data fetching.
- No changes to layout, copy, or spacing.

