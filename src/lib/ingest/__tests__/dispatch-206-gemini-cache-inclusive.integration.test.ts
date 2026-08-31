/**
 * Dispatch 206 — the live prompt-cache proof for the INCLUSIVE shape.
 *
 * Dispatch 205 proved the exclusive shape (Anthropic: the cache counters sit
 * BESIDE input_tokens, and the connector folds them in). That proof cannot
 * cover the opposite risk, which is the one that would show up as a new bug in
 * the other direction: Google reports cachedContentTokenCount INSIDE
 * promptTokenCount. If the connector added it in the way it adds Anthropic's,
 * or if costOf priced it on top of the full prompt instead of out of it, a
 * cached Gemini call would be billed for the same tokens twice.
 *
 * So this test does the one thing the Anthropic proof cannot: it hand-computes
 * the expected dollar figure from the provider's OWN reported numbers and
 * requires costOf to match it to the cent-fraction, then requires the stored
 * input total to equal Google's promptTokenCount EXACTLY — not the sum of the
 * prompt and its cached subset.
 *
 * Skips loudly without GEMINI_API_KEY rather than degrading into a fixture.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { costOf } from "@/lib/engine/cost";
import type { PriceRow } from "@/lib/engine/types";
import { mintApiKey } from "@/lib/ingest/keys.server";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { createGateway } from "../../../../packages/gateway-container/src/index";
import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL_ = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const APP = process.env["CONNECTOR_TEST_APP_URL"] ?? "http://localhost:8080";

const PROVIDER_URL = "https://generativelanguage.googleapis.com";
const GEMINI_KEY = process.env["GEMINI_API_KEY"];
const MODEL = "gemini-3.6-flash";
/** Chosen by the OS: a fixed port collides when the whole suite runs at once. */
let PORT = 0;

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

const admin = createClient(URL_, SERVICE, {
  global: { fetch: keyFetch(SERVICE) },
  auth: { persistSession: false, autoRefreshToken: false },
});
guardIntegrationDatabase(admin);

const stamp = Date.now();
const PASSWORD = "Test-Gemini-Cache-2026!";

let ownerId: string;
let orgId: string;
let ownerClient: SupabaseClient;
let gateway: ReturnType<typeof createGateway>;

/**
 * Google's implicit cache has a per-model minimum (1,024 tokens on Flash) and
 * only matches on an identical PREFIX, so the shared block goes first and the
 * varying question last. The run stamp is inside the shared prefix: it is
 * identical across this run's two calls, and different from any earlier run's,
 * so the first call cannot be served from a cache a previous run left warm.
 */
const PREFIX = [
  `Run ${stamp}. You are an invoice reconciliation assistant.`,
  ...Array.from(
    { length: 900 },
    (_, i) =>
      `Rule ${i}: when reconciling an invoice line, treat the provider's own reported token counts as authoritative and never re-derive them locally.`,
  ),
].join("\n");

interface GeminiUsage {
  promptTokenCount: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
}

async function call(question: string): Promise<{ status: number; usage: GeminiUsage }> {
  const res = await fetch(`http://127.0.0.1:${PORT}/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${PREFIX}\n\nQuestion: ${question}` }] }],
      generationConfig: { maxOutputTokens: 32 },
    }),
  });
  const body = (await res.json()) as { usageMetadata?: GeminiUsage };
  return { status: res.status, usage: body.usageMetadata ?? { promptTokenCount: 0 } };
}

async function flushMetered(expected: number): Promise<void> {
  for (let i = 0; i < 200 && gateway.queue.size < expected; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await gateway.flush();
}

const live = GEMINI_KEY ? describe : describe.skip;
if (!GEMINI_KEY) {
  console.warn(
    "[dispatch-206] SKIPPING the live Gemini inclusive-cache proof: GEMINI_API_KEY is not set.",
  );
}

beforeAll(async () => {
  if (!GEMINI_KEY) return;
  const email = `gemini-cache-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;
  ownerClient = createClient(URL_, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await ownerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await ownerClient.rpc("create_organization", { _name: `Gemini Cache ${stamp}` });
  if (error) throw error;
  orgId = data as string;
  const token = (await mintApiKey(orgId, "Dispatch 206 cache proof", ownerId)).token;

  gateway = createGateway(
    loadConfig({
      COSTMYAI_INGEST_TOKEN: token,
      COSTMYAI_UPSTREAM_URL: PROVIDER_URL,
      COSTMYAI_BASE_URL: APP,
      COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "costmyai-d206-")),
      COSTMYAI_PORT: "0",
      COSTMYAI_FLUSH_INTERVAL_MS: "600000",
    }),
  );
  await new Promise<void>((resolve) => gateway.server.listen(0, resolve));
  PORT = (gateway.server.address() as { port: number }).port;
}, 120_000);

afterAll(async () => {
  if (!GEMINI_KEY) return;
  await gateway.shutdown("SIGTERM");
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 120_000);

live("a real cached Gemini prefix (inclusive shape)", () => {
  it("is stored as a SUBSET of the prompt total and priced without double-counting", async () => {
    // 1. First call warms the implicit cache; the second repeats the prefix.
    const first = await call("Reply with the single word: one");
    if (first.status === 429 || first.status === 503) {
      console.warn(
        `[dispatch-206] Gemini returned ${first.status} (provider unavailable); cannot prove today.`,
      );
      return;
    }
    expect(first.status).toBe(200);
    expect(first.usage.promptTokenCount).toBeGreaterThan(1024);

    await new Promise((r) => setTimeout(r, 2000));
    const second = await call("Reply with the single word: two");
    if (second.status === 429 || second.status === 503) {
      console.warn(
        `[dispatch-206] Gemini returned ${second.status} on repeat call (provider unavailable); cannot prove today.`,
      );
      return;
    }
    expect(second.status).toBe(200);

    const cachedTokens = second.usage.cachedContentTokenCount ?? 0;
    const promptTotal = second.usage.promptTokenCount;
    /**
     * Google's implicit cache is best-effort and not contractual. If it did not
     * engage, this run has nothing to prove and says so instead of asserting
     * against a zero — the double-counting risk only exists when a real cached
     * count comes back.
     */
    if (cachedTokens === 0) {
      console.warn(
        "[dispatch-206] Gemini reported no cached tokens on the repeat call; implicit cache did not engage.",
      );
      return;
    }

    // Google's own numbers say it: the cached count sits INSIDE the prompt total.
    expect(cachedTokens).toBeLessThanOrEqual(promptTotal);

    // 2. The stored row must carry the prompt total UNCHANGED, with the cached
    //    count as a subset of it. This is the assertion that fails loudly if
    //    the connector ever folds an inclusive counter in the way it folds
    //    Anthropic's exclusive one.
    await flushMetered(2);
    const { data: rows } = await admin
      .from("usage_events")
      .select("model_key, host, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, parse_status")
      .eq("org_id", orgId)
      .order("id", { ascending: true });
    expect(rows).toHaveLength(2);
    expect(rows!.every((r) => r.parse_status === "parsed")).toBe(true);

    const cachedRow = rows!.find((r) => (r.cache_read_tokens ?? 0) > 0);
    expect(cachedRow, "the cached call reached usage_events with its cache counter").toBeTruthy();
    expect(cachedRow!.cache_read_tokens).toBe(cachedTokens);
    expect(cachedRow!.input_tokens).toBe(promptTotal); // NOT promptTotal + cachedTokens
    // Google bills cache storage by the hour, not per written token, so there
    // is no write counter to read and none is invented.
    expect(cachedRow!.cache_write_tokens ?? 0).toBe(0);

    // 3. Priced off the live catalog, and checked against a hand-computed
    //    figure derived from Google's own reported numbers.
    const { data: price } = await admin
      .from("host_prices")
      .select(
        "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, supports_prompt_caching",
      )
      .eq("model_key", "google/gemini-3.6-flash")
      .eq("host", "google")
      .eq("is_fixture", false)
      .maybeSingle();
    expect(price, `the pair ${cachedRow!.model_key}@${cachedRow!.host} is priced`).toBeTruthy();
    expect(price!.supports_prompt_caching).toBe(true);

    const p = price as PriceRow;
    const actual = costOf(p, cachedRow!.input_tokens, cachedRow!.output_tokens, {
      readTokens: cachedRow!.cache_read_tokens ?? 0,
      writeTokens: 0,
    });

    /**
     * Hand-computed, from the provider's own envelope. The uncached term is
     * (prompt − cached), NOT the whole prompt: that subtraction is the entire
     * difference between correct pricing and charging the cached prefix twice.
     */
    const expected =
      ((promptTotal - cachedTokens) / 1_000_000) * p.input_usd_per_mtok +
      (cachedTokens / 1_000_000) * p.cache_read_usd_per_mtok! +
      (cachedRow!.output_tokens / 1_000_000) * p.output_usd_per_mtok;
    expect(actual).toBeCloseTo(expected, 12);

    /**
     * And the double-count this test exists to rule out, stated as a number:
     * pricing the full prompt at the input rate AND the cached subset at the
     * cache rate. The real figure must be strictly below it.
     */
    const doubleCounted =
      (promptTotal / 1_000_000) * p.input_usd_per_mtok +
      (cachedTokens / 1_000_000) * p.cache_read_usd_per_mtok! +
      (cachedRow!.output_tokens / 1_000_000) * p.output_usd_per_mtok;
    expect(actual).toBeLessThan(doubleCounted);

    const flat = costOf(p, cachedRow!.input_tokens, cachedRow!.output_tokens);
    expect(actual).toBeLessThan(flat);

    // 4. The customer's own dashboard read carries the same subset and discount.
    const { data: rollups } = await ownerClient
      .from("usage_rollups")
      .select("granularity, requests, input_tokens, cache_read_tokens, cost_usd")
      .eq("org_id", orgId)
      .eq("granularity", "day");
    expect(rollups!.length).toBeGreaterThan(0);
    const readTotal = rollups!.reduce((s, r) => s + Number(r.cache_read_tokens ?? 0), 0);
    expect(readTotal).toBe(cachedTokens);
    const rolledInput = rollups!.reduce((s, r) => s + Number(r.input_tokens), 0);
    expect(rolledInput).toBe(rows!.reduce((s, r) => s + r.input_tokens, 0));
    const cost = rollups!.reduce((s, r) => s + Number(r.cost_usd), 0);
    const flatBoth = rows!.reduce((s, r) => s + costOf(p, r.input_tokens, r.output_tokens), 0);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(flatBoth);

    console.log(
      `[dispatch-206] live Gemini inclusive-cache proof: prompt=${promptTotal} cached=${cachedTokens} ` +
        `stored_input=${cachedRow!.input_tokens} cache-aware=$${actual.toFixed(8)} ` +
        `hand-computed=$${expected.toFixed(8)} double-counted=$${doubleCounted.toFixed(8)} ` +
        `flat=$${flat.toFixed(8)} rollup=$${cost.toFixed(8)} flat-rollup=$${flatBoth.toFixed(8)}`,
    );
  }, 180_000);
});
