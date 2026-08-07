# Intelligence Notes — from facts to context

Turn `/intelligence` from a figure board into a place where movements are explained, without ever letting an explanation pass as a measurement.

## Decisions this plan builds on

- **Where**: notes live under Intelligence, at `/intelligence/notes` and `/intelligence/notes/{slug}`. The live page and every frozen month get a rail linking the notes attached to them. Not `/blog` (marketing register), not a new top-level section.
- **Production**: a detector proposes, a human writes. A scheduled job scores the closed month and writes candidate leads with evidence attached. No lead is ever published automatically, and no sentence in a published note is generated.
- **Cadence**: one note per frozen month, written after the freeze. Off-cycle notes only when a lead crosses a pre-set severity threshold, so "newsworthy" is a data condition rather than a mood.

## The labeling rule, enforced structurally

Every note carries exactly one provenance label, and it is a required field, not a convention:

- `proven-mechanism` — a demonstrable cause, with a concrete exhibit.
- `correlated` — a real pattern with an unconfirmed explanation. Rendered as "Analysis, not established cause."
- `third-party` — built on someone else's dataset. Requires a non-empty `source` field naming the provider, rendered above the body and repeated in the meta description.

Enforcement: the note type makes `source` mandatory when the label is `third-party`, a unit test asserts every note in the corpus satisfies its label's requirements, and the renderer draws the chip from the same field the test reads. A note cannot be published with the chip missing because there is no code path that renders a body without one.

## Scope

### 1. Notes corpus and rendering

- `src/lib/intelligence/notes.ts` — the corpus, in the same structured-block shape as `src/lib/blog/posts.ts` (reuse the `Block` union, extended with a `figure` block and an `exhibit` block). Fields: `slug`, `title`, `deck`, `label`, `source`, `month` (the frozen month it attaches to, nullable for off-cycle), `published`, `blocks`, `description`.
- `src/routes/intelligence.notes.index.tsx` — index, newest first, label chip per row.
- `src/routes/intelligence.notes.$slug.tsx` — the note. Own `head()` with title, description, og:title, og:description, og:type article, canonical.
- `src/components/marketing/IntelligenceNote.tsx` — renderer following the Intelligence design standard: hairline rails, oversized type, one purple accent, no cards, Reveal on entry.
- Rail component on `/intelligence` and `/intelligence/$month` listing notes for that month (frozen page) or the newest three (live page).

### 2. The exhibit primitive

A note that claims a mechanism must show the artifact. `Exhibit` renders a labeled evidence block — a captured payload, a ledger row, a measured pair — in IBM Plex Mono against a hairline rail, with a caption stating where the artifact came from. Notes labeled `proven-mechanism` are required by test to contain at least one exhibit block.

### 3. Charts

Extend `src/components/marketing/IntelligenceCharts.tsx`:

- **Decomposition bar** — two opposing contributions and their net (price per token down X%, tokens per task up Y%, net Z%). This is the chart the first note needs.
- **Trend line** with an explicit source caption baked into the component, so a third-party series cannot be drawn without its attribution.

Both take real numbers as props and refuse to render when a series is empty, matching how the report page already omits sections it has no data for.

### 4. Lead detector

- `src/lib/intelligence/leads.server.ts` — runs against the closed month's frozen payload plus tracked history. Detectors, each emitting a typed lead with its evidence: outsized price move against the model's own tracked history; provider spread crossing a threshold on identical weights; a benchmark instrument crossing into saturation; a cluster of new listings from one provider.
- Table `intelligence_leads`: `id`, `month`, `kind`, `severity`, `subject`, `evidence` (jsonb), `detected_at`, `status` (`open` | `written` | `dismissed`), `note_slug`. Owner-only read/write through RLS; no anon grant. Leads are internal.
- New job `intelligence-leads` registered in `src/lib/ops/jobs.ts`, run right after `freeze-intelligence` monthly, reporting into `sync_runs` like every other job so the health check covers it.
- `src/routes/_authenticated/admin/leads.tsx` — the editorial queue: open leads with their evidence rendered, and controls to mark written or dismissed. Owner-gated with the existing middleware.

### 5. First note

`reasoning-token-overhead`, label `proven-mechanism`, attached to the newest frozen month.

Thesis: per-token price is falling while cost per task is not, because reasoning models bill tokens they do not show you. Exhibit: the real captured call that reported 1 output token while 122 were billed, with the parser field that was missing. Chart: decomposition of price-per-token against tokens-per-task. Closes by pointing at the methodology page and the live figures, not at a signup.

### 6. Ongoing commitment, stated plainly

The build below is roughly a two-week engineering effort. The content is about one person-day per note, every month, indefinitely, and needs a named owner. If nobody owns it, the honest outcome is: ship the detector and the first note, and do not present notes as a series until someone does.

## Explicitly out of scope

Customer-specific longitudinal narratives. They need months of real per-customer history that does not exist yet, and synthesizing them would be exactly the failure mode this plan is built to prevent. One preparatory step is in scope: confirm the ingest path retains per-request token history at the granularity a future note would need, and record the gap if it does not.

## Technical notes

- Notes are code, not database rows. They are reviewed like code, versioned like code, and cannot be edited invisibly in production — the same reasoning behind the append-only frozen months.
- Note pages are public and SSR'd; they read no authenticated data.
- The rail on `/intelligence/$month` derives from the note's `month` field, so a frozen month and its interpretation stay linked permanently.
- The leads table and admin queue are internal; nothing in the lead pipeline touches a public route.
- Sitemap: add `/intelligence/notes` and each note slug to `src/routes/sitemap[.]xml.ts`.
- Tests in `src/lib/intelligence/__tests__/notes.test.ts`: label/source integrity, exhibit requirement for proven-mechanism, unique slugs, every `month` value referencing a real frozen month.
