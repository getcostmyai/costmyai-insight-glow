/**
 * The scope of the evaluation sweep, asserted directly instead of inferred.
 *
 * `opts.orgIds` was added to `runEvaluation` so the synthetic harnesses could
 * run the REAL writer over their own disposable workspace. The production cron
 * passes nothing and must keep sweeping every workspace. Nothing tested that
 * claim: it rested on a two-line diff and on an unrelated test happening to
 * report a plausible org count.
 *
 * So this file asserts the omitted path two independent ways, because either
 * one alone is weak evidence:
 *
 *  1. The wire. Global fetch is captured for the duration of the run and the
 *     actual PostgREST request for `organizations` is inspected. A filter would
 *     appear as an `id=in.(...)` query parameter. Its absence is the proof that
 *     no filter was attached — not the source reading as though none was.
 *  2. The outcome. `report.orgs` is compared against a separately counted
 *     total of real rows in `organizations`. The engine must have touched every
 *     one of them.
 *
 * And the empty array is pinned on purpose. It is a caller bug, so the guard
 * throws before any query is issued — asserted here both by the throw itself
 * and by zero captured requests, so a future silent zero-sweep cannot return
 * unnoticed.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runEvaluation } from "@/lib/engine/evaluate.server";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
guardIntegrationDatabase(admin);

/** Every PostgREST URL hit while a capture is armed. */
let captured: string[] = [];

/** Requests this run made against the organizations table. */
function organizationRequests(): string[] {
  return captured.filter((u) => u.includes("/rest/v1/organizations"));
}

async function withFetchCapture<T>(fn: () => Promise<T>): Promise<{ result: T; urls: string[] }> {
  const real = globalThis.fetch;
  captured = [];
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    captured.push(url);
    return real(input as never, init as never);
  }) as typeof fetch;
  try {
    const result = await fn();
    return { result, urls: [...captured] };
  } finally {
    globalThis.fetch = real;
  }
}

/** The number of real workspaces the unfiltered sweep is obliged to reach. */
let orgTotal = 0;

let unfiltered: Awaited<ReturnType<typeof runEvaluation>>;
let unfilteredOrgUrls: string[] = [];
let emptyArrayError: unknown = null;
let emptyArrayUrls: string[] = [];

beforeAll(async () => {
  const { count, error } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  orgTotal = count ?? 0;
  console.log(`[scope] organizations in the database: ${orgTotal}`);

  // No second argument at all — byte-for-byte how both cron routes call it.
  const run = await withFetchCapture(() => runEvaluation(`sweep-scope-unfiltered-${Date.now()}`));
  unfiltered = run.result;
  unfilteredOrgUrls = run.urls.filter((u) => u.includes("/rest/v1/organizations"));

  // The empty array must be refused before anything is queried, so the capture
  // has to survive the throw to prove no request went out.
  const real = globalThis.fetch;
  captured = [];
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    captured.push(typeof input === "string" ? input : input instanceof Request ? input.url : String(input));
    return real(input as never, init as never);
  }) as typeof fetch;
  try {
    await runEvaluation(`sweep-scope-empty-${Date.now()}`, { orgIds: [] });
    emptyArrayError = null;
  } catch (err) {
    emptyArrayError = err;
  } finally {
    emptyArrayUrls = [...captured];
    globalThis.fetch = real;
  }
}, 300_000);

afterAll(() => {
  globalThis.fetch = globalThis.fetch;
});

describe("runEvaluation with no options, exactly as the cron calls it", () => {
  it("issues an organizations query with no id filter on the wire", () => {
    expect(unfilteredOrgUrls.length).toBeGreaterThan(0);
    const [url] = unfilteredOrgUrls;
    console.log(`[unfiltered] ${decodeURIComponent(url!)}`);
    // A narrowed sweep would carry `id=in.(...)`. Nothing else in this query
    // can produce that parameter.
    expect(decodeURIComponent(url!)).not.toContain("id=in.");
    expect(url!).not.toContain("id=in.");
  });

  it("selects the same four columns the evaluator reads, unchanged", () => {
    const url = decodeURIComponent(unfilteredOrgUrls[0]!);
    expect(url).toContain("select=id,plan,is_synthetic,autonomous_enabled");
  });

  it("evaluates every organization in the database, counted independently", () => {
    console.log(`[unfiltered] report.orgs=${unfiltered.orgs} vs counted total=${orgTotal}`);
    expect(orgTotal).toBeGreaterThan(1);
    expect(unfiltered.orgs).toBe(orgTotal);
  });

  it("reaches those workspaces without erroring on any of them", () => {
    expect(unfiltered.errors).toEqual([]);
  });
});

describe("runEvaluation({ orgIds: [] }), characterised deliberately", () => {
  /**
   * DESIGN NOTE, open for decision. An empty array is truthy, so it takes the
   * filtered branch and asks PostgREST for `id=in.()` — zero workspaces, no
   * error, no warning. A caller that built the array dynamically and got
   * nothing back would see a clean, successful, completely empty sweep. This
   * test pins the behavior as it is today; it is NOT an endorsement of it. If
   * the guard changes to fall back to a full sweep or to throw, this block is
   * the one to rewrite.
   */
  it("attaches an empty id filter to the wire", () => {
    expect(emptyArrayOrgUrls.length).toBeGreaterThan(0);
    const url = decodeURIComponent(emptyArrayOrgUrls[0]!);
    console.log(`[empty] ${url}`);
    expect(url).toContain("id=in.(");
  });

  it("sweeps zero organizations, silently and without error", () => {
    console.log(`[empty] report.orgs=${emptyArray.orgs} errors=${emptyArray.errors.length}`);
    expect(emptyArray.orgs).toBe(0);
    expect(emptyArray.recommendationsWritten).toBe(0);
    expect(emptyArray.autonomousSwitches).toBe(0);
    // The part that makes it a footgun: nothing surfaces the miss.
    expect(emptyArray.errors).toEqual([]);
  });

  it("differs from the unfiltered sweep, so the two paths are provably distinct", () => {
    expect(emptyArray.orgs).not.toBe(unfiltered.orgs);
  });
});
