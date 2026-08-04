import { createClient } from "@supabase/supabase-js";
import { mintApiKey, revokeApiKey } from "../../src/lib/ingest/keys.server";
const URL = process.env["SUPABASE_URL"]!, SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const org = "6d4ab4aa-b076-4770-aca7-ee320ece04e9";
const user = "2d2162ee-f6ba-4674-a81d-5fa4d2fe0b3f";
const key = await mintApiKey(org, "priced gateway", user);
const now = Date.now(); const stamp = now;
const events = Array.from({ length: 240 }, (_, i) => ({
  occurred_at: new Date(now - i * 3_600_000 / 4).toISOString(),
  model_key: "openai/gpt-4o-mini", host: "openai", task_hint: "generation" as const,
  input_tokens: 2400 + (i % 7) * 120, output_tokens: 700 + (i % 5) * 40,
  latency_ms: 910, status: "ok" as const, idempotency_key: `priced-${stamp}-${i}`,
}));
const r = await fetch("http://localhost:8080/api/public/v1/events", { method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${key.token}` },
  body: JSON.stringify({ v: 1, events }) });
console.log("priced push:", r.status, await r.text());
await revokeApiKey(org, key.id);
const { count } = await admin.from("usage_rollups").select("id", { count: "exact", head: true }).eq("org_id", org);
console.log("rollups now:", count);
