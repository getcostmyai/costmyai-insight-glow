import { createClient } from "@supabase/supabase-js";
import { findOversized } from "@/lib/engine/rightsize";
import { requiredTierFor, shapeOf } from "@/lib/engine/rightsize";
const ORG = "99488dd8-9fd3-4861-9d55-44f186ca2e56";
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
function kf(key: string): typeof fetch { return (i, init) => { const h = new Headers(init?.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(i, { ...init, headers: h }); }; }
const db = createClient(process.env["SUPABASE_URL"]!, SERVICE, { global: { fetch: kf(SERVICE) }, auth: { persistSession: false } });
const { data: rollups } = await db.from("usage_rollups").select("*").eq("org_id", ORG).eq("granularity", "day");
console.log("rollups", rollups?.length, rollups?.[0]?.bucket_start);
const u = (rollups ?? []).map((r: any) => ({ model_key: r.model_key, host: r.host, task_hint: r.task_hint, requests: r.requests, input_tokens: r.input_tokens, output_tokens: r.output_tokens, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: Number(r.cost_usd), days: 30, output_p50: r.output_p50, output_p95: r.output_p95 }));
console.log("shape", JSON.stringify(shapeOf(u[0] as any)), "required", requiredTierFor(u[0] as any));
const { data: models } = await db.from("model_catalog").select("model_key, tier").eq("is_active", true).limit(2000);
const { data: prices } = await db.from("host_prices").select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, supports_prompt_caching").eq("is_active", true).limit(20000);
console.log("models", models?.length, "prices", prices?.length);
const out = findOversized(u as any, models as any, prices as any);
console.log("oversized", JSON.stringify(out, null, 2).slice(0, 1500));
