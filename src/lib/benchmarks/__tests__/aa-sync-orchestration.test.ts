import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 5 Tier 1 PARTIAL #1 and #2 (Deming).
 *
 * aa-sync.test.ts only ever exercised the pure helpers syncArtificialAnalysis()
 * calls (marginFor, walkLadder, transformAaPayload, latencyRowFor). Nothing
 * drove the orchestrating function itself: catalogue read -> transform ->
 * upsert(benchmarks) -> upsert(benchmark_margins) -> update(host_prices) ->
 * update(fixture retirement) -> insert(pricing_snapshots provenance). This file
 * drives the real exported syncArtificialAnalysis()/recordSyncFailure() with a
 * mocked AA response and a mocked Supabase client, and asserts the actual
 * sequence of writes and their contents — not that the code "looks right".
 */

type Op = [string, unknown[]];
interface Call {
  table: string;
  ops: Op[];
}
type Responder = (call: Call, callIndexForTable: number) => { data?: unknown; error?: unknown };

const state = vi.hoisted(() => ({ client: null as unknown as { from: (t: string) => unknown } }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => state.client,
}));

// The orchestrator imports these pure helpers straight through — real, unmocked.
import { AA_SUITE } from "../aa-catalog";
import { recordSyncFailure, syncArtificialAnalysis } from "../aa-sync.server";

/**
 * A minimal fake Supabase query builder. Every table's real chain shape
 * (`.select().eq()`, `.upsert(rows, opts)`, `.update(patch).eq().select()`,
 * `.insert(row)`) is honoured; the terminal `.then` is what the code actually
 * awaits, exactly like the real supabase-js client.
 */
function makeSupabaseMock(responses: Record<string, Responder>) {
  const calls: Call[] = [];
  const perTableCount: Record<string, number> = {};

  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    const builder = {
      select(...args: unknown[]) {
        call.ops.push(["select", args]);
        return builder;
      },
      eq(...args: unknown[]) {
        call.ops.push(["eq", args]);
        return builder;
      },
      not(...args: unknown[]) {
        call.ops.push(["not", args]);
        return builder;
      },
      update(...args: unknown[]) {
        call.ops.push(["update", args]);
        return builder;
      },
      upsert(...args: unknown[]) {
        call.ops.push(["upsert", args]);
        return builder;
      },
      insert(...args: unknown[]) {
        call.ops.push(["insert", args]);
        return builder;
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        calls.push(call);
        perTableCount[table] = (perTableCount[table] ?? 0) + 1;
        const primary = call.ops.find(([n]) =>
          ["select", "update", "upsert", "insert"].includes(n),
        )?.[0];
        const key = `${table}.${primary}`;
        const handler = responses[key];
        const result = handler ? handler(call, perTableCount[table]) : { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    client: { from },
    calls,
    callsFor: (table: string) => calls.filter((c) => c.table === table),
  };
}

const AA_MODEL = {
  slug: "alpha",
  name: "alpha",
  evaluations: { gpqa: 0.9 },
  median_time_to_first_token_seconds: 0.5,
  median_output_tokens_per_second: 100,
};

function okFetch(models: unknown[] = [AA_MODEL]) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: models }),
    text: async () => "",
  })) as unknown as typeof fetch;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.ARTIFICIAL_ANALYSIS_API_KEY = "test-aa-key";
  process.env.SUPABASE_URL = "http://localhost:9999";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("syncArtificialAnalysis() orchestration", () => {
  it("reads the active catalogue, transforms, and writes scores, margins, latency and provenance in one tagged run", async () => {
    vi.stubGlobal("fetch", okFetch());

    const mock = makeSupabaseMock({
      "model_catalog.select": () => ({ data: [{ model_key: "alpha" }], error: null }),
      "benchmarks.upsert": () => ({ error: null }),
      "benchmark_margins.upsert": () => ({ error: null }),
      "host_prices.update": () => ({ data: [{ id: "hp-1" }], error: null }),
      "benchmarks.update": () => ({ data: [], error: null }),
      "pricing_snapshots.insert": () => ({ error: null }),
    });
    state.client = mock.client;

    const report = await syncArtificialAnalysis();

    // 1. Catalogue read was scoped to active rows only.
    const catalogCalls = mock.callsFor("model_catalog");
    expect(catalogCalls).toHaveLength(1);
    expect(catalogCalls[0]!.ops).toContainEqual(["eq", ["is_active", true]]);

    // 2. Scores were actually upserted, tagged with the run's own id and marked
    // as a real (non-fixture) measurement.
    const scoreUpsert = mock
      .callsFor("benchmarks")
      .find((c) => c.ops.some(([n]) => n === "upsert"));
    expect(scoreUpsert).toBeDefined();
    const [scoreRows, scoreOpts] = scoreUpsert!.ops.find(([n]) => n === "upsert")![1] as [
      Array<Record<string, unknown>>,
      Record<string, unknown>,
    ];
    expect(scoreRows.length).toBeGreaterThan(0);
    for (const row of scoreRows) {
      expect(row.source_run_id).toBe(report.runId);
      expect(row.is_fixture).toBe(false);
      expect(row.suite).toBe(`${AA_SUITE}:gpqa`);
      expect(row.model_key).toBe("alpha");
    }
    expect(scoreOpts).toEqual({ onConflict: "model_key,suite,task_class" });

    // 3. The margin written in the SAME run carries the SAME run id, so the
    // engine can never compare a score against a margin from a different run.
    const marginCall = mock.callsFor("benchmark_margins")[0];
    expect(marginCall).toBeDefined();
    const [marginRows, marginOpts] = marginCall!.ops.find(([n]) => n === "upsert")![1] as [
      Array<Record<string, unknown>>,
      Record<string, unknown>,
    ];
    expect(marginRows).toHaveLength(1);
    expect(marginRows[0]!.source_run_id).toBe(report.runId);
    expect(marginRows[0]!.suite).toBe(`${AA_SUITE}:gpqa`);
    expect(marginOpts).toEqual({ onConflict: "suite,task_class" });

    // 4. Latency was written per host row serving the model, tagged with the run.
    const hostCall = mock.callsFor("host_prices")[0];
    expect(hostCall).toBeDefined();
    const [hostPatch] = hostCall!.ops.find(([n]) => n === "update")![1] as [
      Record<string, unknown>,
    ];
    expect(hostPatch.latency_source_run_id).toBe(report.runId);
    expect(hostPatch.latency_scope).toBe("model");
    expect(hostCall!.ops).toContainEqual(["eq", ["model_key", "alpha"]]);
    expect(report.hostRowsWithLatency).toBe(1);

    // 5. Fixture retirement ran against real (non-suite-scoped) fixture rows only.
    const retireCall = mock.callsFor("benchmarks").find((c) => c.ops.some(([n]) => n === "update"));
    expect(retireCall).toBeDefined();
    expect(retireCall!.ops).toContainEqual(["not", ["suite", "like", `${AA_SUITE}:%`]]);
    expect(retireCall!.ops).toContainEqual(["eq", ["is_fixture", false]]);

    // 6. Every run — successful here — is recorded so staleness can be shown.
    const provenanceCall = mock.callsFor("pricing_snapshots")[0];
    expect(provenanceCall).toBeDefined();
    const [provenanceRow] = provenanceCall!.ops.find(([n]) => n === "insert")![1] as [
      Record<string, unknown>,
    ];
    expect(provenanceRow.feed).toBe("artificial_analysis");
    expect(provenanceRow.status).toBe("ok");
    expect(provenanceRow.is_fixture).toBe(false);
    expect(provenanceRow.rows_upserted).toBe(
      report.scoresWritten + report.marginsWritten.length + report.hostRowsWithLatency,
    );

    // 7. The returned report reflects the same run.
    expect(report.runId).toMatch(/^aa-/);
    expect(report.fetchedModels).toBe(1);
    expect(report.matchedModels).toEqual(["alpha"]);
    expect(report.scoresWritten).toBe(scoreRows.length);
  });

  it("propagates a failed benchmarks write instead of continuing the run", async () => {
    vi.stubGlobal("fetch", okFetch());
    const mock = makeSupabaseMock({
      "model_catalog.select": () => ({ data: [{ model_key: "alpha" }], error: null }),
      "benchmarks.upsert": () => ({ error: { message: "benchmarks upsert boom" } }),
      "benchmark_margins.upsert": () => ({ error: null }),
      "host_prices.update": () => ({ data: [], error: null }),
      "pricing_snapshots.insert": () => ({ error: null }),
    });
    state.client = mock.client;

    await expect(syncArtificialAnalysis()).rejects.toMatchObject({
      message: "benchmarks upsert boom",
    });

    // Nothing downstream of the failed write happened — a partially-written
    // run (scores land, margin doesn't) is exactly the drift this guards.
    expect(mock.callsFor("benchmark_margins")).toHaveLength(0);
    expect(mock.callsFor("host_prices")).toHaveLength(0);
    expect(mock.callsFor("pricing_snapshots")).toHaveLength(0);
  });

  it("wraps and propagates a failed provenance write rather than reporting success silently", async () => {
    vi.stubGlobal("fetch", okFetch());
    const mock = makeSupabaseMock({
      "model_catalog.select": () => ({ data: [{ model_key: "alpha" }], error: null }),
      "benchmarks.upsert": () => ({ error: null }),
      "benchmark_margins.upsert": () => ({ error: null }),
      "host_prices.update": () => ({ data: [{ id: "hp-1" }], error: null }),
      "benchmarks.update": () => ({ data: [], error: null }),
      "pricing_snapshots.insert": () => ({ error: { message: "insert failed" } }),
    });
    state.client = mock.client;

    await expect(syncArtificialAnalysis()).rejects.toThrow(
      /recording the benchmark run failed: insert failed/,
    );
  });

  it("throws rather than fabricating a run when the catalogue read fails", async () => {
    vi.stubGlobal("fetch", okFetch());
    const mock = makeSupabaseMock({
      "model_catalog.select": () => ({ data: null, error: { message: "catalog read boom" } }),
    });
    state.client = mock.client;

    await expect(syncArtificialAnalysis()).rejects.toMatchObject({ message: "catalog read boom" });
    expect(mock.callsFor("benchmarks")).toHaveLength(0);
  });
});

describe("recordSyncFailure()", () => {
  it("writes an error snapshot with the message truncated to 500 chars", async () => {
    const mock = makeSupabaseMock({
      "pricing_snapshots.insert": () => ({ error: null }),
    });
    state.client = mock.client;

    const longMessage = "x".repeat(600);
    await recordSyncFailure(longMessage);

    const call = mock.callsFor("pricing_snapshots")[0];
    expect(call).toBeDefined();
    const [row] = call!.ops.find(([n]) => n === "insert")![1] as [Record<string, unknown>];
    expect(row.feed).toBe("artificial_analysis");
    expect(row.status).toBe("error");
    expect(row.rows_upserted).toBe(0);
    expect(row.is_fixture).toBe(false);
    expect(row.error_detail).toHaveLength(500);
    expect(row.error_detail).toBe("x".repeat(500));
  });

  it("swallows its own write failure rather than masking the original sync error it was called to record", async () => {
    const mock = makeSupabaseMock({
      "pricing_snapshots.insert": () => {
        throw new Error("logging DB is down");
      },
    });
    state.client = mock.client;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // The caller (the cron route) is already inside a catch block holding the
    // ORIGINAL sync error; recordSyncFailure must never throw a second error
    // that would replace it.
    await expect(recordSyncFailure("original sync failure")).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      "could not record benchmark sync failure",
      expect.any(Error),
    );
  });
});
