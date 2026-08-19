/**
 * Dispatch 238 proof. Real rows, real database:
 *  1. an event naming a switch that does not exist is refused at insert
 *  2. deleting a switch that a stored event still references is refused
 *  3. deleting the event first releases the switch
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";

const stamp = Date.now();
const { data: org, error: orgErr } = await db
  .from("organizations")
  .insert({ name: `FK Proof ${stamp}`, slug: `fk-proof-${stamp}`, plan: "govern" })
  .select("id")
  .single();
if (orgErr) throw orgErr;
const orgId = org!.id as string;

const { data: sw, error: swErr } = await db
  .from("switches")
  .insert({
    org_id: orgId,
    from_model: "gpt-4.1", from_host: "openai",
    to_model: "gpt-4.1-mini", to_host: "openai",
    basis: "fk proof", badge: "SAME MODEL", status: "active",
  })
  .select("id")
  .single();
if (swErr) throw swErr;
const switchId = sw!.id as string;

const baseEvent = {
  org_id: orgId,
  occurred_at: new Date().toISOString(),
  model_key: "gpt-4.1-mini", host: "openai", task_hint: "code",
  input_tokens: 100, output_tokens: 20, status: "ok",
  parse_status: "parsed", rerouted: true,
  original_model_key: "gpt-4.1", original_host: "openai",
};

// 1. orphan insert
const orphan = await db
  .from("usage_events")
  .insert({ ...baseEvent, route_reason: "00000000-0000-0000-0000-0000000000ff" } as never);
console.log("1. orphan insert refused:", Boolean(orphan.error), "|", orphan.error?.message ?? "NO ERROR — LEAK");

// 2. delete switch while referenced
const { error: evErr } = await db.from("usage_events").insert({ ...baseEvent, route_reason: switchId } as never);
if (evErr) throw evErr;
const del = await db.from("switches").delete().eq("id", switchId).select("id");
console.log("2. switch delete refused:", Boolean(del.error), "|", del.error?.message ?? `NO ERROR — deleted ${del.data?.length} rows`);

// 3. correct ordering succeeds
await db.from("usage_events").delete().eq("org_id", orgId);
const del2 = await db.from("switches").delete().eq("id", switchId).select("id");
console.log("3. delete after events cleared:", del2.error ? `FAILED ${del2.error.message}` : `ok, ${del2.data?.length} switch removed`);

await db.from("usage_rollups").delete().eq("org_id", orgId);
await db.from("organizations").delete().eq("id", orgId);
console.log("cleaned up");
