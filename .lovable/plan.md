# Dispatch 171 — demo-vs-real parity audit (findings, no build)

Environment for every artifact below: real workspace `5e7ad1de-a195-4bcb-a579-d60de6c2c0ed`
("Robinpetermueller's workspace", plan `certify`, 6 events, 237 tokens, $0.001445 spend),
loaded signed-in as mail@costmyai.com in a real browser. Screenshots and full page text:
`/tmp/browser/d171/shots/workspace{,_compare,_certify,_rightsize,_govern}.{png,txt}`.
Zero console errors on all five pages.

Org inventory (psql):

```text
00000000-…0001 Demo Workspace           govern  synthetic  1,454,055 events
00000000-…0002 Partner Demo Workspace   govern  synthetic    218,276 events
5e7ad1de-…     Robinpetermueller's      certify real               6 events
ee5054ac-…     Costmyai-test            compare real               0 events
```

## Area 1 — Formula parity across every tile

Every tile on all four rung pages resolves through the same snapshot builder
(`src/lib/dashboard.server.ts:buildDashboardSnapshot`) and the same shared derivations
(`src/lib/dashboard/figures.ts`), with no scope argument reaching any formula. `scope` only
ever selects `orgId` and link targets (`useDashboardController.ts:143,148`,
`levels.ts:66`). Tiles confirmed rendered on the real org (seen in the captured text, not
inferred):

- Compare: Spend, Cheaper hosts identified, Available, Best single saving, On cheapest host,
  ring — `CompareLevel.tsx:56-118` via `levelSaving(data,"host_arbitrage")` (`figures.ts:33`).
- Certify: Spend, Arbitrage saving, Benchmark saving, Patterns checked, Refused on quality,
  Certification rate, ring — `CertifyLevel.tsx:55-119`, rate from `figures.ts:63`.
- Rightsize: Spend, Arbitrage/Benchmark/Rightsize saving, Captured, Available, Savings
  captured, Frozen switches, ring — `RightsizeLevel.tsx`, capture from `figures.ts:57`.
- Govern: the six above plus Running unattended, New candidates eligible, Held for you,
  Minimum to act, Cooldown, ring — `GovernLevel.tsx:120-181`.
- Gateway usage (spend/requests/in/out tok) appears identically on all four.

Two tiles are **not** proven parity-safe by this run because the real org's value is
structurally trivial, not because the path differs:

- "Best single saving" and "Cheaper hosts identified" only ever exercised their zero branch.
- "Frozen switches", "Running unattended", "Held for you", "Cooldown last-change" have never
  rendered a non-zero on any real org (0 real switches exist system-wide — `switches` has
  rows only for the two synthetic orgs).

## Area 2 — Zero/near-zero correctness

No NaN, no `Infinity`, no negative percentage, no broken donut anywhere; the rings render a
0% arc cleanly at a zero denominator. Real defects found:

1. **`On cheapest host = 100%` at zero spend.** `CompareLevel.tsx:61` —
   `coveragePct = measuredSpend > 0 ? … : 100`. The page asserts "100% of your spend already
   optimal" for a workspace whose spend was never measurable. The honest zero-denominator
   answer is "—", not a claim of optimality.
2. **"Refused on quality" is the wrong label for these refusals.** Certify shows
   `REFUSED ON QUALITY · 2 candidates · cheaper, but not provably equivalent` and the footer
   sentence "…the measured quality gap fell outside the equivalence band". The two real rows
   say the opposite in their own detail: *"no independent instrument measures this task
   type"* (untagged traffic). `qualityRefused` (`pipeline.ts:69`) is one bucket covering both
   "measured and failed" and "nothing to measure with". At n=2 on a real account, the tile
   and the footer both state something untrue.
3. **`Certification rate 0%`** is `certified/evaluated` where `evaluated` counts workloads
   that were never certifiable. Same root cause as (2).
4. Copy that is correct at n=0 and worth keeping: `zero-data-copy.ts` variants all fired
   correctly ("This check found no oversized workload findings in this window", List C
   per-row verdicts).

Costmyai-test could **not** be loaded live: it belongs to user `d1eaeb92-…`, and only
Robin's session is available. Untested.

## Area 3 — Plan-gating on each rung's own page

Robin is `certify`; Rightsize and Govern are above his plan. Both pages render in full with
inert controls and a real upsell block ("Unlock Rightsize", "Upgrade to Govern"), no row
detail, which matches `gateLevel` (`dashboard/plan.ts:29`). Overview's teaser and the rung
pages agree — but **both sides are $0/0, so this is a vacuous match**. Parity between
teaser and page for non-zero locked money has never been observed on a real org: the only
orgs with traffic are both on `govern` and therefore never locked.

Also observed, and a real demo-vs-real divergence: the sidebar hides levels *below* the
current plan on a real workspace (`DashboardSidebar.tsx:82-90`, `planAtLeast(required, plan)`),
so Robin's Overview lists Overview/Certify/Rightsize/Govern with no Compare entry, while
`/workspace/compare` still renders fully when reached directly. Demo lists all five. Whether
that is intended ("nav is an upsell path, never a way back down") is a product call, but it
means a paying customer cannot navigate to a level they are entitled to.

## Area 4 — Other live-style claims

- "Prices verified just now." (`DashboardShell.tsx:257`) — **backed**. Reads
  `pricing_snapshots.synced_at`, and the ledger shows 204 pricing-sync runs today, latest
  11:15 UTC.
- "No events for 100h / last event arrived 4d ago / Paused · no events arriving" — **backed**
  by real `usage_events.max(occurred_at) = 2026-08-06 07:45`.
- "Cooldown 72h" (`GovernLevel.tsx:166`) — **not a countdown**, it is the static policy
  constant `DEFAULT_AUTONOMOUS_POLICY.cooldownHours` with a real subtitle ("no autonomous
  change yet" / last-change timestamp). Honest today, but the tile reads like a timer; it
  would still print "72h" while a cooldown was half-elapsed.
- "Switch active — traffic not yet moved" / frozen status — never rendered on a real org
  (0 real switches). Cannot be confirmed live; see Area 5.
- No second "Live · streaming"-class violation found.

## Area 5 — Execution-state labels with zero real switches

Today, on the real org, **no execution-state label renders at all**. The four Dispatch 159
tones are attached to switch rows, and there are none, so Rightsize/Govern show only the
empty state: *"0 REROUTING — Nothing rerouted yet. Activating a same-provider switch starts
rerouting immediately; a switch to another provider is recorded here and waits for you to
allow routing to it."* That sentence does carry the phase distinction, so the empty state is
honest; the label/gate chain itself is unexercised.

To verify the chain end-to-end the first time a real switch exists, three things must be
true: (a) a real recommendation with a priced destination on the same host, (b) a real
`org_provider_routing` grant row for that host, (c) real post-switch traffic so
`recomputeSwitchSavings` can book a non-zero `saved_usd`. None exist for any real org today.

## Area 6 — Stale-sync / partial-data detection: **real bug found**

Overview prints "Projected month-end — Unavailable — recent data gap (3 days not collected)".
The ledger says the opposite: `usage-tick` ran `ok` on every day of the trailing 7-day window.

Reproduced the classifier against the real database
(`classifySyncHealth` with the exact production query):

```text
byDay: 08-03 unknown, 08-04 observed, 08-05 observed,
       08-06 absent, 08-07 absent, 08-08 absent, 08-09 absent
gapDays: 4
```

versus psql on the same rows: 08-06 `ok`×1428, 08-07 `ok`×1419, 08-08 `ok`×1397,
08-09 `ok`×1015. Cause: `sync-health.server.ts:42` reads the ledger with `.limit(10_000)`
and no ordering, while the window holds ~1,400 rows/day — the read is truncated and the
un-returned days are classified `absent`. The projection is being suppressed on a real
customer's dashboard by a phantom gap.

Second, structural: `USAGE_COLLECTOR_JOBS = ["usage-tick"]` (`sync-health.ts:29`) is the
**synthetic demo ticker**. Real ingest writes no `sync_runs` row, so a real org's gap
verdict is entirely a function of whether the demo generator ran. It is not org-scoped and
carries no information about that customer's collection.

## Area 7 — Demo/real code-path leakage sweep

Full grep of `src/` for `is_synthetic` / `org_is_synthetic` / hardcoded demo org ids
(`00000000-…0001/0002`) outside tests. Everything found, with a verdict:

- `dashboard.server.ts:464` — the known plan bypass (`is_synthetic ? recordedPlan : effectivePlan(...)`). Confirmed the only one on the render path.
- `benchmark/benchmark.server.ts:110` — `.eq("is_synthetic", false)`; correct, keeps synthetic orgs out of the k-anonymity cohort.
- `synthetic/tick.server.ts:48` — `.eq("is_synthetic", true)`; the generator only ever writes to synthetic orgs.
- `ingest/fallback.server.ts:71,88,154` — carries the flag through to alerting so test fallbacks don't page; no branch on the dashboard path.
- `keys.functions.ts:41,48` — `org_is_synthetic` RPC, used to refuse API-key minting on demo orgs.
- `access.ts:16,18`, `supabase-public.server.ts:29` — demo org ids used only to resolve which org the public/demo route reads.
- No demo-only fallback, no synthetic branch in the engine (`src/lib/engine/*`), figures, forecast, execution-copy, or any level component.

Conclusion: `dashboard.server.ts:464` remains the only silent branch on synthetic status.

## Area 8 — Non-happy-path Stripe/plan states: **one real production risk**

No real account exists in trial, past_due, canceled or downgrade; none was created
(this is an audit). What can be stated from real artifacts:

- `subscriptions` holds exactly two rows: demo org `govern/active/**live**`, Robin
  `certify/active/**sandbox**`.
- The dashboard filters by `paymentsEnvironment()` (`dashboard.server.ts:429`), which returns
  `live` when the build's token starts `pk_live_` (`billing/env.server.ts:13`).
  `.env.production` carries a `pk_live` token; the preview build carries a test token.
- Therefore **the published site resolves no subscription for Robin and drops him to
  `compare`**, while the preview shows `CERTIFY PLAN`. Same account, two different products,
  depending on which build you open. This is the highest-severity item in this area and it is
  a fact about existing rows, not a hypothetical.
- Logic for the other states is centralised (`billing/entitlement.ts:21-41`): `trialing` and
  `past_due` keep the level, `canceled` keeps it until `current_period_end`, everything else
  falls to `compare`. Fail-closed, no crash path — but **unverified against a rendered page**,
  because no account is in any of those states.

## Area 9 — Formatting at real-world scale extremes

Real numbers, real rendering, from the captured pages:

- Hero "Spend · last 30 days" prints **`$0.00`** where the measured spend is `$0.001445`.
- "Blended cost / 1M tok" prints **`$0.00`** beside "237 tokens processed".
- Gateway usage widget prints **`$0.00`** spend with 6 requests.
- "▲ 0.0% vs previous" against a zero previous window.
- Rightsize hero: "$0.00 already saved. $0.00 left on the table." then a paragraph of eight
  `$0` terms.

No truncation, clipping or overflow at any width — the Dispatch 168 auto-fit is not stressed
by short strings. The defect here is **rounding, not layout**: a real customer with genuine
non-zero spend is shown `$0.00`, which reads as "no data" and is indistinguishable from the
Costmyai-test org that truly has none. Sub-cent spend needs either more significant digits
or a "< $0.01" form.

## Ranked findings

1. **Phantom sync gap suppressing the real projection** (Area 6) — truncated ledger read,
   plus gap detection keyed to the synthetic ticker.
2. **Production/preview plan divergence for a real paying account** (Area 8) — sandbox
   subscription row versus `pk_live` production build.
3. **"Refused on quality" mislabels instrument-less refusals** (Area 2) — the tile, the hero
   sentence and the footer all assert a measurement that did not happen.
4. **`$0.00` masking real sub-cent spend** (Area 9).
5. **`100% already optimal` at a zero denominator** (Area 2).
6. **Compare hidden from the sidebar for a Certify customer** (Area 3).
7. **Cooldown tile reads as a timer but is a constant** (Area 4).

## Explicitly not testable in this pass

- Costmyai-test's own rendering (no session for that user).
- Teaser-versus-page parity for **non-zero** locked money (no real org is both locked and
  carrying traffic).
- Execution-state labels, frozen switches, "traffic not yet moved" (0 real switches exist).
- Trial / past_due / canceled / downgrade rendering (no account in those states).

No code was changed in this dispatch.
