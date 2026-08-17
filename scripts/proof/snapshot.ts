import { createClient } from "@supabase/supabase-js";
import { buildDashboardSnapshot } from "@/lib/dashboard.server";
const ORG = "99488dd8-9fd3-4861-9d55-44f186ca2e56";
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
function keyFetch(key: string): typeof fetch { return (i, init) => { const h = new Headers(init?.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(i, { ...init, headers: h }); }; }
const admin = createClient(process.env["SUPABASE_URL"]!, SERVICE, { global: { fetch: keyFetch(SERVICE) }, auth: { persistSession: false } });
const s = await buildDashboardSnapshot({ days: 30, orgId: ORG, client: admin as never });
console.log(JSON.stringify({ oversized: s.oversized, hostArbitrage: s.hostArbitrage, qualityMatched: s.qualityMatched, spend: (s as any).spend?.total ?? null }, null, 2).slice(0, 4000));
