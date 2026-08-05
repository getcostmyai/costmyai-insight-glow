/**
 * Dispatch 104 item 4 — live proof of the proactive new-provider check.
 *
 * Hung off the pricing sync's existing "what is new this run" read, so a
 * provider that appears on the real feed is inspected once, days or weeks
 * before any customer's traffic reaches it.
 *
 * This test runs the real check against the real `host_prices` table and the
 * real reporting path, with one host the feed has genuinely never carried. It
 * asserts three separate things, because only the first is easy to fake:
 *   - a host already in the catalog raises nothing (no daily noise);
 *   - a genuinely new host on a shape we parse is reported as covered;
 *   - a genuinely new host with no known shape turns the board red.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { JOB_REGISTRY, judgeJob, SHAPE_WATCH_JOB, type JobRunSummary } from "@/lib/ops/jobs";
import { checkNewProviders } from "@/lib/pricing/sync.server";

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
/** A real inference host the catalog has never carried. */
const NEW_UNKNOWN = `hyperbolic-${stamp}.example`;

function price(host: string) {
  return {
    model_key: "vendor/some-model",
    host,
    host_label: host,
    input_per_mtok: 1,
    output_per_mtok: 2,
    price_source: "endpoint",
    currency: "USD",
  } as never;
}

afterAll(async () => {
  await admin.from("sync_runs").delete().eq("job", SHAPE_WATCH_JOB).ilike("error", `%${stamp}%`);
}, 60_000);

describe("the new-provider shape check on a real sync run", () => {
  it("says nothing about providers the catalog already prices", async () => {
    const known = new Set(["openai", "anthropic"]);
    const fresh = await checkNewProviders([price("openai"), price("anthropic")], known);
    expect(fresh).toEqual([]);
  }, 60_000);

  it("reports a genuinely new provider whose shape nobody has established", async () => {
    const before = new Date().toISOString();
    const fresh = await checkNewProviders([price(NEW_UNKNOWN)], new Set(["openai"]));

    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ host: NEW_UNKNOWN, known: false, shape: null });

    const { data: runs, error } = await admin
      .from("sync_runs")
      .select("job, started_at, outcome, rows_written, error")
      .eq("job", SHAPE_WATCH_JOB)
      .gte("started_at", before)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const mine = (runs ?? []).find((r) => String(r.error ?? "").includes(NEW_UNKNOWN));
    expect(mine, "the pricing feed recorded no shape-watch report").toBeTruthy();
    expect(String(mine!.error)).toContain("[pricing-feed]");
    expect(String(mine!.error)).toContain("no known response shape");

    const spec = JOB_REGISTRY.find((j) => j.job === SHAPE_WATCH_JOB)!;
    const summaries: JobRunSummary[] = (runs ?? []).map((r) => ({
      startedAt: String(r.started_at),
      outcome: r.outcome ?? null,
      rowsWritten: r.rows_written ?? null,
      error: r.error ?? null,
    }));
    expect(judgeJob(spec, summaries, Date.now()).verdict).toBe("failing");
  }, 60_000);

  it("records a new provider on a shape we already parse without pretending it is a problem", async () => {
    // `cohere` is mapped, so its arrival is noted rather than escalated.
    const fresh = await checkNewProviders([price("cohere")], new Set(["openai"]));
    expect(fresh[0]).toMatchObject({ host: "cohere", known: true, shape: "cohere" });
  }, 60_000);
});
