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

const stamp = Date.now();
/** A host name no feed will ever produce, so every row found is one this test wrote. */
const PROOF_HOST = `delisted-proof-${stamp}`;

/** The model the engine already has real traffic and a real active price for. */
let modelKey = "";

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
  // Anchor on a model that already carries traffic, otherwise the engine has no
  // reason to evaluate it and the whole test is vacuous.
  const { data: traffic, error } = await admin
    .from("usage_rollups")
    .select("model_key, cost_usd")
    .order("cost_usd", { ascending: false })
    .limit(50);
  if (error) throw new Error(`traffic read failed: ${error.message}`);

  for (const row of traffic ?? []) {
    const { data: priced } = await admin
      .from("host_prices")
      .select("model_key")
      .eq("model_key", row.model_key)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (priced) {
      modelKey = String(row.model_key);
      break;
    }
  }
  if (!modelKey) throw new Error("no trafficked, actively priced model to anchor the proof on");
}, 120_000);

afterAll(async () => {
  await admin.from("recommendations").delete().eq("to_host", PROOF_HOST);
  await admin.from("host_prices").delete().eq("host", PROOF_HOST);
}, 120_000);

describe("delisted host prices and the recommendation engine", () => {
  it("never quotes a delisted row, and does quote the identical active row", async () => {
    // Pass 1 — delisted. The cheapest price in the market is invisible.
    await insertProofPrice(false);
    await runEvaluation("dispatch-110-delisted-proof");

    const whileDelisted = await recommendationsQuotingProofHost();
    expect(whileDelisted).toEqual([]);

    // Pass 2 — the same row, listed. If this does not appear, pass 1 proved
    // nothing and the test must fail rather than report a false clean.
    await insertProofPrice(true);
    await runEvaluation("dispatch-110-listed-control");

    const whileListed = await recommendationsQuotingProofHost();
    expect(whileListed.length).toBeGreaterThan(0);
    expect(whileListed[0]!.to_host).toBe(PROOF_HOST);
  }, 300_000);
});
