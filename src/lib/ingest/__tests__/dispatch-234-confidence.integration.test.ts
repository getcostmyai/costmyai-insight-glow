/**
 * Dispatch 234 — label confidence on the wire, and the refusal it earns.
 *
 * Three claims, each proved against the real public ingest route, the real
 * database and the real ladder — nothing stubbed below the HTTP boundary:
 *
 *  1. An incoherent event (a label claiming no confidence, or an `unknown`
 *     claiming some) is refused with a 422 rather than stored.
 *  2. A mixed batch — v1-shaped events carrying no confidence at all, and v2
 *     events carrying real ones — rolls up to a requests-weighted mean
 *     confidence and the MINIMUM contributing classifier revision.
 *  3. Traffic a local classifier actually read and declined to label earns the
 *     new `task_label_low_confidence` refusal, with copy naming the real cause,
 *     and not the older "nobody ever looked" refusal.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { INGEST_PATHS } from "@/lib/ingest/contract";
import { mintApiKey } from "@/lib/ingest/keys.server";
import { resolveLadder } from "@/lib/benchmarks/task-ladder";
import { REFUSAL_LABEL } from "@/lib/dashboard.server";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const APP = process.env["CONNECTOR_TEST_APP_URL"] ?? "http://localhost:8080";
const EVENTS_URL = `${APP}${INGEST_PATHS.events}`;

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
const PASSWORD = "Test-D234-Confidence-2026!";
const HOST = "api.openai.com";
const MODEL = "gpt-4o-mini";
/** One bucket: every event in the mixed batch lands in the same hour. */
const OCCURRED = new Date(Date.now() - 3 * 3_600_000);
OCCURRED.setUTCMinutes(5, 0, 0);

let orgId: string;
let token: string;

async function post(body: unknown) {
  const res = await fetch(EVENTS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function event(extra: Record<string, unknown>) {
  return {
    occurred_at: OCCURRED.toISOString(),
    model_key: MODEL,
    host: HOST,
    input_tokens: 1_000,
    output_tokens: 200,
    ...extra,
  };
}

beforeAll(async () => {
  const email = `d234-confidence-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const client: SupabaseClient = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await client.rpc("create_organization", { _name: `D234 ${stamp}` });
  if (error) throw error;
  orgId = data as string;
  token = (await mintApiKey(orgId, "D234 confidence proof", created.data.user!.id)).token;
}, 60_000);

describe("the coherence invariant is enforced at the door", () => {
  it("refuses a labelled event claiming zero confidence", async () => {
    const res = await post({
      v: 2,
      events: [event({ task_hint: "code", task_confidence: 0, classifier_revision: 1 })],
    });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.json)).toContain("task_confidence");
  });

  it("refuses an unknown event claiming non-zero confidence", async () => {
    const res = await post({
      v: 2,
      events: [event({ task_hint: "unknown", task_confidence: 0.8, classifier_revision: 1 })],
    });
    expect(res.status).toBe(422);
  });

  it("still accepts a v1-shaped event that reports neither field", async () => {
    const res = await post({
      v: 1,
      events: [event({ task_hint: "code", idempotency_key: `d234-v1-shape-${stamp}` })],
    });
    expect(res.status).toBe(200);
    expect(res.json["accepted"]).toBe(1);
  });
});

describe("rollup metadata across a mixed batch", () => {
  it("stores a requests-weighted mean confidence and the MINIMUM revision", async () => {
    // Three events in one bucket: one v1-shaped (no classifier ran at all,
    // revision 0), two from a v2 container with real confidences.
    const res = await post({
      v: 2,
      events: [
        event({ task_hint: "code", idempotency_key: `d234-mix-a-${stamp}` }),
        event({
          task_hint: "code",
          task_confidence: 0.9,
          classifier_revision: 1,
          idempotency_key: `d234-mix-b-${stamp}`,
        }),
        event({
          task_hint: "code",
          task_confidence: 0.6,
          classifier_revision: 1,
          idempotency_key: `d234-mix-c-${stamp}`,
        }),
      ],
    });
    expect(res.status).toBe(200);
    expect(res.json["accepted"]).toBe(3);

    const { data, error } = await admin
      .from("usage_rollups")
      .select("requests, task_confidence_mean, classifier_revision_min")
      .eq("org_id", orgId)
      .eq("granularity", "hour")
      .eq("task_hint", "code");
    if (error) throw error;
    const bucket = data!.find((r) => Number(r.requests) >= 3);
    expect(bucket, "the mixed batch must land in one hour bucket").toBeTruthy();

    // Four events land here: the v1-shape acceptance test above plus the three
    // in this batch. Two report nothing (counted as 0), one 0.90, one 0.60.
    const requests = Number(bucket!.requests);
    const expected =
      Math.round(((0.9 + 0.6) / requests) * 100) / 100;
    expect(Number(bucket!.task_confidence_mean)).toBeCloseTo(expected, 2);
    // Minimum, not maximum: a bucket is only as trustworthy as its weakest
    // contributor, and one event here had no classifier behind it at all.
    expect(Number(bucket!.classifier_revision_min)).toBe(0);
  }, 60_000);
});

describe("the refusal a declined label earns", () => {
  const separation = () => 0.2;

  it("names the classifier when one actually read the traffic and abstained", () => {
    const resolution = resolveLadder("unknown", separation, undefined, {
      classifierRevision: 1,
    });
    expect(resolution.refusal).toBe("task_label_low_confidence");
    expect(resolution.detail).toMatch(/declined to label/i);
    // Rewritten when remote classification shipped: the honest next step is no
    // longer "send a structural signal" but the off-path remote fallback.
    expect(resolution.detail).toMatch(/remote fallback|COSTMYAI_CLASSIFY_REMOTE/i);
    expect(resolution.detail).toMatch(/cheaper-host switches/i);
    expect(REFUSAL_LABEL["task_label_low_confidence"]).toMatch(/could not name/i);
  });

  it("keeps the old refusal when no classifier ever looked", () => {
    expect(resolveLadder("unknown", separation, undefined, { classifierRevision: 0 }).refusal).toBe(
      "no_valid_instrument",
    );
    expect(resolveLadder("unknown", separation).refusal).toBe("no_valid_instrument");
  });
});
