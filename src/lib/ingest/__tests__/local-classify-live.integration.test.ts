/**
 * Dispatch 232, Phase 1 — the live proof.
 *
 * The unit tests prove the classifier's judgment; this proves the thing that
 * actually blocked the chain drill: real chat traffic, sent to a real provider
 * through a real container, arriving in a real workspace with a task label the
 * certification ladder can act on instead of `unknown`.
 *
 * Everything here is real: a real Anthropic key, real completions, real
 * usage_events rows written by the real ingest endpoint, and the real ladder
 * resolving each stored label to a real instrument.
 *
 * Skips loudly without ANTHROPIC_API_KEY rather than degrading into a fixture.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { normalizeTask, resolveLadder } from "@/lib/benchmarks/task-ladder";
import { mintApiKey } from "@/lib/ingest/keys.server";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { createGateway } from "../../../../packages/gateway-container/src/index";
import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL_ = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const APP = process.env["CONNECTOR_TEST_APP_URL"] ?? "http://localhost:8080";
const ANTHROPIC_KEY = process.env["ANTHROPIC_API_KEY"];
const MODEL = "claude-haiku-4-5";
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
const PASSWORD = "Test-Classify-Live-2026!";

let ownerId: string;
let orgId: string;
let ownerClient: SupabaseClient;
let gateway: ReturnType<typeof createGateway>;

/** Four real user messages, one per label the ladder can actually certify. */
const PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: "code",
    prompt:
      "This throws a TypeError on an empty array, fix it:\n```ts\nconst avg = (xs: number[]) => xs.reduce((a, b) => a + b) / xs.length\n```\nReply with the fixed function only.",
  },
  {
    label: "reasoning",
    prompt:
      "Think step by step, then answer. Which of the following is true of a heap?\n(A) it is always sorted\n(B) the root is always the minimum in a min-heap\n(C) lookup is O(1)\nReply with one letter.",
  },
  {
    label: "generation",
    prompt:
      "Draft a two sentence launch announcement email for a new pricing page. Reply with the email only.",
  },
  {
    label: "classification",
    prompt:
      "Classify the sentiment of this review as positive, negative or neutral. Reply with one word.\nReview: the delivery was four days late and nobody answered support.",
  },
];

async function ask(prompt: string) {
  const res = await fetch(`http://127.0.0.1:${PORT}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 64, messages: [{ role: "user", content: prompt }] }),
  });
  return { status: res.status, task: res.headers.get("x-costmyai-task") };
}

const live = ANTHROPIC_KEY ? describe : describe.skip;
if (!ANTHROPIC_KEY) {
  console.warn("[dispatch-232] SKIPPING the live classification proof: ANTHROPIC_API_KEY is not set.");
}

beforeAll(async () => {
  if (!ANTHROPIC_KEY) return;
  const email = `classify-live-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;
  ownerClient = createClient(URL_, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await ownerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await ownerClient.rpc("create_organization", { _name: `Classify Live ${stamp}` });
  if (error) throw error;
  orgId = data as string;
  const token = (await mintApiKey(orgId, "Dispatch 232 live classification", ownerId)).token;

  gateway = createGateway(
    loadConfig({
      COSTMYAI_INGEST_TOKEN: token,
      COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
      COSTMYAI_BASE_URL: APP,
      COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "costmyai-classify-")),
      COSTMYAI_PORT: "0",
      COSTMYAI_FLUSH_INTERVAL_MS: "600000",
      COSTMYAI_CLASSIFY_LOCAL: "true",
    }),
  );
  await new Promise<void>((resolve) => gateway.server.listen(0, resolve));
  PORT = (gateway.server.address() as { port: number }).port;
}, 120_000);

afterAll(async () => {
  if (!ANTHROPIC_KEY) return;
  await gateway.shutdown("SIGTERM");
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 120_000);

live("real chat traffic, locally classified", () => {
  it("arrives in the workspace with a certifiable label instead of unknown", async () => {
    for (const { label, prompt } of PROMPTS) {
      const { status, task } = await ask(prompt);
      expect(status, `${label} call reached Anthropic`).toBe(200);
      // Disclosed on the caller's own response, in real time.
      expect(task, `${label} disclosed on the wire`).toBe(label);
    }

    for (let i = 0; i < 200 && gateway.queue.size < PROMPTS.length; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await gateway.flush();

    const { data: rows } = await admin
      .from("usage_events")
      .select("task_hint, model_key, host, input_tokens, output_tokens, parse_status")
      .eq("org_id", orgId)
      .order("id", { ascending: true });
    expect(rows).toHaveLength(PROMPTS.length);
    expect(rows!.every((r) => r.parse_status === "parsed")).toBe(true);
    expect(rows!.every((r) => r.input_tokens > 0 && r.output_tokens > 0)).toBe(true);

    // The whole point: not one of these real chat calls is `unknown`.
    expect(rows!.map((r) => r.task_hint)).toEqual(PROMPTS.map((p) => p.label));

    // And each stored label resolves to a real instrument, so certification is
    // reachable for this traffic rather than refused for want of a label.
    for (const row of rows!) {
      expect(normalizeTask(row.task_hint), `${row.task_hint} maps into the ladder`).not.toBeNull();
      const resolved = resolveLadder(row.task_hint, () => 100);
      expect(resolved.refusal, `${row.task_hint} has an instrument`).toBeNull();
      expect(resolved.field).toBeTruthy();
    }

    console.log(
      "[dispatch-232] live labels:",
      rows!.map((r) => `${r.task_hint}=${resolveLadder(r.task_hint, () => 100).field}`).join(" "),
    );
  }, 180_000);
});
