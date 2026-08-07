/**
 * Dispatch 112 — the isolation sweep must clear the alerts the suite raises,
 * and must never clear a real one.
 *
 * This runs against the real `sync_runs` table with the real client, because
 * the thing most likely to be wrong is the PostgREST JSON filter syntax
 * (`detail->>testRun`), and a stubbed admin object would happily "pass" a
 * filter that matches nothing in production. Three rows go in: one stamped by
 * the watch, one about a workspace that no longer exists, and one real alert
 * with a live workspace behind it. Only the first two may come back out.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { guardIntegrationDatabase } from "./support/isolation";
import { sweepTestResidue } from "./support/isolation";

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
/**
 * Written as of now, deliberately. Age is what makes a row fair game for any
 * other file's sweep running in parallel; a fresh row is inside every sibling's
 * grace window, and this file reaches its own rows by id instead.
 */
const NOW = new Date().toISOString();
const MISSING_ORG = "00000000-0000-4000-8000-0000000ff112";

let realOrgId: string;
let ids: string[] = [];

beforeAll(async () => {
  // A live workspace, so the "real alert" under test has a real owner.
  const org = await admin
    .from("organizations")
    .insert({ name: `Alert Isolation ${stamp}`, slug: `alert-isolation-${stamp}`, is_synthetic: true })
    .select("id")
    .single();
  if (org.error) throw org.error;
  realOrgId = org.data.id as string;

  const rows = [
    { detail: { testRun: true, note: stamp }, error: "[pricing-feed] stamped by the watch" },
    { detail: { orgId: MISSING_ORG, note: stamp }, error: "[ingest] workspace is gone" },
    { detail: { orgId: realOrgId, note: stamp }, error: "[ingest] a real customer alert" },
  ].map((r) => ({
    job: "shape-watch",
    started_at: NOW,
    finished_at: NOW,
    ok: false,
    outcome: "failed",
    rows_written: 1,
    ...r,
  }));

  const written = await admin.from("sync_runs").insert(rows).select("id");
  if (written.error) throw written.error;
  ids = (written.data ?? []).map((r: { id: string }) => r.id);
  expect(ids).toHaveLength(3);
}, 60_000);

afterAll(async () => {
  if (ids.length) await admin.from("sync_runs").delete().in("id", ids);
  if (realOrgId) await admin.from("organizations").delete().eq("id", realOrgId);
}, 60_000);

describe("the isolation sweep, on ops-board alerts", () => {
  it("clears test-raised alerts and leaves a real one standing", async () => {
    const before = await admin.from("sync_runs").select("id").in("id", ids);
    expect((before.data ?? []).length).toBe(3);

    // Scoped to the three rows this file wrote: the predicate under test is
    // exercised exactly as in production, but the count is not shared with
    // whatever else the suite is doing at the same moment.
    const swept = await sweepTestResidue(admin as never, 30 * 60_000, ids);
    expect(swept.syncRunAlerts).toBe(2);

    const after = await admin.from("sync_runs").select("id, error").in("id", ids);
    const left = after.data ?? [];
    expect(left).toHaveLength(1);
    expect((left[0] as { error: string }).error).toContain("a real customer alert");
  }, 120_000);
});
