/**
 * Dispatch 236 — the counterfactual is priced with the PRE-switch cache mix.
 *
 * The bug: `switch_savings_basis` reports the mix the DESTINATION observed, and
 * that same mix was priced on both sides of the comparison. A workload that ran
 * warm (most of its input served from cache) before the switch and cold after
 * it therefore had its "what it would have cost" priced cold too — the loss the
 * move caused disappears into the arithmetic.
 *
 * What is proved here, on real rows written through the real database:
 *
 *   1. `switch_savings_prior_basis` returns the pre-switch window's tokens and
 *      cache counters for the original pair, and matches an ALIASED spelling of
 *      that pair (`api.openai.com` vs `openai`) once the TypeScript resolver has
 *      folded it — the resolution SQL cannot do and must not duplicate.
 *   2. `computeSwitchSavings` prices `counterfactualUsd` with that pre-switch
 *      mix, not the post-switch one, and the resulting `savedUsd` differs from
 *      the old behaviour by exactly the cache differential.
 *   3. A switch with no pre-switch history keeps the old behaviour and says so
 *      with `usedFallbackMix: true` rather than swapping logic in silence.
 *
 * Every row this file writes belongs to a throwaway workspace flagged
 * `is_synthetic`, so nothing it creates can reach a customer-facing figure.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { costOf } from "@/lib/engine/cost";
import type { PriceRow } from "@/lib/engine/types";
import { computeSwitchSavings } from "@/lib/switching/savings.server";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

guardIntegrationDatabase(admin);

const stamp = Date.now();
const PASSWORD = "Test-Prior-Cache-Mix-2026!";

/** One batch of rerouted traffic, identical on both switches. */
const INPUT = 1_000_000;
const OUTPUT = 200_000;
/** Warm before the switch: 80% of the prefix was served from cache. */
const PRIOR_READ = 800_000;
/** Cold after it: the destination reports no cache at all. */
const POST_READ = 0;

let ownerId: string;
let orgId: string;
let switchId: string;
let freshSwitchId: string;
let fromPrice: PriceRow;
let toPrice: PriceRow;

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const ACTIVATED_AT = iso(2 * 60 * 60 * 1000);

async function priceOf(model: string, host: string): Promise<PriceRow> {
  const { data, error } = await admin
    .from("host_prices")
    .select(
      "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, supports_prompt_caching",
    )
    .eq("model_key", model)
    .eq("host", host)
    .eq("is_fixture", false)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`no live price row for ${model}|${host}`);
  return {
    ...data,
    input_usd_per_mtok: Number(data.input_usd_per_mtok),
    output_usd_per_mtok: Number(data.output_usd_per_mtok),
    cache_read_usd_per_mtok:
      data.cache_read_usd_per_mtok == null ? null : Number(data.cache_read_usd_per_mtok),
    cache_write_usd_per_mtok:
      data.cache_write_usd_per_mtok == null ? null : Number(data.cache_write_usd_per_mtok),
  } as PriceRow;
}

beforeAll(async () => {
  const email = `prior-cache-mix-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;

  const client: SupabaseClient = createClient(URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const org = await client.rpc("create_organization", { _name: `Prior Cache Mix ${stamp}` });
  if (org.error) throw org.error;
  orgId = org.data as string;

  // Fixture traffic, marked as such by the database itself: `enforce_synthetic_flag`
  // copies the workspace's flag onto every usage row it writes.
  const flagged = await admin.from("organizations").update({ is_synthetic: true }).eq("id", orgId);
  if (flagged.error) throw flagged.error;

  fromPrice = await priceOf("openai/gpt-5-mini", "openai");
  toPrice = await priceOf("openai/gpt-5-nano", "azure");

  const mkSwitch = async () => {
    const { data, error } = await admin
      .from("switches")
      .insert({
        org_id: orgId,
        from_model: fromPrice.model_key,
        from_host: fromPrice.host,
        to_model: toPrice.model_key,
        to_host: toPrice.host,
        basis: "host_arbitrage",
        autonomous: false,
        activated_at: ACTIVATED_AT,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };
  switchId = await mkSwitch();
  freshSwitchId = await mkSwitch();

  const rows = [
    // Pre-switch history on the ORIGINAL pair, spelled the way a real gateway
    // reports it (`api.openai.com`), and warm.
    {
      org_id: orgId,
      occurred_at: iso(6 * 60 * 60 * 1000),
      model_key: fromPrice.model_key,
      host: "api.openai.com",
      task_hint: "generation",
      input_tokens: INPUT,
      output_tokens: OUTPUT,
      cache_read_tokens: PRIOR_READ,
      cache_write_tokens: 0,
      status: "ok",
      rerouted: false,
      idempotency_key: `d236-prior-${stamp}`,
    },
    // Post-switch rerouted traffic, cold.
    {
      org_id: orgId,
      occurred_at: iso(30 * 60 * 1000),
      model_key: toPrice.model_key,
      host: toPrice.host,
      task_hint: "generation",
      input_tokens: INPUT,
      output_tokens: OUTPUT,
      cache_read_tokens: POST_READ,
      cache_write_tokens: 0,
      status: "ok",
      rerouted: true,
      route_reason: switchId,
      original_model_key: fromPrice.model_key,
      original_host: fromPrice.host,
      idempotency_key: `d236-post-${stamp}`,
    },
    // The same rerouted shape on the switch with NO pre-switch history.
    {
      org_id: orgId,
      occurred_at: iso(29 * 60 * 1000),
      model_key: toPrice.model_key,
      host: toPrice.host,
      task_hint: "classification",
      input_tokens: INPUT,
      output_tokens: OUTPUT,
      cache_read_tokens: POST_READ,
      cache_write_tokens: 0,
      status: "ok",
      rerouted: true,
      route_reason: freshSwitchId,
      original_model_key: "openai/gpt-5-nano",
      original_host: "openai",
      idempotency_key: `d236-fresh-${stamp}`,
    },
  ];
  const written = await admin.from("usage_events").insert(rows).select("is_synthetic");
  if (written.error) throw written.error;
  expect(written.data!.every((r) => r.is_synthetic)).toBe(true);
}, 60_000);

afterAll(async () => {
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("switch_events").delete().eq("org_id", orgId);
  await admin.from("switches").delete().eq("org_id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 60_000);

describe("pre-switch cache mix prices the counterfactual", () => {
  it("returns the pre-switch window for the aliased original pair", async () => {
    const { data, error } = await admin.rpc("switch_savings_prior_basis", {
      _org_id: orgId,
      _switch_ids: [switchId, freshSwitchId],
    });
    if (error) throw error;
    const mine = (data as Array<Record<string, unknown>>).filter((r) => r["switch_id"] === switchId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      model_key: fromPrice.model_key,
      host: "api.openai.com",
      input_tokens: INPUT,
      cache_read_tokens: PRIOR_READ,
    });
    // Nothing before the fresh switch on its own original pair.
    expect((data as Array<Record<string, unknown>>).some((r) => r["switch_id"] === freshSwitchId)).toBe(
      false,
    );
  });

  it("prices the counterfactual warm and the actual cold", async () => {
    const rows = await computeSwitchSavings(admin as never, orgId, [switchId]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    const warm = costOf(fromPrice, INPUT, OUTPUT, { readTokens: PRIOR_READ, writeTokens: 0 });
    const cold = costOf(fromPrice, INPUT, OUTPUT, { readTokens: POST_READ, writeTokens: 0 });
    const actual = costOf(toPrice, INPUT, OUTPUT, { readTokens: POST_READ, writeTokens: 0 });

    expect(row.usedFallbackMix).toBe(false);
    expect(row.counterfactualUsd).toBeCloseTo(warm, 2);
    expect(row.actualUsd).toBeCloseTo(actual, 2);
    expect(row.savedUsd).toBeCloseTo(warm - actual, 2);

    // The old behaviour, for the record: the pre-switch warmth was invisible and
    // the counterfactual was priced cold, overstating the saving.
    expect(cold).toBeGreaterThan(warm);
    expect(row.savedUsd).toBeLessThan(cold - actual);

    // eslint-disable-next-line no-console
    console.log(
      `D236 saved_usd before=${(cold - actual).toFixed(4)} after=${row.savedUsd.toFixed(4)} ` +
        `(counterfactual cold=${cold.toFixed(4)} warm=${warm.toFixed(4)}, actual=${actual.toFixed(4)})`,
    );
  });

  it("falls back to the observed mix and marks the row when there is no history", async () => {
    const rows = await computeSwitchSavings(admin as never, orgId, [freshSwitchId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.usedFallbackMix).toBe(true);
  });
});
