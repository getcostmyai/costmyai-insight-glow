import { createClient } from "@supabase/supabase-js";
import { mintApiKey, revokeApiKey } from "../../src/lib/ingest/keys.server";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const h = new Headers(init?.headers);
    if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
    h.set("apikey", key);
    return fetch(input, { ...init, headers: h });
  };
}
const admin = createClient(URL, SERVICE, { global: { fetch: keyFetch(SERVICE) }, auth: { persistSession: false } });
const stamp = Date.now();
const email = `journey6-ui-${stamp}@costmyai-test.dev`;
const password = "Journey-6-UI-2026!";
const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (u.error) throw u.error;
const client = createClient(URL, PUBLISHABLE, { global: { fetch: keyFetch(PUBLISHABLE) }, auth: { persistSession: false } });
await client.auth.signInWithPassword({ email, password });
const org = (await client.rpc("create_organization", { _name: `Journey 6 UI ${stamp}` })).data as string;
const key = await mintApiKey(org, "UI proof gateway", u.data.user!.id);
const now = Date.now();
const events = Array.from({ length: 40 }, (_, i) => ({
  occurred_at: new Date(now - i * 3_600_000).toISOString(),
  model_key: "gpt-4o-mini", host: "openai", task_hint: "generation" as const,
  input_tokens: 1500 + i * 11, output_tokens: 420 + i * 3, latency_ms: 880, status: "ok" as const,
  idempotency_key: `ui-${stamp}-${i}`,
}));
const push = await fetch("http://localhost:8080/api/public/v1/events", {
  method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key.token}` },
  body: JSON.stringify({ v: 1, events }),
});
console.log("ingest", push.status, await push.text());
await revokeApiKey(org, key.id);
console.log(JSON.stringify({ email, password, org, userId: u.data.user!.id }));
