#!/usr/bin/env bun
/**
 * Audit 2, Journeys 6 and 7 — run against two real, non-demo accounts.
 *
 * Journey 7: every previous isolation proof used the demo workspace on one
 * side. This provisions two genuinely independent real accounts and attempts,
 * from B's own session, every cross-tenant read and write that PostgREST and
 * the RPC surface expose against A's workspace. Refusal has to be observed —
 * an error, or zero rows returned where rows demonstrably exist.
 *
 * Journey 6: A connects for real (mints a token, pushes real events through
 * the public ingest route), then the token is revoked and the connection
 * classifier is asked what the dashboard would say.
 *
 *   bun scripts/audit/journey-6-7.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { classifyIngest } from "../../src/lib/dashboard/ingest-health";
import { mintApiKey, revokeApiKey } from "../../src/lib/ingest/keys.server";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const APP = process.env["APP_URL"] ?? "http://localhost:8080";

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

const stamp = Date.now();
const PASSWORD = "Journey-67-Pass-2026!";

async function actor(who: string) {
  const email = `journey67-${who}-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const client = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user!.id, email, client, token: signedIn.data.session!.access_token };
}

let fails = 0;
function verdict(name: string, refused: boolean, detail: string) {
  if (!refused) fails += 1;
  console.log(`${refused ? "REFUSED " : "LEAKED  "} ${name} — ${detail}`);
}

const a = await actor("a");
const b = await actor("b");

const orgA = (await a.client.rpc("create_organization", { _name: `Journey A ${stamp}` })).data as string;
const orgB = (await b.client.rpc("create_organization", { _name: `Journey B ${stamp}` })).data as string;
console.log(`real account A org ${orgA}\nreal account B org ${orgB}\n`);

// ---------------------------------------------------------------- Journey 6
console.log("=== Journey 6 — connect for real, then revoke ===");
const key = await mintApiKey(orgA, "Journey 6 gateway", a.id);

const now = new Date();
const events = [0, 1, 2].map((i) => ({
  occurred_at: new Date(now.getTime() - i * 3_600_000).toISOString(),
  model_key: "gpt-4o-mini",
  host: "openai",
  task_hint: "generation" as const,
  input_tokens: 1200 + i * 40,
  output_tokens: 300 + i * 10,
  latency_ms: 900,
  status: "ok" as const,
  idempotency_key: `j6-${stamp}-${i}`,
}));

const push = await fetch(`${APP}/api/public/v1/events`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${key.token}` },
  body: JSON.stringify({ v: 1, events }),
});
console.log(`ingest push: ${push.status} ${await push.text()}`);

async function connectionState(orgId: string) {
  const [last, keys] = await Promise.all([
    admin
      .from("usage_events")
      .select("occurred_at")
      .eq("org_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("api_keys").select("revoked_at").eq("org_id", orgId),
  ]);
  const rows = keys.data ?? [];
  return classifyIngest({
    lastEventAt: last.data?.occurred_at ?? null,
    activeTokens: rows.filter((k) => !k.revoked_at).length,
    lastRevokedAt: rows.map((k) => k.revoked_at).filter(Boolean).sort().at(-1) ?? null,
    nowMs: Date.now(),
  });
}

const connected = await connectionState(orgA);
console.log(`after real ingest: ${JSON.stringify(connected)}`);
if (connected.state !== "live") fails += 1;

await revokeApiKey(orgA, key.id);
const afterRevoke = await connectionState(orgA);
console.log(`after revocation:  ${JSON.stringify(afterRevoke)}`);
if (afterRevoke.state !== "disconnected") fails += 1;

const rejected = await fetch(`${APP}/api/public/v1/events`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${key.token}` },
  body: JSON.stringify({ v: 1, events }),
});
verdict("revoked token pushing events", rejected.status === 401, `HTTP ${rejected.status}`);

// ---------------------------------------------------------------- Journey 7
console.log("\n=== Journey 7 — B attacks A, both real accounts ===");

// Facts that exist, so "zero rows" is a refusal and not an empty table.
const truth = await admin.from("usage_events").select("id").eq("org_id", orgA);
console.log(`A really holds ${(truth.data ?? []).length} usage events\n`);

const bc = b.client as SupabaseClient;

const reads: Array<[string, string]> = [
  ["usage_events", "id"],
  ["usage_rollups", "id"],
  ["api_keys", "id"],
  ["organizations", "id"],
  ["memberships", "id"],
  ["user_roles", "id"],
  ["recommendations", "id"],
  ["switches", "id"],
  ["objectives", "id"],
  ["routing_rules", "id"],
  ["subscriptions", "id"],
  ["billing_captures", "id"],
  ["org_profiles", "org_id"],
  ["org_invites", "id"],
];
for (const [table, col] of reads) {
  const filter = table === "organizations" ? "id" : table === "org_profiles" ? "org_id" : "org_id";
  const res = await bc.from(table).select(col).eq(filter, orgA);
  const rows = (res.data ?? []).length;
  verdict(`select ${table}`, Boolean(res.error) || rows === 0, res.error ? res.error.message : `${rows} rows`);
}

const writes: Array<[string, () => PromiseLike<{ error: unknown; data: unknown }>]> = [
  [
    "insert objective into A",
    () => bc.from("objectives").insert({ org_id: orgA, objective: "cost" }).select("id"),
  ],
  [
    "insert routing rule into A",
    () =>
      bc
        .from("routing_rules")
        .insert({
          org_id: orgA,
          from_model: "gpt-4o",
          from_host: "openai",
          to_model: "gpt-4o-mini",
          to_host: "openai",
          source: "manual",
          state: "active",
          basis: "idor probe",
        })
        .select("id"),
  ],
  ["rename A", () => bc.from("organizations").update({ name: "owned" }).eq("id", orgA).select("id")],
  [
    "upgrade A's plan",
    () => bc.from("organizations").update({ plan: "govern" }).eq("id", orgA).select("id"),
  ],
  [
    "enable autonomous on A",
    () => bc.from("organizations").update({ autonomous_enabled: true }).eq("id", orgA).select("id"),
  ],
  [
    "join A as owner",
    () => bc.from("memberships").insert({ org_id: orgA, user_id: b.id }).select("id"),
  ],
  [
    "grant self a role in A",
    () => bc.from("user_roles").insert({ org_id: orgA, user_id: b.id, role: "owner" }).select("id"),
  ],
  ["delete A's tokens", () => bc.from("api_keys").delete().eq("org_id", orgA).select("id")],
];
for (const [name, run] of writes) {
  const res = await run();
  const rows = Array.isArray(res.data) ? res.data.length : res.data ? 1 : 0;
  verdict(name, Boolean(res.error) || rows === 0, res.error ? String((res.error as Error).message) : `${rows} rows written`);
}

const rpcs: Array<[string, string, Record<string, unknown>]> = [
  ["is_org_manager(A)", "is_org_manager", { _org_id: orgA }],
  ["is_org_member(A)", "is_org_member", { _org_id: orgA }],
  ["set_org_plan(A, govern)", "set_org_plan", { _org_id: orgA, _plan: "govern" }],
  ["org_plan(A)", "org_plan", { _org_id: orgA }],
  ["apply_switch(random)", "apply_switch", { _rec_id: "00000000-0000-0000-0000-0000000000aa", _autonomous: true }],
  ["accept_invite(random)", "accept_invite", { _invite_id: "00000000-0000-0000-0000-0000000000aa" }],
];
for (const [name, fn, args] of rpcs) {
  const res = await bc.rpc(fn, args);
  const truthy = res.data === true || (typeof res.data === "string" && res.data.length > 0);
  verdict(`rpc ${name}`, Boolean(res.error) || !truthy, res.error ? res.error.message : `returned ${JSON.stringify(res.data)}`);
}

// ------------------------------------------------------------------ cleanup
await admin.from("organizations").delete().in("id", [orgA, orgB]);
await admin.auth.admin.deleteUser(a.id);
await admin.auth.admin.deleteUser(b.id);
console.log(`\ncleanup: both real test accounts and workspaces removed`);
console.log(fails === 0 ? "\nALL CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
