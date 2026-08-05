/**
 * Dispatch 104 item 3 — live proof that an unreadable response shape reaches
 * the team, on the board they actually look at.
 *
 * Nothing below the HTTP boundary is mocked: a real workspace, a real ingest
 * token, the real public ingest route on the running server, and the real
 * `sync_runs` table the /admin/jobs board reads. The verdict is computed by
 * `judgeJob` — the same function the board and the audit script both call, so
 * this test cannot pass while the screen stays green.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { INGEST_PATHS } from "@/lib/ingest/contract";
import { mintApiKey } from "@/lib/ingest/keys.server";
import { JOB_REGISTRY, judgeJob, SHAPE_WATCH_JOB, type JobRunSummary } from "@/lib/ops/jobs";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const APP = process.env["CONNECTOR_TEST_APP_URL"] ?? "http://localhost:8080";

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
const PASSWORD = "Test-Shape-Watch-2026!";
const MARKER = `shape-watch-${stamp}`;

let ownerId: string;
let orgId: string;
let token: string;
let ownerClient: SupabaseClient;

beforeAll(async () => {
  const email = `shape-watch-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;
  ownerClient = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await ownerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await ownerClient.rpc("create_organization", { _name: `Shape Watch ${stamp}` });
  if (error) throw error;
  orgId = data as string;
  token = (await mintApiKey(orgId, "Shape watch test", ownerId)).token;
}, 60_000);

afterAll(async () => {
  await admin.from("sync_runs").delete().eq("job", SHAPE_WATCH_JOB).ilike("error", `%${MARKER}%`);
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 60_000);

describe("the unrecognised-shape watch, end to end", () => {
  it("turns an unparseable response into an open alert on the jobs board", async () => {
    // What the connector reports when it forwarded a real call and then could
    // not find token counters anywhere in the provider's envelope.
    const res = await fetch(`${APP}${INGEST_PATHS.events}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        v: 1,
        events: [
          {
            occurred_at: new Date().toISOString(),
            model_key: MARKER,
            host: "api.unknown-provider.example",
            task_hint: "unknown",
            input_tokens: 0,
            output_tokens: 0,
            latency_ms: 640,
            status: "ok",
            parse_status: "unparsed",
            idempotency_key: MARKER,
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: 1 });

    // The row the board reads, written by the ingest path itself.
    const { data: runs, error } = await admin
      .from("sync_runs")
      .select("job, started_at, outcome, rows_written, error")
      .eq("job", SHAPE_WATCH_JOB)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const mine = (runs ?? []).find((r) => String(r.error ?? "").includes(MARKER));
    expect(mine, "the ingest path recorded no shape-watch report").toBeTruthy();
    expect(String(mine!.error)).toContain("[ingest]");
    expect(String(mine!.error)).toContain("api.unknown-provider.example");

    // And the board turns that row red, by the same function the screen calls.
    const spec = JOB_REGISTRY.find((j) => j.job === SHAPE_WATCH_JOB)!;
    const summaries: JobRunSummary[] = (runs ?? []).map((r) => ({
      startedAt: String(r.started_at),
      outcome: r.outcome ?? null,
      rowsWritten: r.rows_written ?? null,
      error: r.error ?? null,
    }));
    const health = judgeJob(spec, summaries, Date.now());
    expect(health.verdict).toBe("failing");
    expect(health.reason).toContain("unreadable response envelope");
  }, 90_000);

  it("reads healthy when the watch has nothing to say", () => {
    const spec = JOB_REGISTRY.find((j) => j.job === SHAPE_WATCH_JOB)!;
    // Silence is the normal state for a watch, and a stale watch is not a fault.
    const health = judgeJob(spec, [], Date.now());
    expect(health.verdict).toBe("healthy");
    expect(health.reason).toContain("five");
  });
});
