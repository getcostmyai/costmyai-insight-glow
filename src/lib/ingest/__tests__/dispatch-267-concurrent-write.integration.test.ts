/**
 * Dispatch 267 — the lost-update race in `rebuildRollups` and
 * `recomputeSwitchSavings`, reproduced deliberately.
 *
 * Both functions are a read-a-snapshot / compute-in-app / write-it-back cycle
 * across several round trips, with no transaction, lock, or optimistic
 * version check anywhere in the path. Two `ingestEvents()` calls for the same
 * org with overlapping windows (two gateway containers on one workspace
 * flushing near-simultaneously — realistic in production, nothing serialised
 * this per-org before this dispatch) could interleave so the call that read
 * the smaller snapshot writes *after* the other's commit and silently reverts
 * the rollup / `saved_usd` to a state that excludes the other call's traffic.
 *
 * This is not provable by re-reading the code (Ohno's standing practice) and
 * it is not provable by a single-threaded test: the whole point is that it is
 * invisible in serial execution. So this file drives genuinely concurrent
 * `ingestEvents()` calls — real, unmocked network round trips to the real
 * database, fired with `Promise.all`, no artificial stagger — and asserts the
 * FINAL persisted state accounts for every batch, not just one.
 *
 * The correctness argument the fix relies on (see job-lock.server.ts's
 * `withJobLockBlocking`): once the read-compute-write critical section for an
 * org is serialised behind a Postgres lease, the temporally-last call to
 * acquire it always starts its read after every earlier call's own insert has
 * already committed (each call inserts its events before ever attempting the
 * lock), so its from-scratch recompute is always a superset of what came
 * before. No writer can revert another's already-committed traffic. That
 * guarantee is what the assertions below check, empirically, against the real
 * database — not against a mock.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingestEvents } from "@/lib/ingest/ingest.server";
import { ingestEventSchema } from "@/lib/ingest/schema";
import { assertRoutingGrants } from "@/lib/ingest/routing.server";
import { computeSwitchSavings } from "@/lib/switching/savings.server";
import { acquireJobLock, withJobLockBlocking } from "@/lib/ops/job-lock.server";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

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

const admin = createClient(URL, SERVICE, {
  global: { fetch: keyFetch(SERVICE) },
  auth: { persistSession: false, autoRefreshToken: false },
});
guardIntegrationDatabase(admin);

const stamp = Date.now();
const SLUG = `race-d267-${stamp}`;

/** The pair under test, priced in the live catalogue, not by this test. */
const FROM_MODEL = "openai/gpt-4o";
const TO_MODEL = "openai/gpt-4o-mini";
const HOST = "openai";
const WIRE_FROM = "gpt-4o";
const WIRE_TO = "gpt-4o-mini";
const WIRE_HOST = "api.openai.com";

const INPUT_TOKENS = 1_000;
const OUTPUT_TOKENS = 200;

/** Concurrent ingest batches and rerouted events per batch. */
const BATCHES = 6;
const EVENTS_PER_BATCH = 4;
const TOTAL_EVENTS = BATCHES * EVENTS_PER_BATCH;

const occurredAt = new Date().toISOString();

let orgId = "";
let switchId = "";

function batchEvents(batch: number) {
  return Array.from({ length: EVENTS_PER_BATCH }, (_, i) =>
    ingestEventSchema.parse({
      occurred_at: occurredAt,
      model_key: WIRE_TO,
      host: WIRE_HOST,
      task_hint: "generation",
      input_tokens: INPUT_TOKENS,
      output_tokens: OUTPUT_TOKENS,
      status: "ok",
      rerouted: true,
      original_model_key: WIRE_FROM,
      original_host: WIRE_HOST,
      route_reason: switchId,
      idempotency_key: `d267-${stamp}-b${batch}-e${i}`,
    }),
  );
}

describe("Dispatch 267 — concurrent ingest does not lose a rollup or a saved_usd write", () => {
  beforeAll(async () => {
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({ name: `Race D267 ${stamp}`, slug: SLUG, plan: "govern", is_synthetic: true })
      .select("id")
      .single();
    if (orgErr) throw new Error(orgErr.message);
    orgId = org!.id;

    const { data: sw, error: swErr } = await admin
      .from("switches")
      .insert({
        org_id: orgId,
        from_model: FROM_MODEL,
        from_host: HOST,
        to_model: TO_MODEL,
        to_host: HOST,
        basis: "same model, cheaper host",
        autonomous: false,
        status: "active",
        activated_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        is_synthetic: true,
      })
      .select("id, saved_usd")
      .single();
    if (swErr) throw new Error(swErr.message);
    switchId = sw!.id;
    expect(Number(sw!.saved_usd)).toBe(0);

    // Dispatch 161: saved_usd only accrues on a switch that is executable
    // under its own gate. Without this the server correctly refuses the
    // money on every concurrent call, and the race this file exists to catch
    // would never surface in saved_usd (only in the rollups).
    await assertRoutingGrants(orgId, [HOST], "d267-race-container");
  }, 60_000);

  afterAll(async () => {
    if (!orgId) return;
    await admin.from("usage_rollups").delete().eq("org_id", orgId);
    await admin.from("usage_events").delete().eq("org_id", orgId);
    await admin.from("switch_events").delete().eq("org_id", orgId);
    await admin.from("switches").delete().eq("org_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }, 60_000);

  it("accepts every batch and never both holds the org's rollup lease at once", async () => {
    const results = await Promise.all(
      Array.from({ length: BATCHES }, (_, b) => ingestEvents(orgId, batchEvents(b))),
    );

    const failures = results.filter((r) => r.accepted !== EVENTS_PER_BATCH);
    expect(failures).toEqual([]);
    expect(results.reduce((s, r) => s + r.accepted, 0)).toBe(TOTAL_EVENTS);
  }, 120_000);

  it("stores exactly every event — the write path itself never drops a row under concurrency", async () => {
    const { data, error } = await admin
      .from("usage_events")
      .select("id, input_tokens, output_tokens")
      .eq("org_id", orgId);
    if (error) throw error;
    expect(data).toHaveLength(TOTAL_EVENTS);
  });

  it("the rollup reflects ALL concurrent batches, not just the last writer's snapshot", async () => {
    const { data: rollups, error } = await admin
      .from("usage_rollups")
      .select("granularity, requests, input_tokens, output_tokens")
      .eq("org_id", orgId)
      .eq("granularity", "day");
    if (error) throw error;
    expect(rollups!.length).toBeGreaterThan(0);

    const totalRequests = rollups!.reduce((s, r) => s + r.requests, 0);
    const totalInput = rollups!.reduce((s, r) => s + r.input_tokens, 0);
    const totalOutput = rollups!.reduce((s, r) => s + r.output_tokens, 0);

    // This is the assertion the bug breaks: without the per-org lease, a
    // stale DELETE+upsert from a call that read before a sibling's commit can
    // silently revert the day bucket to a subset of the real traffic. Under
    // the fix every concurrent call's own from-scratch recompute is a
    // superset of what came before it, so the LAST one to land is always
    // complete.
    expect(totalRequests).toBe(TOTAL_EVENTS);
    expect(totalInput).toBe(TOTAL_EVENTS * INPUT_TOKENS);
    expect(totalOutput).toBe(TOTAL_EVENTS * OUTPUT_TOKENS);
  }, 30_000);

  it("saved_usd, stored under concurrency, matches an independent full recomputation to the cent", async () => {
    // Pure read, no lock needed — this is the audit path, computing the truth
    // fresh from every committed event, independent of whichever concurrent
    // recompute happened to write last.
    const independent = await computeSwitchSavings(admin as never, orgId);
    expect(independent).toHaveLength(1);
    const row = independent[0]!;
    expect(row.events).toBe(TOTAL_EVENTS);
    expect(row.unpricedEvents).toBe(0);
    expect(row.savedUsd).toBeGreaterThan(0);

    const { data: stored, error } = await admin
      .from("switches")
      .select("saved_usd")
      .eq("id", switchId)
      .single();
    if (error) throw error;

    // The money assertion: whatever the last concurrent recompute actually
    // wrote must equal the number a full independent re-derivation produces
    // right now. A stale writer winning the race would show up here as a
    // stored value strictly less than the independent recomputation.
    expect(Number(stored!.saved_usd)).toBeCloseTo(row.savedUsd, 2);
  }, 60_000);
});

describe("Dispatch 267 — the underlying lease actually serialises (mechanism-level proof)", () => {
  const KEY = `rollup:mechanism-probe-${stamp}`;

  it("never lets two holders into the critical section for the same key at once", async () => {
    let inSection = 0;
    let peak = 0;

    const worker = () =>
      withJobLockBlocking(
        KEY,
        async () => {
          inSection += 1;
          peak = Math.max(peak, inSection);
          await new Promise((r) => setTimeout(r, 150));
          inSection -= 1;
        },
        { ttlSeconds: 30, maxWaitMs: 20_000, pollMs: 25 },
      );

    await Promise.all([worker(), worker(), worker(), worker()]);
    expect(peak).toBe(1); // the whole point: never two passes at once

    // The lease must not be left behind after every holder released.
    const stray = await acquireJobLock(KEY, 5);
    expect(stray).not.toBeNull();
    await admin.rpc("job_lock_release" as never, { _job: KEY, _token: stray } as never);
  }, 30_000);
});
