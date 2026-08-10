# Dispatch 169 — Donut freshness and the "Live" claim (audit, real workspace)

All evidence below is from the **real, non-demo** path: signed in as mail@costmyai.com,
org `5e7ad1de-…d60de6c2c0ed` ("Robinpetermueller's workspace", plan `certify`, non-synthetic),
loading `/workspace/*` in a real browser.

## 1. Is the donut computed fresh, or cached?

Fresh, per request. No server cache, no CDN cache, no materialized view, no snapshot table.

- Route → component → data: `src/routes/_authenticated/workspace.compare.tsx:6` →
  `LevelScreen scope="mine"` (`src/components/dashboard/LevelScreen.tsx:18`) →
  `useDashboardController` (`useDashboardController.ts:38`) →
  `dashboardQuery(range, objective, "mine")` (`src/lib/dashboard-queries.ts:19-33`) →
  `getMyDashboardSnapshot` (`src/lib/dashboard.functions.ts:60-92`) →
  `buildDashboardSnapshot` (`src/lib/dashboard.server.ts`).
  This is the same file the customer's browser hits — `scope` is the only difference from demo,
  and the only demo-specific branch anywhere in the snapshot is the plan bypass at
  `src/lib/dashboard.server.ts:464` (`is_synthetic ? recordedPlan : effectivePlan(...)`).
  No donut input is branched on synthetic.
- The engine runs in-request: rollups, `host_prices`, `benchmarks`, `benchmark_margins`,
  `model_catalog` are read at `dashboard.server.ts:359-437` and fed to `runPipeline`.
  Compare's and Certify's donut numbers are pipeline output, not a read of `recommendations`.
  Rightsize's/Govern's captured number is `switches.saved_usd`, recomputed at ingest.
- Measured: three consecutive loads of `/workspace/compare`, `_serverFn` response bodies carried
  three distinct `generatedAt` values — `10:27:11.635`, `10:27:14.414`, `10:27:18.062` — with
  **no `Cache-Control` header** on the RPC response. Recomputed every time.
- The only TTL in the chain is client-side: `staleTime: 60_000` (`dashboard-queries.ts:30`).
  `QueryClient` is constructed with no default options (`src/router.tsx:6`), so React Query's
  defaults apply: refetch on mount and on window focus, once the 60s staleness has elapsed.
  There is **no `refetchInterval`** on the dashboard query.

## 2. Is it org-scoped?

Yes, twice over — explicit filter *and* RLS.

- The org id never crosses the wire: it is resolved server-side from `memberships`
  (`dashboard.functions.ts:73-80`), then every read is `.eq("org_id", orgId)` —
  `dashboard.server.ts:363, 404, 416, 422, 428, 664, 679, 810, 833`.
- The read runs through the caller's RLS client (`context.supabase`,
  `dashboard.functions.ts:90`). Policies on `usage_rollups`, `usage_events`, `switches`:
  `is_org_member(org_id) AND (is_synthetic = org_is_synthetic(org_id))`.
- Proof it is not a global aggregate: global 30-day rollup spend is **$33,578.23**; this org's
  own 30-day rollup spend is **$0.001445 over 6 requests**. The real dashboard renders
  `SPEND · LAST 30 DAYS $0.00`, `6 requests`, `96 input tok`, `PATTERNS CHECKED 2`,
  `CHEAPER HOSTS 0% of $0 spend`. It is showing this org, not the dataset.

## 3. Would a real org's traffic change show up without a deploy or cache bust?

Yes, and the mechanism exists in code:

`POST /api/public/v1/events` → `ingestEvents` → `rebuildRollups(orgId, timestamps)`
(`src/lib/ingest/ingest.server.ts:130`), which re-derives every touched hour and day bucket from
the stored events in the same request; rerouted batches additionally call
`recomputeSwitchSavings` (`ingest.server.ts:145-150`), which is what moves the Rightsize/Govern
captured numerator. The next snapshot read re-runs the pipeline over those rollups.
No cron, no refresh job, no build step sits between ingest and the donut.

Not testable live today: this workspace's last event was **2026-08-06 07:45Z** (99h ago) and we do
not hold the plaintext ingest token, so the end-to-end write was not exercised in this audit.
The statement above is a code trace, not an observed round trip — flagged as such.

## 4. Actual refresh cadence a real customer experiences

- Server figures (including all four donuts): recomputed **only when the query refetches** —
  on mount, on route change into a level, and on window focus, subject to the 60s `staleTime`.
  A customer who leaves the tab open and focused sees the donut sit still indefinitely.
- Between refetches the *counters* move: `useLiveTotals` (`src/lib/gateway-metrics.ts:32-70`)
  accrues spend/requests/tokens forward every 1.8s at the window's average rate, with
  deterministic jitter, whenever `ingest.state === "live"`.
- Upstream cadence: the container flushes every **30s** by default
  (`packages/gateway-container/src/config.ts:76`).

## FINDING A (live-claim violation) — "Live · streaming from your gateway"

`src/components/dashboard/levels/OverviewLevel.tsx:159` shows that banner whenever the newest
event is under 3h old (`QUIET_AFTER_HOURS = 3`, `src/lib/dashboard/ingest-health.ts:21,55`).
Nothing streams: there is no realtime channel, no SSE, and no polling interval on the dashboard
query. The only thing moving on screen is a client-side extrapolation. Under the LIVE-is-absolute
rule this is a claim the mechanism does not back — it needs either a real refresh mechanism
(`refetchInterval` aligned to the 30s flush, or a realtime subscription) or honest copy
("last event 4m ago", "updates when you reload").

Correctly, the real workspace today shows the *quiet* branch — "No events for 99h" — so the
violation is latent, not currently on screen for this org. It would fire for any customer whose
gateway pushed within the last 3 hours.

## FINDING B — Compare and Certify donut denominators are not measured

Both rings divide by `live.spend`, the extrapolated counter, not the measured window total:
`CompareLevel.tsx:47,115` and `CertifyLevel.tsx:126`. Numerator (`available`,
`certifyIdentified`) is the fixed server figure. So the percentage in the ring drifts downward
every 1.8s on spend that was never observed. Rightsize (`RightsizeLevel.tsx:207`) and Govern
(`GovernLevel.tsx:191-192`) use server figures on both sides and do not have this defect.

## FINDING C (minor) — stale rationale behind the quiet threshold

`ingest-health.ts:19-21` justifies the 3h quiet threshold with "the container polls hourly".
The container's default flush is 30s (`config.ts:76`). The threshold may still be the right
number, but the reason recorded for it is no longer true, which is how a threshold quietly
stops matching the system it guards.

## Proposed fixes (not built — awaiting your call)

1. Decide the real cadence for Findings A: either add `refetchInterval` (30–60s) to
   `dashboardQuery` while `ingest.state === "live"`, or change the Overview banner copy to state
   what actually happens.
2. Finding B: divide the Compare/Certify rings by the measured `data.totals.spend`, leaving the
   ticking counters to the hero stats where accrual is disclosed.
3. Finding C: restate the threshold's basis against the 30s flush interval, or re-derive it.
