/**
 * Dispatch 106 — live proof that a degraded event is actually repaired.
 *
 * Nothing below the HTTP boundary is mocked: a real workspace, a real ingest
 * token, the real public ingest route on the running server, the real
 * `usage_events` row, the real sweep, and the real `usage_rollups` the
 * dashboard reads. The event is pushed exactly as a pre-Dispatch-104 connector
 * would have pushed Tencent's envelope — metered as zero, with the content-free
 * skeleton that makes the repair possible.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { envelopeSkeleton } from "../../../../packages/gateway-container/src/skeleton";
import { INGEST_PATHS } from "@/lib/ingest/contract";
import { mintApiKey } from "@/lib/ingest/keys.server";
import { reprocessDegradedEvents } from "@/lib/ingest/reprocess.server";

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
const PASSWORD = "Test-Reprocess-2026!";
const KEY = `reprocess-${stamp}`;

let ownerId: string;
let orgId: string;
let token: string;
let ownerClient: SupabaseClient;
/** A real priced pair, so the rollup's cost is a real cost and not a fixture. */
let modelKey = "";
let host = "";

beforeAll(async () => {
  const email = `reprocess-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;
  ownerClient = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await ownerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await ownerClient.rpc("create_organization", {
    _name: `Reprocess ${stamp}`,
  });
  if (error) throw error;
  orgId = data as string;
  token = (await mintApiKey(orgId, "Reprocess test", ownerId)).token;

  const { data: price } = await admin
    .from("host_prices")
    .select("model_key, host")
    .eq("is_fixture", false)
    .gt("output_usd_per_mtok", 0)
    .limit(1)
    .maybeSingle();
  modelKey = price?.model_key ?? "";
  host = price?.host ?? "";
}, 60_000);

afterAll(async () => {
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 60_000);

describe("retroactive reprocessing, end to end", () => {
  it("repairs an event metered as zero and rebuilds the rollup it belongs to", async () => {
    expect(modelKey, "no real priced pair to test against").not.toBe("");
    const occurredAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    // Exactly what a pre-Dispatch-104 connector produced for Tencent's TC3
    // envelope: no parser, no recognised counter name, metered as nothing.
    const skeleton = envelopeSkeleton({
      Response: {
        RequestId: "0d4c-not-retained",
        Usage: { PromptTokens: 812, CompletionTokens: 214, TotalTokens: 1026 },
        Choices: [{ Message: { Content: "the customer's completion" } }],
      },
    });
    expect(JSON.stringify(skeleton)).not.toContain("customer");

    const res = await fetch(`${APP}${INGEST_PATHS.events}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        v: 1,
        events: [
          {
            occurred_at: occurredAt,
            model_key: modelKey,
            host,
            task_hint: "unknown",
            input_tokens: 0,
            output_tokens: 0,
            latency_ms: 700,
            status: "ok",
            parse_status: "unparsed",
            envelope_skeleton: skeleton,
            idempotency_key: KEY,
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: 1 });

    // Before: the hour exists, and reads as traffic that cost nothing.
    const before = await admin
      .from("usage_rollups")
      .select("input_tokens, output_tokens, cost_usd")
      .eq("org_id", orgId)
      .eq("granularity", "hour")
      .maybeSingle();
    expect(Number(before.data!.input_tokens)).toBe(0);
    expect(Number(before.data!.cost_usd)).toBe(0);

    const result = await reprocessDegradedEvents({ orgId });
    expect(result.scanned).toBe(1);
    expect(result.upgraded).toBe(1);
    expect(result.tokensCorrected).toBe(1);
    expect(result.inputDelta).toBe(812);
    expect(result.outputDelta).toBe(214);
    expect(result.bucketsRebuilt).toBeGreaterThanOrEqual(2); // the hour and the day

    // The event itself, repaired and stamped with the parser that repaired it.
    const { data: event } = await admin
      .from("usage_events")
      .select("parse_status, input_tokens, output_tokens, parser_revision, reparsed_at")
      .eq("org_id", orgId)
      .eq("idempotency_key", KEY)
      .maybeSingle();
    expect(event!.parse_status).toBe("parsed");
    expect(event!.input_tokens).toBe(812);
    expect(event!.output_tokens).toBe(214);
    expect(event!.parser_revision).toBeGreaterThanOrEqual(2);
    expect(event!.reparsed_at).toBeTruthy();

    // And the number the customer actually looks at moved with it.
    const after = await admin
      .from("usage_rollups")
      .select("input_tokens, output_tokens, cost_usd")
      .eq("org_id", orgId)
      .eq("granularity", "hour")
      .maybeSingle();
    expect(Number(after.data!.input_tokens)).toBe(812);
    expect(Number(after.data!.output_tokens)).toBe(214);
    expect(Number(after.data!.cost_usd)).toBeGreaterThan(0);

    // A second sweep is a no-op: there is nothing left that a newer parser
    // improves, so reprocessing can never double-count.
    const again = await reprocessDegradedEvents({ orgId });
    expect(again.scanned).toBe(0);
    expect(again.upgraded).toBe(0);
  }, 120_000);
});
