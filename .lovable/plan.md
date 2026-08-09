# Dispatch 150 — What "switching" actually does

Diagnosis only. No code, copy or UI changed.

## Bottom line

**(A) Record-only. For both Rightsize and Govern.**

Activating a switch writes two database rows. Nothing in the system reroutes a single request. The connector forwards traffic byte-for-byte to whatever provider and model the customer's own application asked for, before and after activation alike.

The only difference between Rightsize and Govern is *who presses the button* — a manager, or the scheduled evaluator. The mechanical effect is identical: rows in `switches` and `switch_events`.

## The trace, both sides

**Activation side (manual, Rightsize)**
`activateOpportunity` / `activateSwitch` in `src/lib/switches.functions.ts` → `apply_switch()` → inserts one `switches` row (`status = 'active'`), flips the recommendation to `activated`, inserts a `switch_events` row. No outbound call, no config write, no provider API touched.

**Activation side (autonomous, Govern)**
`src/lib/engine/evaluate.server.ts:320` → `system_apply_switch()` → the same two inserts, with `autonomous = true` and a `activated_autonomous` event. Same tables, same absence of any execution step.

**Traffic side (the connector)**
`packages/gateway-container/src/proxy.ts` copies the request through to the configured upstream. A search of the whole container for `switch`, `reroute`, `rewrite` or `to_model` returns nothing. There is no control-plane poll that could fetch a switch, and `modelFromRequest()` only *reads* the model to label the event — it never modifies the body. The one write-back channel the container has (`billing-poll.ts`, `queue.ts`) is outbound metadata only.

**Ingest side**
No file under `src/lib/ingest/` references the `switches` table. Rollups are recorded exactly as observed.

## Second finding: captured savings can never accrue for a real customer

`src/lib/dashboard.server.ts:491` states that a switch "accrues `saved_usd` only once the gateway's traffic has actually moved". No code performs that accrual. `saved_usd` is read in three places and written in none — not by any app path, and not by any database function (verified against `pg_proc`).

In production, every non-demo `switches` row therefore holds `saved_usd = 0` permanently, so the Captured tile and the savings ring stay at zero even for a customer who does move their traffic by hand. The only non-zero values in the table belong to the two seeded synthetic demo workspaces, which is why the demo looks correct and a real workspace never will.

## Third finding: the copy implies execution, and nothing tells the customer otherwise

Claims currently shipped:

- `src/routes/index.tsx:35` — "proves where the same quality costs less, and **switches it** — manually, or automatically on Govern"
- `GovernLevel.tsx` — "running unattended", "already run unattended", "applied unattended" (repeated across tiles, headings and hints)
- `OverviewLevel.tsx:244` — the "Running unattended" KPI
- `RightsizeLevel.tsx:472` — "Nothing **rerouted** yet. Activating a certified switch starts the meter here."
- `LevelState.tsx:303` — "Autonomous switching applies certified switches for you"

Against that, no screen, tooltip, confirmation dialog or document tells the customer that activation records a decision and that they must change the model in their own application. `CONNECT.md` and Settings cover the base-URL change and nothing further. A customer can activate a switch, see "running unattended", and reasonably believe traffic has moved when it has not.

## Options for Robin (decide, nothing is being built yet)

1. **Make the copy true.** Reframe activation as a tracked decision: "recorded", "committed", "tracked" instead of "switches it", "rerouted", "running unattended". Add a post-activation step telling the customer exactly which model string to change. Cheapest, honest, ships fast.
2. **Make the product true.** Give the container a control-plane read of active switches and rewrite the model field on matching requests. Real work, and it crosses a line the homepage currently boasts about not crossing (`index.tsx:674` — "that silently reroutes traffic ... we would refuse").
3. **Either way, fix `saved_usd`.** Captured savings must be derived from the rollups — the observed cost of the new pair against the old pair's price at the same volume — rather than a column nothing writes.

Option 1 plus 3 is the coherent pair, and 3 is required under either choice.
