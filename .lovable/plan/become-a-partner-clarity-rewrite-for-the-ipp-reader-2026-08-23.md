# Become a Partner — clarity rewrite for the IPP reader

Read as a fractional CTO or small technical agency who already advises 3-5 clients on infrastructure: someone who does not need income from a referral fee, but needs something that makes them look sharper than the next advisor in the room.

## What the page gets wrong today

1. **It sells commission first, advantage second.** Hero, stats row, and the whole second section are about the payout ladder. The IPP's fit test #3 says the deciding question is "does recommending this make me look better?" — that answer is currently buried in a single hero sub-line and a Commitment bullet.
2. **The reader can't tell if their clients qualify.** Nothing on the page says who this actually works for. A reader with five ICP-shaped clients and a reader with one generic client get the identical page and neither self-identifies.
3. **The multi-client compounding angle is missing entirely.** The strongest IPP insight (one trust relationship, many clients, sourcing cost paid once) never appears. The page treats each referral as a one-off event.
4. **No proof the recommendation is safe to make.** An advisor stakes reputation on the pitch. The page never says what happens on the client's side: free level, no product change, no rip-and-replace, hours not weeks. "The free level already cuts their bill" is the only hint and it reads as marketing.
5. **"Opportunity" is a fake stat.** The third hero stat has no number and no meaning next to a real commission percentage.
6. **No language for the conversation itself.** Partners need the sentence they'd actually say to a client. Nothing on the page is quotable.
7. **The neutrality block is filed under Steps**, where its real job — reassuring the advisor they will not lose control of their own client relationship — is invisible.

## The rewrite

Same visual standard, same section rhythm, same components. Copy and section order change; a small amount of new structure.

**Hero (mesh, unchanged treatment)**
- H1 shifts from payout to advantage: the recommendation that makes you the person who found the money.
- Sub-line names the reader explicitly: fractional CTOs, technical advisors, and the agencies that built the product and still own the relationship.
- Stats row: keep the real top commission rate, keep Lifetime, replace "Opportunity" with a real figure already on the page's loader (tracked price moves) labelled as the market data partners get pre-publication.

**New section 2 — "Is this you?" (Tier 0, plain)**
Three-line self-qualifier drawn straight from the IPP fit test, written as statements the reader agrees or disagrees with, not a form:
- your clients ship real product with real, moving AI spend
- when infrastructure or vendor cost comes up, you are the one they ask
- you want one more reason to be right in front of them

Closing line makes the multi-client point: the trust was already paid for once, and it applies to every client you touch.

**Section 3 — "What you actually put in front of a client" (Tier 1 wash, keep the horizontal ribbon)**
The safety case, in the advisor's terms: free level first, no product rewrite, connect and read before anything switches, and a number they can bring to a client call the same week. This is the section that decides whether the pitch costs social capital.

**Section 4 — the conversation**
One short, verbatim sentence a partner can actually say, plus the honest counterpart of what CostMyAI will not claim on their behalf. Keeps the page's no-overclaim voice.

**Section 5 — Ladder** (unchanged mechanics, moved below the advantage argument, lead rewritten to frame the rate as compounding across a client base rather than per deal).

**Section 6 — The deal / Promises** (unchanged content; it is already precise and it belongs here, after the reader has decided they want in).

**Section 7 — Beyond the commission** (unchanged Live/Commitment honesty split; promote the badge and pre-publication data because those are advantage items, not perks).

**Section 8 — Steps**, with the neutrality block pulled out of it and given its own hairline moment titled around the client relationship staying the partner's.

**Closing CTA** (mesh) — unchanged structure, copy aligned to the new promise.

## Technical notes

- Single file: `src/routes/partners.tsx`. Copy constants (`PROMISES`, `STEPS`, `BEYOND`) plus new `QUALIFIERS` and `SAFETY` arrays; new `IsThisYou`, `TheCase`, `Neutrality` section components using the existing `SectionHead`, `Reveal`, `CountUp`, `PriceDriftRibbon` primitives.
- No new data. The `moves` figure already comes from `marketingStatsQuery` in the loader; the top rate already comes from `partnerLadderQuery`.
- Background tiers follow the site standard: mesh hero, plain / wash alternation, mesh closing CTA. Ribbon orientations stay diagonal (hero), horizontal (wash section), vertical (Beyond).
- Final step: update the route `head()` — title, description, og:title, og:description — so metadata matches the new advantage-led promise, keeping the absolute canonical and og:url.
