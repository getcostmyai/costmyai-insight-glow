/**
 * Dispatch 231 — database integrity, proved against the real database.
 *
 * Three claims, each of which was previously held up by application code alone
 * and is now a structural guarantee:
 *
 * 1. A referral code cannot collide on case. `ACME` and `acme` are the same
 *    code, because every lookup in the product lowercases before it matches.
 * 2. A workspace cannot hold two active switches for the same workload.
 * 3. A rerouted event with no original model/host has no counterfactual, so the
 *    switch refuses the credit instead of quietly booking $0 as a real result.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recomputeSwitchSavings } from "@/lib/switching/savings.server";

import { guardIntegrationDatabase } from "./support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

const admin: SupabaseClient = createClient(URL, SERVICE, {
  global: { fetch: keyFetch(SERVICE) },
  auth: { persistSession: false, autoRefreshToken: false },
});

guardIntegrationDatabase(admin);

const stamp = Date.now();
let orgId: string;
const partnerIds: string[] = [];

beforeAll(async () => {
  const { data, error } = await admin
    .from("organizations")
    .insert({ name: `Integrity Co ${stamp}`, slug: `integrity-${stamp}`, plan: "govern" })
    .select("id")
    .single();
  if (error) throw error;
  orgId = data.id as string;
}, 60_000);

afterAll(async () => {
  await admin.from("switches").delete().eq("org_id", orgId);
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  if (partnerIds.length) await admin.from("partners").delete().in("id", partnerIds);
}, 60_000);

describe("referral code uniqueness", () => {
  it("refuses a case-variant of an existing code at the database level", async () => {
    const code = `INTEG${stamp}`;
    const first = await admin
      .from("partners")
      .insert({ name: `Integ Partner ${stamp}`, referral_code: code, status: "active" })
      .select("id")
      .single();
    expect(first.error).toBeNull();
    partnerIds.push(first.data!.id as string);

    const variant = await admin
      .from("partners")
      .insert({ name: `Integ Rival ${stamp}`, referral_code: code.toLowerCase(), status: "active" })
      .select("id")
      .single();

    expect(variant.error).not.toBeNull();
    expect(`${variant.error?.message} ${variant.error?.details ?? ""}`).toMatch(
      /partners_referral_code_lower_key|duplicate key/i,
    );
  }, 60_000);
});

describe("one active switch per workload", () => {
  it("refuses a second active switch on the same from-pair at the database level", async () => {
    const base = {
      org_id: orgId,
      from_model: "claude-sonnet-4",
      from_host: "api.anthropic.com",
      to_model: "claude-haiku-4",
      to_host: "api.anthropic.com",
      basis: "integrity test",
      badge: "SAME MODEL",
    };

    const first = await admin.from("switches").insert({ ...base, status: "active" }).select("id").single();
    expect(first.error).toBeNull();

    const duplicate = await admin.from("switches").insert({ ...base, status: "active" }).select("id").single();
    expect(duplicate.error).not.toBeNull();
    expect(`${duplicate.error?.message} ${duplicate.error?.details ?? ""}`).toMatch(
      /switches_one_active_per_workload|duplicate key/i,
    );

    // A rolled-back row on the same workload is still allowed — the index is partial.
    const rolledBack = await admin
      .from("switches")
      .insert({ ...base, status: "rolled_back" })
      .select("id")
      .single();
    expect(rolledBack.error).toBeNull();
  }, 60_000);
});

describe("savings refuses an event with no origin", () => {
  it("does not price a NULL original_model_key at $0", async () => {
    const created = await admin
      .from("switches")
      .insert({
        org_id: orgId,
        from_model: "gpt-4o",
        from_host: "api.openai.com",
        to_model: "gpt-4o-mini",
        to_host: "api.openai.com",
        basis: "integrity test — origin_unknown",
        badge: "SAME MODEL",
        status: "active",
        saved_usd: 0,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    const switchId = created.data!.id as string;

    // The shape the API schema rejects but a `supabaseAdmin` write can produce:
    // rerouted, successful, attributed — and with no pair to compare against.
    const event = await admin.from("usage_events").insert({
      org_id: orgId,
      occurred_at: new Date().toISOString(),
      model_key: "gpt-4o-mini",
      host: "api.openai.com",
      task_hint: "chat",
      input_tokens: 1_000_000,
      output_tokens: 200_000,
      status: "ok",
      rerouted: true,
      route_reason: switchId,
      original_model_key: null,
      original_host: null,
    });
    expect(event.error).toBeNull();

    const [result] = await recomputeSwitchSavings(admin as never, orgId, [switchId]);
    expect(result).toBeDefined();
    expect(result!.missingOriginalEvents).toBe(1);
    expect(result!.refused).toBe(true);
    expect(result!.refusedReason).toBe("origin_unknown");
    expect(result!.storedUsd).toBe(0);

    const { data: events } = await admin
      .from("switch_events")
      .select("event, detail")
      .eq("switch_id", switchId)
      .eq("event", "savings_refused");
    expect(events?.length).toBeGreaterThan(0);
    expect(events![0]!.detail).toMatch(/no original model\/host/i);
  }, 90_000);
});
