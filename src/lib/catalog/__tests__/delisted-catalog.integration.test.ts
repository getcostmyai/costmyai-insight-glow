/**
 * Dispatch 127 — live proof that a delisted price row cannot reach the public
 * /models catalog, mirroring the Dispatch 110 proof for the engine.
 *
 * Nothing is mocked. A real `host_prices` row is written against a real active
 * model at a price low enough that, if the read could see it at all, it would
 * become that model's cheapest listing and its cheapest input price.
 *
 * The test runs the same row twice on purpose. Asserting only "the delisted row
 * did not appear" would pass equally well if the insert silently failed, if the
 * model were missing from the catalog, or if the read were broken outright.
 * The second pass flips the identical row to `is_active = true` and REQUIRES it
 * to appear. Only the pair proves the filter is load-bearing rather than merely
 * present.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCatalog } from "../catalog.server";
import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
guardIntegrationDatabase(admin);

/** A host name no feed will ever produce, so every row found is one this test wrote. */
const PROOF_HOST = `delisted-catalog-proof-${Date.now()}`;
const PROOF_LABEL = "Delisted Catalog Proof Host";

let modelKey = "";

async function writeProofPrice(isActive: boolean) {
  const { data, error } = await admin
    .from("host_prices")
    .upsert(
      {
        model_key: modelKey,
        host: PROOF_HOST,
        host_label: PROOF_LABEL,
        region: "global",
        // Two orders of magnitude below anything real: if the catalog read can
        // see this row at all, it is the model's cheapest listing.
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

async function proofRowInCatalog() {
  const { rows } = await readCatalog();
  const model = rows.find((r) => r.model_key === modelKey);
  if (!model) throw new Error(`anchor model ${modelKey} missing from the catalog`);
  return {
    listing: model.hosts.find((h) => h.host_label === PROOF_LABEL) ?? null,
    cheapestInput: model.cheapestInput,
  };
}

beforeAll(async () => {
  // Anchor on an active, already-priced model, otherwise the model would not be
  // in the catalog at all and the test would be vacuous.
  const { data, error } = await admin
    .from("host_prices")
    .select("model_key, model_catalog!inner(is_active)")
    .eq("is_active", true)
    .eq("model_catalog.is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`anchor read failed: ${error.message}`);
  if (!data) throw new Error("no actively priced, active model to anchor the proof on");
  modelKey = String(data.model_key);
}, 120_000);

afterAll(async () => {
  await admin.from("host_prices").delete().eq("host", PROOF_HOST);
}, 120_000);

describe("delisted host prices and the public catalog", () => {
  it("never lists a delisted row, and does list the identical active row", async () => {
    // Pass 1 — delisted. The cheapest price on the model is invisible.
    await writeProofPrice(false);
    const delisted = await proofRowInCatalog();
    expect(delisted.listing).toBeNull();
    expect(delisted.cheapestInput === null || delisted.cheapestInput > 0.001).toBe(true);

    // Pass 2 — the same row, listed. If this does not appear, pass 1 proved
    // nothing and the test must fail rather than report a false clean.
    await writeProofPrice(true);
    const listed = await proofRowInCatalog();
    expect(listed.listing).not.toBeNull();
    expect(listed.listing!.input).toBeCloseTo(0.001, 6);
    expect(listed.cheapestInput).toBeCloseTo(0.001, 6);
  }, 300_000);
});
