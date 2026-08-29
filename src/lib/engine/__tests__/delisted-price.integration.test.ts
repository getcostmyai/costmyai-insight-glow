/**
 * Dispatch 110 — live proof that a delisted price row cannot reach a
 * recommendation.
 *
 * Nothing here is mocked. A real `host_prices` row is inserted against a real
 * priced model at a price so low the engine could not ignore it, and the real
 * `runEvaluation` is executed against the real database.
 *
 * The test runs the same scenario twice on purpose. A test that only asserts
 * "the delisted row did not appear" passes just as happily when the engine is
 * broken, when the model has no traffic, or when the insert silently failed —
 * absence proves nothing on its own. So the second pass flips the identical row
 * to `is_active = true` and requires the recommendation to appear. Only the
 * pair is evidence: the row is reachable, the engine does see it, and
 * `is_active` is the single thing standing between it and a customer.
 *
 * Isolation (this session): the proof used to anchor on whichever real
 * workspace happened to carry traffic and then sweep EVERY workspace — 23 orgs,
 * ~47 recommendations rewritten — which landed inside the disposable orgs other
 * suites were mid-assertion on. It now creates its own disposable workspace,
 * seeds its own 30-day window, and scopes the sweep to that one org. The
 * `host_prices` row is still globally visible for the seconds it exists; that
 * window is closed by running this file in its own serial phase (see
 * `vitest.config.ts`), not by pretending the table has a tenant boundary.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runEvaluation } from "@/lib/engine/evaluate.server";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const DEMO_ORG = "00000000-0000-0000-0000-000000000001";
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;

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
const PASSWORD = "Test-Delisted-Proof-2026!";
/** A host name no feed will ever produce, so every row found is one this test wrote. */
const PROOF_HOST = `delisted-proof-${stamp}`;

/** The model the engine sees traffic and a real active price for, in OUR workspace. */
let modelKey = "";
let modelHost = "";
let ownerId = "";
let orgId = "";
let client: SupabaseClient;

async function insertProofPrice(isActive: boolean) {
  const { data, error } = await admin
    .from("host_prices")
    .upsert(
      {
        model_key: modelKey,
        host: PROOF_HOST,
        host_label: "Delisted Proof Host",
        region: "global",
        // Two orders of magnitude below anything real: if the engine can see
        // this row at all, it is the cheapest destination in the market and it
        // must win.
        input_usd_per_mtok: 0.001,
        output_usd_per_mtok: 0.001,
        verified_at: new Date().toISOString(),
        price_source: "test",
        source_priority: 1,
        is_fixture: false,
        is_active: isActive,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "model_key,host,region,price_source" },
    )
    .select("id, is_active")
    .maybeSingle();

  if (error) throw new Error(`proof price not written: ${error.message}`);
  if (!data) throw new Error("proof price upsert affected no rows");
  expect(data.is_active).toBe(isActive);
}

/** Every recommendation, across every workspace, that quotes the proof host. */
async function recommendationsQuotingProofHost() {
  const { data, error } = await admin
    .from("recommendations")
    .select("id, org_id, to_model, to_host, monthly_saving_usd, status")
    .eq("to_host", PROOF_HOST);
  if (error) throw new Error(`recommendation read failed: ${error.message}`);
  return data ?? [];
}

beforeAll(async () => {
  // ---- a real, disposable workspace, created the way a customer's is ----
  const email = `delisted-proof-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;

  client = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;

  const org = await client.rpc("create_organization", { _name: `Delisted Proof ${stamp}` });
  if (org.error) throw org.error;
  orgId = org.data as string;
  expect(orgId).not.toBe(DEMO_ORG);

  // ---- anchor on a real, actively priced model, and give OUR org the traffic ----
  // Host arbitrage only fires when the workload's own host carries an active
  // price, so the seeded (model, host) pair is taken straight from a live row.
  const { data: priced, error: priceError } = await admin
    .from("host_prices")
    .select("model_key, host, input_usd_per_mtok, output_usd_per_mtok")
    .eq("is_active", true)
    .eq("region", "global")
    .gte("input_usd_per_mtok", 1)
    .order("input_usd_per_mtok", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priceError) throw new Error(`price read failed: ${priceError.message}`);
  if (!priced) throw new Error("no actively priced model to anchor the proof on");
  modelKey = String(priced.model_key);
  modelHost = String(priced.host);

  // A 30-day daily window, large enough that the $0.001 destination is worth
  // hundreds of dollars a month and cannot fall under the materiality floor.
  const to = new Date();
  to.setUTCMinutes(0, 0, 0);
  const inputTokens = 40_000_000;
  const outputTokens = 8_000_000;
  const dailyCost =
    (inputTokens / 1_000_000) * Number(priced.input_usd_per_mtok) +
    (outputTokens / 1_000_000) * Number(priced.output_usd_per_mtok);

  const rows = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const bucket = new Date(to.getTime() - (i + 1) * DAY_MS);
    bucket.setUTCHours(0, 0, 0, 0);
    return {
      org_id: orgId,
      bucket_start: bucket.toISOString(),
      granularity: "day",
      model_key: modelKey,
      host: modelHost,
      task_hint: "generation",
      requests: 800,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: Math.round(dailyCost * 100) / 100,
      output_p50: 1200,
      output_p95: 3000,
      peak_total_tokens: 12_000,
      is_synthetic: true,
    };
  });
  // eslint-disable-next-line costmyai/require-is-synthetic-on-guarded-insert -- is_synthetic is set on every row in the map above; the linter cannot see through .slice()/array variables into the chunk.
  const { error: seedError } = await admin.from("usage_rollups").insert(rows);
  if (seedError) throw new Error(`seed failed: ${seedError.message}`);
}, 120_000);

afterAll(async () => {
  await admin.from("recommendations").delete().eq("to_host", PROOF_HOST);
  await admin.from("host_prices").delete().eq("host", PROOF_HOST);
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (ownerId) await admin.auth.admin.deleteUser(ownerId);
}, 120_000);

describe("delisted host prices and the recommendation engine", () => {
  it("never quotes a delisted row, and does quote the identical active row", async () => {
    // Pass 1 — delisted. The cheapest price in the market is invisible.
    await insertProofPrice(false);
    const delistedRun = await runEvaluation("dispatch-110-delisted-proof", { orgIds: [orgId] });
    // The sweep touches this workspace and nothing else: no other suite's
    // disposable org can be rewritten underneath it.
    expect(delistedRun.orgs).toBe(1);
    expect(delistedRun.errors).toEqual([]);

    const whileDelisted = await recommendationsQuotingProofHost();
    expect(whileDelisted).toEqual([]);

    // Pass 2 — the same row, listed. If this does not appear, pass 1 proved
    // nothing and the test must fail rather than report a false clean.
    await insertProofPrice(true);
    const listedRun = await runEvaluation("dispatch-110-listed-control", { orgIds: [orgId] });
    expect(listedRun.orgs).toBe(1);
    expect(listedRun.errors).toEqual([]);

    const whileListed = await recommendationsQuotingProofHost();
    expect(whileListed.length).toBeGreaterThan(0);
    expect(whileListed[0]!.to_host).toBe(PROOF_HOST);
    expect(whileListed.every((r) => r.org_id === orgId)).toBe(true);
  }, 300_000);
});
