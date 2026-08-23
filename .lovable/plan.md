# Intelligence page: clarity pass

Read through `/intelligence` as two strangers.

**Reader A** has the pain (AI spend is climbing, prices keep moving) but has never heard of CostMyAI.
**Reader B** wants to post about AI cost and token economics on LinkedIn and is hunting for real, defensible numbers that make them look like an expert.

Both hit the same walls. The data is strong; the page does not tell either of them what to do with it.

## What is unclear today

**For reader A**

1. The hero says "The market moves. We prove by how much." It never says what CostMyAI is or what the page is for. There is no one-line orientation before the first three big numbers.
2. The figures land without a yardstick. "1,931 price moves" reads as impressive or meaningless depending on whether the reader knows the universe it came from and the window it covers. The "we only started recording on X date" caveat currently sits far down the page, inside the repricers block.
3. Vocabulary is assumed, not taught: MTok, blended, the band, task class, measurement margin, benchmark saturation, repricers, new listings vs new models. Reader A does not yet know that "the band" is the whole product idea.
4. The two CTAs ("Start free", "Book a Demo") sit in the hero before anything has been proven, and never reappear after the sections that actually do the proving.

**For reader B**

5. There is no citation. The archive section promises figures are "permanently linkable" but the page hands out no ready-to-paste line such as: CostMyAI Intelligence, August 2026, retrieved 23 Aug 2026, costmyai.com/intelligence/2026-08.
6. There is no stated reuse permission. A careful poster will not repost a chart if nobody said they may.
7. There is no way to take the data. No CSV or JSON of the month, so anyone building their own chart has to retype numbers.
8. Per-card share buttons exist, but nothing offers a share of the month as a whole, and the copied text does not carry the number, the window and the source together, which is exactly what a post needs.
9. Live vs frozen is not explained where it matters. Share controls quietly cite the newest frozen month while the reader is looking at moving live numbers. That is the right behaviour and reader B would trust it more if the page said so.
10. Method is the last section. For a reader whose whole purpose is to check whether the data is trustworthy, provenance arrives after they have already scrolled past everything.

## What to change

**1. Hero orientation line**
Add one sentence under the H1: what this page is, where the numbers come from, how often they update. Keep the H1 as it is.

**2. Move the window caveat up**
Surface "recording began <date>, so this is a <n>-day window" as a small line beside the hero figures, not only inside the repricers block. It protects the numbers from being misquoted and it reads as confidence, not apology.

**3. Read-this-page strip**
A compact definitions rail directly after the hero: MTok, blended move, the equivalence band, task class, measurement margin. Plain sentences, no cards, hairline separated, in the current type scale.

**4. Cite and reuse block**
A new section after Quality per dollar:
- a copy-to-clipboard citation line for the citable month, with retrieval date;
- an explicit permission sentence: figures and charts may be reposted with attribution and a link back;
- the canonical permalink to the frozen month.

**5. Take the data**
Download buttons for the current or frozen month as CSV and JSON, served from an existing public endpoint pattern, containing the moves, spreads and band winners already rendered on the page.

**6. Share the month**
One share control at month level next to the hero figures, alongside the existing per-card buttons. Copy text carries figure, month, and source together so a pasted post is already correctly attributed.

**7. Explain live vs frozen once**
A single sentence where the share controls first appear: live figures move, share links cite the frozen month so a citation cannot drift.

**8. Method earlier, proof at the end**
Move the Method section above Notes so provenance is reached before the archive, and place a closing CTA after Method, where the argument has been made.

## Reader B is the distribution channel

Reader B does not just read, they republish. Every post is free reach with our name attached, so the page should be built to be lifted from. Beyond citation and download above, these shareable objects do not exist yet.

**9. A number of the month**
One designated headline figure per month, chosen by rule rather than by taste (largest single move, or largest provider spread). It gets its own permalink, its own image, and a one-line explanation. This is the thing a poster looks for and cannot currently find, because the page opens with three equal figures and no verdict.

**10. Direction of the market, in one line**
Increases versus decreases as a single stated reading: prices in this month fell or rose on balance, by this much. The donut shows the split, but nobody can quote a donut. This is the most repostable sentence on the page and it is currently left for the reader to derive.

**11. A trend line across months**
Once several months are frozen, a chart of the blended index across the archive. A single-month snapshot is a fact, a trend is a story, and a trend is what gets shared and re-shared. Ships when the archive holds enough closed months, gated so it never renders a two-point line.

**12. Image export sized for the feed**
Share cards already produce an OG image. Add a download of the same card as a PNG in feed proportions, so a poster can attach it as an image post rather than a link preview. Link posts are throttled on LinkedIn; image posts are not, and a poster who has to screenshot the page will crop our attribution off.

**13. A pre-written post draft**
Next to each share control, a copy-the-post button producing three lines: the figure, the window it covers, and the source with link. Not marketing copy, just the fact stated correctly. It removes the last friction between reading and posting, and it guarantees the number is quoted with its caveat.

**14. Bring them back next month**
The page has an embed but no reason to return. A monthly notification, one message when the month freezes, carrying the number of the month and the permalink. A recurring poster is worth more than a hundred one-time readers.

**15. Say the reuse rule out loud, early**
The permission sentence from item 4 should also appear where the first share control appears, not only near the bottom. A poster decides whether they may repost long before they reach the archive.


## Technical notes

- Copy and layout changes live in `src/components/marketing/IntelligenceReport.tsx`, plus the hero blocks in `src/routes/intelligence.index.tsx` and `src/routes/intelligence.$month.tsx`. One renderer serves both routes, so all shared sections change in one place.
- Definitions rail, cite/reuse block and month-level share become small components in the same file or beside it, reusing `SectionHead`, `Reveal` and `ShareControls`.
- CSV/JSON export follows the existing public widget route pattern under `src/routes/api/public/`, reading the same payload the page renders so the download can never disagree with the page.
- Citation and download both target `ctx.citableMonth`, matching the existing share behaviour.
- Visual language stays as it is now: mesh hero, wash-brand tiers, ribbon in three orientations, no cards, no serif numbers, no em-dashes.
- Number of the month, direction line and post drafts derive from the payload already rendered, chosen by a deterministic rule so the live page and the frozen month agree.
- PNG export and the monthly notification reuse the existing share-image renderer and the existing email sending setup respectively.
- The cross-month trend chart reads the frozen archive payloads and stays hidden until enough closed months exist.
- No engine, pricing or data-collection logic changes.

