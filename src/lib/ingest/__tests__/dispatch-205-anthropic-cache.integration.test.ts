/**
 * Dispatch 205 — the live prompt-cache proof.
 *
 * Dispatch 204 built cache capture, cache pricing and cache-aware savings, and
 * proved all three against fixtures. What it never did was watch a real
 * provider serve a real cached prefix and follow that number all the way to a
 * dashboard read. Everything in this file is real:
 *
 *   - a real container instance, fronting api.anthropic.com,
 *   - a real repeated system prompt marked cache_control: ephemeral,
 *   - Anthropic's own cache_read_input_tokens / cache_creation_input_tokens,
 *   - a real workspace, real usage_events rows, real rollups,
 *   - and the same costOf() the dashboard uses, priced off the live catalog.
 *
 * The assertion that matters is the last one: the cached call must cost LESS
 * than the flat pricing this codebase used before Dispatch 204. If it does not,
 * the whole cache chain is decorative.
 *
 * Skips loudly without ANTHROPIC_API_KEY rather than degrading into a fixture.
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

const ANTHROPIC_KEY = process.env["ANTHROPIC_API_KEY"];
/** Priced in our own catalog WITH cache rates, so the cost can be checked. */
const MODEL = "claude-haiku-4-5";
const PORT = 8793;

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
const PASSWORD = "Test-Cache-Proof-2026!";

let ownerId: string;
let orgId: string;
let ownerClient: SupabaseClient;
let gateway: ReturnType<typeof createGateway>;

/**
 * Anthropic will only cache a prefix above a per-model minimum (2048 tokens on
 * Haiku). Short of it the provider silently declines and reports zero, which
 * would make this proof pass vacuously — so the prompt is comfortably over.
 */
const SYSTEM_PROMPT = Array.from(
  { length: 700 },
  (_, i) =>
    `Rule ${i}: when reconciling an invoice line, treat the provider's own reported token counts as authoritative and never re-derive them locally.`,
).join("\n");

async function messages(body: unknown) {
  const res = await fetch(`http://127.0.0.1:${PORT}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as {
    model: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

function call(question: string) {
  return messages({
    model: MODEL,
    max_tokens: 16,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: question }],
  });
}

async function flushMetered(expected: number): Promise<void> {
  for (let i = 0; i < 200 && gateway.queue.size < expected; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await gateway.flush();
}

const live = ANTHROPIC_KEY ? describe : describe.skip;
if (!ANTHROPIC_KEY) {
  console.warn(
    "[dispatch-205] SKIPPING the live Anthropic prompt-cache proof: ANTHROPIC_API_KEY is not set.",
  );
}

beforeAll(async () => {
  if (!ANTHROPIC_KEY) return;
  const email = `cache-proof-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;
  ownerClient = createClient(URL_, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await ownerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await ownerClient.rpc("create_organization", { _name: `Cache Proof ${stamp}` });
  if (error) throw error;
  orgId = data as string;
  const token = (await mintApiKey(orgId, "Dispatch 205 cache proof", ownerId)).token;

  gateway = createGateway(
    loadConfig({
      COSTMYAI_INGEST_TOKEN: token,
      COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
      COSTMYAI_BASE_URL: APP,
      COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "costmyai-cache-")),
      COSTMYAI_PORT: String(PORT),
      COSTMYAI_FLUSH_INTERVAL_MS: "600000",
    }),
  );
  await new Promise<void>((resolve) => gateway.server.listen(PORT, resolve));
}, 120_000);

afterAll(async () => {
  if (!ANTHROPIC_KEY) return;
  await gateway.shutdown("SIGTERM");
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 120_000);

live("a real cached Anthropic prefix", () => {
  it("is read, stored, priced at the cache rate and visible on a dashboard read", async () => {
    // 1. First call writes the cache. Second call, same prefix, reads it.
    const first = await call("Reply with the single word: one");
    const written = first.usage.cache_creation_input_tokens ?? 0;
    expect(written).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 1500));
    const second = await call("Reply with the single word: two");
    const read = second.usage.cache_read_input_tokens ?? 0;
    expect(read).toBeGreaterThan(0);

    // 2. Both events land, with the provider's own cache counters on them.
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
    expect(cachedRow!.cache_read_tokens).toBe(read);
    expect(rows!.some((r) => (r.cache_write_tokens ?? 0) === written)).toBe(true);

    /**
     * Anthropic reports the cache counters as SIBLINGS of input_tokens. The
     * connector folds them in (parse.ts withCache), so the stored input total
     * is the whole billable prompt and the counters are subsets of it — the
     * invariant every downstream cost term depends on.
     */
    expect(cachedRow!.input_tokens).toBeGreaterThanOrEqual(
      (cachedRow!.cache_read_tokens ?? 0) + (cachedRow!.cache_write_tokens ?? 0),
    );

    // 3. Priced off the live catalog, with the same function the dashboard uses.
    const { data: price } = await admin
      .from("host_prices")
      .select(
        "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, supports_prompt_caching",
      )
      .eq("model_key", "anthropic/claude-haiku-4.5")
      .eq("host", "anthropic")
      .eq("is_fixture", false)
      .maybeSingle();
    expect(price, "the model is priced in the live catalog").toBeTruthy();
    expect(price!.supports_prompt_caching).toBe(true);

    const cacheAware = costOf(price as PriceRow, cachedRow!.input_tokens, cachedRow!.output_tokens, {
      readTokens: cachedRow!.cache_read_tokens ?? 0,
      writeTokens: cachedRow!.cache_write_tokens ?? 0,
    });
    const flat = costOf(price as PriceRow, cachedRow!.input_tokens, cachedRow!.output_tokens);
    // The point of the whole dispatch: a cached call is cheaper than the flat
    // price we used to charge it at, and by the catalog's own margin.
    expect(cacheAware).toBeLessThan(flat);

    // 4. And it is what the customer's own dashboard read returns.
    const { data: rollups } = await ownerClient
      .from("usage_rollups")
      .select("granularity, requests, input_tokens, cache_read_tokens, cache_write_tokens, cost_usd")
      .eq("org_id", orgId)
      .eq("granularity", "day");
    expect(rollups!.length).toBeGreaterThan(0);
    const readTotal = rollups!.reduce((s, r) => s + Number(r.cache_read_tokens ?? 0), 0);
    expect(readTotal).toBe(read);
    const cost = rollups!.reduce((s, r) => s + Number(r.cost_usd), 0);
    expect(cost).toBeGreaterThan(0);
    // The rollup was priced with the cache discount, not the flat rate.
    const flatBoth = rows!.reduce(
      (s, r) => s + costOf(price as PriceRow, r.input_tokens, r.output_tokens),
      0,
    );
    expect(cost).toBeLessThan(flatBoth);

    console.log(
      `[dispatch-205] live Anthropic cache proof: written=${written} read=${read} ` +
        `cache-aware=$${cacheAware.toFixed(6)} flat=$${flat.toFixed(6)} ` +
        `rollup=$${cost.toFixed(6)} flat-rollup=$${flatBoth.toFixed(6)}`,
    );
  }, 180_000);
});
