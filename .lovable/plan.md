# How It Works — clarity pass for an evaluating newcomer

User note: the current hero subhead says "Four steps, no manual exports." That phrase makes no sense here and should be removed/replaced.

Read as someone who has the pain (AI bill rising, no idea which workload), already believes the problem, and is now checking whether this is real and whether they can run it. Today the page tells them what CostMyAI *believes*. It does not answer what they *do*, what it *costs them in effort*, or what they *see first*.

## What is unclear today

1. **"One environment variable" is never shown, and it is not the whole truth.** The phrase appears in the hero, the closing CTA and step 01. The real setup, per the in-product Quickstart, is a small connector you run yourself, one per provider, and then you point your SDK's base URL at it. An engineer who signs up expecting a single env var and finds a container to run feels misled at the worst possible moment. This is the single biggest clarity problem on the page.

2. **No prerequisites and no time-to-value.** Nothing states: no provider keys needed, works with your existing SDK, how long setup takes, how much traffic must flow before the first verdict appears, and that the catalog comparison works even before any traffic exists.

3. **Step 01 is a five-clause wall.** Connect, forwarding, what we see, prompt bodies, and optional local classification are all one paragraph. The privacy answer — the thing this reader is scanning for — is buried mid-sentence.

4. **No compatibility answer.** Which providers, streaming, added latency, what happens if the connector is down. An evaluating engineer will not proceed without these, and today they must leave for /faq to find any of them.

5. **The four levels read as a price list, not a diagnosis.** Four long blocks with screenshots, no "which one is me" signal. A newcomer cannot tell whether they should start at Compare or need Govern.

6. **The page ends without handling objections.** The closing CTA asks for signup immediately after the plan blocks, with no risk-reversal beat in between.

## What to change

**A. Make the connect step concrete and honest.**
Replace the vague "one environment variable" claim on this page with what actually happens, and show it. Add a compact snippet block under step 01 with provider tabs (OpenAI / Anthropic / Gemini) rendering from the existing `PROVIDER_PRESETS` in `src/lib/ingest/contract.ts` — the same source the in-product Quickstart uses, so marketing and product can never drift. Show the env-var line and the SDK one-liner. Keep the claim honest: your application keeps sending its own provider key, and the only line that changes is the base URL.

**B. Fix the hero subhead.**
Remove the nonsensical "no manual exports" phrase. Replace with a single honest line that previews the page: the connector runs in your environment, you keep your provider keys, and the only change is your SDK base URL.

**C. Add a "Before you start" strip between hero and steps.**
Four short facts, no cards, hairline separated: no provider keys required; works with your existing SDK; setup measured in minutes, not a migration; Compare's price catalog is useful the moment you sign up, verdicts arrive once real traffic has flowed.

**C. Split step 01 copy.**
Split the current body into a short lead (what you do) and move the prompt-content / local-classification detail into the bullet list, where the reader is already scanning for it. Edit `HOW_STEPS` in `src/lib/how-it-works.ts` so the homepage teaser inherits the tighter lead. No new promises, same claims.

**D. Add a "Which level is you" line above the plan blocks.**
One sentence per level in a compact hairline list — "you want to know if a cheaper host exists", "you need to prove quality before you switch", "you want the switch executed", "you want it executed continuously and audited" — then the existing detailed blocks below.

**E. Add an objections beat before the closing CTA.**
Six short Q/A pairs reusing the existing `FAQ_CLUSTERS` items in `src/lib/faq/questions.ts` (keys, what we see, quality risk, no-safe-alternative, multi-provider risk), plus two page-specific ones on latency and connector failure behaviour. Emit `FAQPage` JSON-LD for that subset, matching the pattern already used on /faq, and link through to /faq for the rest.

**F. Update the meta description** to lead with what the reader gets rather than the four step names.

## Technical notes

- Copy edits land in `src/lib/how-it-works.ts` (shared with the homepage teaser) and `src/routes/how-it-works.tsx`. The hero subhead lives only in `src/routes/how-it-works.tsx`.
- The snippet block reads `PROVIDER_PRESETS` from `src/lib/ingest/contract.ts`. Confirm that module is client-safe before importing into a marketing route; if it pulls server-only code, lift the preset array into a browser-safe module and have both surfaces import that.
- New sections follow the logged marketing visual standard: no cards, hairline rails, tiered wash/mesh backgrounds, existing `Reveal`. Ribbon placements stay exactly as they are.
- FAQ JSON-LD goes in the route `head()`, questions and answers matching the rendered text verbatim.
- No changes to plan data, entitlements, pricing or any engine logic.

## Open question

The honesty fix in A depends on how you want to frame setup. Either state the connector plainly ("run the connector, point your base URL at it"), or keep a lighter frame if a hosted endpoint is on the near roadmap. The plan assumes the plain framing.
