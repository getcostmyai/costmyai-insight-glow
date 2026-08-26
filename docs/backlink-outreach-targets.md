# CostMyAI — Backlink Target List

Source for target selection: Semrush backlink profiles of `cloudzero.com` and `finout.io` (category leaders in AI/cloud cost management).

Our one unfair asset for outreach: **live model price-move data** (every tracked provider, every price change, with dates). Nobody else publishes it as a citable dataset. Every pitch below leads with that, not with "please list our product."

Canonical links to hand out:
- Guide: https://www.costmyai.com/guides/ai-cost-management
- Comparison tool: https://www.costmyai.com/tools/llm-price-comparison
- Estimator: https://www.costmyai.com/estimator
- Intelligence notes: https://www.costmyai.com/intelligence

---

## Tier 1 — Self-serve directories (do these first, 1-2 hours total)

Free, no gatekeeper, indexable follow or nofollow-but-crawled listings. These build the baseline profile that makes Tier 2/3 pitches look credible.

| Target | Why it matters | Action |
| --- | --- | --- |
| SaaSHub | Appeared repeatedly in both leaders' profiles; ranks for "<tool> alternatives" | Submit as alternative to CloudZero, Finout, Vantage |
| Postmake | High-frequency source in leader profiles | Free submit |
| SaaSpo | Design/SaaS gallery, links homepage | Submit homepage screenshot |
| AlternativeTo | Ranks for comparison intent | Add as alternative to CloudZero, Helicone, Langfuse |
| Product Hunt | Launch + permanent product page | Launch with the price-move dataset as the hook |
| BetaList / Uneed / Peerlist | Low effort, real crawlable pages | Submit |
| G2, Capterra, GetApp | Buyer-intent category pages | Claim listing in "Cloud Cost Management" + "AI Ops" |
| Futurepedia, There's An AI For That, AI Tool Hunt, TopAI.tools | AI-tool directories, high volume | Submit under "AI cost / analytics" |
| OpenAlternative, Awesome-* GitHub lists | Dev-audience, strong follow links | PR to relevant `awesome-finops` / `awesome-llm-ops` lists |

Rule: every submission uses the same one-liner so the anchor text stays consistent.

Suggested one-liner: *"CostMyAI prices every AI workload against live model pricing and names the cheaper route. Tracks price changes across all major providers."*

---

## Tier 2 — FinOps / DevOps communities and media

These are the links that actually move rankings for "ai cost management" because they sit in-topic.

| Target | Angle |
| --- | --- |
| FinOps Foundation (community content, Slack, blog contributions) | Contribute a piece on FinOps for LLM spend — genuinely new subdiscipline, they want content |
| Opsmatters | Aggregates vendor/technical posts; submit feed |
| Dev.to / Hashnode cross-posts | Republish the guide with canonical back to costmyai.com |
| r/FinOps, r/LocalLLaMA, r/devops | Share the price-change dataset as a finding, not a launch |
| Hacker News (Show HN) | Lead with the price-move history, not the SaaS |
| Lobsters, Hackernoon | Technical write-up of the switching/counterfactual pricing math |
| InfoQ / The New Stack (contributor pitch) | "What LLM price volatility does to your unit economics" |

---

## Tier 3 — Roundups and listicles to pitch

Pattern from the leaders: most of their mid-tier links are "best X tools" posts. These are pitchable because the authors update them for traffic.

How to find fresh ones each month:
- `"best ai cost management tools" 2026`
- `"llm cost" "tools" intitle:best`
- `"cloud cost" tools list -site:cloudzero.com`
- `"CloudZero" "Finout" alternatives`

Pitch template (short, one ask):

> Subject: data for your AI cost tools roundup
>
> Hi [name] — your [post title] is the piece people land on for this.
> One thing it can't currently show: how fast the underlying prices move.
> We track every price change across the major model providers, and the
> history is public: https://www.costmyai.com/tools/llm-price-comparison
>
> Free to cite or screenshot, no attribution required beyond a link. If
> CostMyAI fits the list, we're at [one-liner]. Either way the data is
> yours to use.
>
> — Robin

Why this works: the first ask is a citation of data, not a listing. Editors say yes to data.

---

## Tier 4 — Press and syndication

Only worth effort with a real news event (funding, a notable dataset finding, a partner milestone). The leaders' mainstream press links are all PR-triggered.

Reusable news hooks we already own:
- "Model prices dropped X% in N months" — publish quarterly from `price_history`.
- "The cheapest route for the same output changed N times this quarter."
- Partner program milestones.

Route: publish the finding as an Intelligence note first, then pitch it to newsletters (Ben's Bites, TLDR AI, The Neuron, Import AI) as a data item. Newsletters link out and get scraped by aggregators.

---

## Order of operations

1. Week 1 — Tier 1 submissions, all of them. Consistent one-liner.
2. Week 1 — publish the price-move dataset as an explicitly citable page (open license note).
3. Week 2 — Tier 3 pitches, 15-20 roundups, data-first template.
4. Week 2-3 — one FinOps Foundation / New Stack contribution pitch.
5. Monthly — one quarterly-style price-move finding, sent to newsletters.

Track every send with the outreach status (sent / replied / linked) so the second pass doesn't repeat the same editor.
