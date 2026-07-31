/**
 * Build the synthetic ecosystem in memory.
 *
 * Single source of truth for both writers:
 *   - scripts/seed-synthetic.ts  → emits SQL (for a privileged psql session)
 *   - scripts/apply-synthetic.ts → pushes rows through the Data API
 *
 * Deterministic: same seed and same window produce identical output. Raw
 * metadata events cover the most recent RAW_EVENT_HOURS so the ingestion path
 * is demonstrable end to end; rollups for the full window are aggregated from
 * the very same generated events, so the two can never disagree.
 */
import { execFileSync } from "node:child_process";

import type { ModelRow, PriceRow } from "../src/lib/engine/types";
import {
  DAY_MS,
  generateEvents,
  HOUR_MS,
  rollupEvents,
  type RollupRow,
  type SyntheticEvent,
} from "../src/lib/synthetic/generator";
import { aggregateRollups, buildBilling, buildProfiles } from "../src/lib/synthetic/profiles";
import { sizeWorkloads } from "../src/lib/synthetic/sizing";
import { SYNTHETIC_WORKLOADS } from "../src/lib/synthetic/workloads";

export const ORG_ID = "00000000-0000-0000-0000-000000000001";
export const WINDOW_DAYS = 30;
/** Always covers the whole current UTC day, so today's day bucket can be rebuilt from raw events. */
export const RAW_EVENT_HOURS = 30;
export const SEED = process.env.SYNTHETIC_SEED ?? "costmyai-demo-v1";

function q(sql: string): any[] {
  const out = execFileSync("psql", ["-At", "-c", `select coalesce(json_agg(t),'[]') from (${sql}) t`], {
    encoding: "utf8",
  });
  return JSON.parse(out.trim());
}

export function buildSynthetic() {
  const prices: PriceRow[] = q(
    "select model_key, host, host_label, input_usd_per_mtok::float8, output_usd_per_mtok::float8 from host_prices",
  );
  const models: ModelRow[] = q("select model_key, display_name, vendor, tier from model_catalog");

  const priceIndex = new Map(prices.map((p) => [`${p.model_key}|${p.host}`, p]));
  const priceFor = (modelKey: string, host: string) => priceIndex.get(`${modelKey}|${host}`);

  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const to = new Date(now.getTime() + HOUR_MS);
  const from = new Date(to.getTime() - WINDOW_DAYS * DAY_MS);
  const rawFrom = new Date(to.getTime() - RAW_EVENT_HOURS * HOUR_MS);

  // Request rates are solved per model against the live synced price, not chosen
  // by hand and not scaled flat: an expensive model needs a couple of dozen calls
  // a day to carry its share of the bill, a cheap one needs tens of thousands.
  const sized = sizeWorkloads(SYNTHETIC_WORKLOADS, priceFor);

  const allEvents: SyntheticEvent[] = [];
  for (const workload of sized) {
    // Pushed one by one: at production volume the event array is large enough
    // that spreading it into push() blows the call stack.
    for (const e of generateEvents({ workload, from, to, windowStart: from, windowEnd: to, seed: SEED })) {
      allEvents.push(e);
    }
  }
  allEvents.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const rawEvents = allEvents.filter((e) => e.occurredAt >= rawFrom);
  const dailyRollups: RollupRow[] = rollupEvents(allEvents, "day", priceFor);
  const hourlyRollups: RollupRow[] = rollupEvents(rawEvents, "hour", priceFor);

  const usage = aggregateRollups(dailyRollups, WINDOW_DAYS);
  const profiles = buildProfiles(usage, models, priceFor);
  const billing = buildBilling(dailyRollups, from, to, {
    // Real invoices drift from metadata estimates for real reasons.
    openai: -0.031, // prompt caching on the answer composer
    anthropic: 0.008, // rounding only
    alibaba: 0.024, // minimum billing units on short code calls
    deepinfra: -0.006,
    venice: 0.011,
    groq: 0.041, // untracked retries counted by the provider
  });

  const monthlySpendUsd =
    Math.round(dailyRollups.reduce((s, r) => s + r.costUsd, 0) * 100) / 100;

  return {
    from,
    to,
    sized,
    allEvents,
    rawEvents,
    dailyRollups,
    hourlyRollups,
    profiles,
    billing,
    stats: {
      seed: SEED,
      window: [from.toISOString(), to.toISOString()],
      events_generated: allEvents.length,
      raw_events_written: rawEvents.length,
      daily_rollups: dailyRollups.length,
      hourly_rollups: hourlyRollups.length,
      profiles: profiles.length,
      billing_pairs: billing.length,
      monthly_spend_usd: monthlySpendUsd,
      requests_per_day_by_model: Object.fromEntries(
        sized.map((w) => [`${w.modelKey}@${w.host}`, w.requestsPerDay]),
      ),
    },
  };
}
