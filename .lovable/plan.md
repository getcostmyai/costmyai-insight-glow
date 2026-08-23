# Make the drift ribbon a recurring motif

Short answer: yes, slightly. Right now the ribbon appears exactly once, in "Why this is a system, not an audit". A single appearance reads as decoration for that one block. Repeating it two more times, quieter each time, turns it into the page's signature: the line that never holds still.

The fix is not "put the ribbon everywhere" — that would flatten the page. It is a three-beat rhythm.

## The rhythm

1. **Hero (whisper)** — the ribbon at very low opacity along the bottom edge of the hero mesh, mostly masked away. Read as texture, not artwork. Introduces the shape.
2. **Why this is a system (statement)** — unchanged. This is the loud one, where the argument and the artwork say the same thing.
3. **Spend forecast (echo)** — the ribbon mirrored (flipped vertically) at low opacity along the top edge of the forecast band, tying the forecast argument back to the same visual language.

Closing CTA stays mesh-only so the page ends on colour, not pattern.

## Behaviour

- All three instances share the same deterministic seed set, so the shape is recognisably the same band each time, not three unrelated squiggles.
- All three use the existing slow strand drift, and all stop under reduced-motion.
- Opacity ladder: hero ~15%, statement 40% (current), forecast ~18%. Never competes with text.
- Each instance keeps a mask fade so no hard edge appears against the section boundary.

## Technical notes

- `PriceDriftRibbon` already takes `moves` and `className`; the extra placements are positioning and opacity only, no component rewrite.
- Add an optional `flip` prop for the mirrored forecast instance (a CSS `scaleY(-1)` on the SVG wrapper).
- Hero and Forecast instances need `stats` in scope; `Forecast` currently takes no props, so it gains `stats: MarketingStats` from the existing homepage loader data. No new data fetching.
- No changes to layout, copy, or spacing.
