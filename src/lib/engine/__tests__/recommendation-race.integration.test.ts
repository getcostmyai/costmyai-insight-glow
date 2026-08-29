/**
 * The recommendations natural-key race, reproduced deliberately.
 *
 * Two evaluations can legitimately be in flight against the same workspace at
 * the same instant in production (the pricing cron and the benchmark cron each
 * chain their own `runEvaluation`, and neither holds a lock over the other).
 * When both produce the same workload verdict, both used to run
 * SELECT-then-INSERT against
 * `recommendations_org_id_kind_from_model_from_host_task_hint_key`, and the
 * loser threw a duplicate-key error instead of resolving.
 *
 * This exercises the real RPC — `system_upsert_recommendation` — with N genuinely
 * concurrent calls carrying an identical natural key, and asserts that they all
 * resolve to one row.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
const SLUG = `race-recs-${stamp}`;
let orgId = "";

const FROM_MODEL = "openai/gpt-5.1";
const FROM_HOST = "azure";
const TASK = "generation";

async function callUpsert(saving: number) {
  return admin.rpc("system_upsert_recommendation", {
    _org_id: orgId,
    _kind: "host_arbitrage",
    _min_plan: "compare",
    _from_model: FROM_MODEL,
    _from_host: FROM_HOST,
    _to_model: FROM_MODEL,
    _to_host: "openai",
    _task_hint: TASK,
    _monthly_saving: saving,
    _saving_pct: 12,
    _basis: `race probe ${saving}`,
    _note: null,
    _quality_delta: null,
  });
}

describe("recommendations natural-key race", () => {
  beforeAll(async () => {
    const { data, error } = await admin
      .from("organizations")
      .insert({ name: `Race probe ${stamp}`, slug: SLUG, plan: "govern", is_synthetic: true })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    orgId = data!.id;
  });

  afterAll(async () => {
    if (!orgId) return;
    await admin.from("recommendations").delete().eq("org_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  });

  it("resolves cleanly when eight identical writes land at once", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((n) => callUpsert(n * 10)));

    const failures = results
      .map((r) => r.error?.message)
      .filter((m): m is string => Boolean(m));
    expect(failures).toEqual([]);

    const ids = new Set(results.map((r) => r.data as unknown as string));
    expect(ids.size).toBe(1);

    const { data: rows, error } = await admin
      .from("recommendations")
      .select("id, monthly_saving_usd, status, basis")
      .eq("org_id", orgId);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    // Last writer wins: the surviving row carries one of the concurrent
    // evaluations' own recomputed values, never a blend of them.
    const row = rows![0]!;
    expect(row.basis).toBe(`race probe ${Number(row.monthly_saving_usd)}`);
    expect(row.status).toBe("open");
  });

  it("keeps an activated recommendation activated under a concurrent rewrite", async () => {
    await admin.from("recommendations").update({ status: "activated" }).eq("org_id", orgId);

    const results = await Promise.all([9, 10, 11, 12].map((n) => callUpsert(n * 10)));
    expect(results.map((r) => r.error?.message).filter(Boolean)).toEqual([]);

    const { data: rows } = await admin
      .from("recommendations")
      .select("status")
      .eq("org_id", orgId);
    expect(rows).toHaveLength(1);
    expect(rows![0]!.status).toBe("activated");
  });
});
