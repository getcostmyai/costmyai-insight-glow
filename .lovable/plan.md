# Make the price-move counter auditable

"2,107 market price moves this month" is the most-repeated number on the site and the only headline figure with no public definition. The rule already exists precisely in the code; it is simply never shown. Publishing it turns a marketing counter into evidence, which is the whole brand promise.

## The definition to publish

Taken verbatim from how the number is actually computed, not written fresh:

- A price move is one observed change to a live listed price for a model on a specific host, recorded with its direction (increase or decrease).
- A model or host appearing for the first time is a new listing, not a move. A delisting is not a move either. Both are excluded from the count.
- Moves are counted between two of our own pricing syncs, so the number reflects what we actually caught, not what a provider announced.
- The counter covers the current calendar month in UTC and resets on the 1st. The underlying ledger is append-only and never pruned, so the window is a read choice, not data loss.
- Coverage started on the date of our first recorded observation, which is already published as "tracking since".

## What gets built

1. **Canonical definition on the methodology page.** A new "What counts as a price move" section on `/legal/methodology` with a stable `#price-move` anchor, carrying the five points above plus the honest limits: we only see what our syncs catch, so a price that changes and reverts between two syncs is invisible to us, and a provider we do not track cannot contribute a move.

2. **Link the number where it is a headline stat.** On the homepage stat row and closing line, `/about`, and `/guides/ai-cost-management`, the label becomes a quiet link to `/legal/methodology#price-move`. Styling follows the existing hairline/underline treatment, no new components, no cards.

3. **Point the existing glossary at the canonical text.** The Intelligence report already has a short "Price move" glossary entry. It stays where it is and gains a link to the anchor, so there is one source of truth rather than two wordings that can drift apart.

4. **Leave the decorative uses alone.** The drift ribbon passes the same number as visual density on many routes. Those are not claims and get no link, so the change stays small.

## Explicitly not in scope

No homepage repositioning, no funnel instrumentation, no Time to First Defensible Finding work, no pricing changes, no catalogue SEO pages. Those stay open for a separate decision.

## Technical notes

- Source of truth for the wording is the comment block and query in `src/lib/marketing.server.ts` (`change_kind` filtered to `increase`/`decrease`, `observed_at` bounded by UTC month start).
- The methodology page is `src/routes/legal/methodology.tsx`, rendered through the shared `LegalPage` component; the new section follows the existing section shape there.
- Glossary entry lives in `src/components/marketing/IntelligenceReport.tsx`.
- Final step per standing rule: refresh the methodology route's `head()` (title, description, og:title, og:description) so it reflects the added section.
