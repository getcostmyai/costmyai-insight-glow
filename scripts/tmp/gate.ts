import { createClient } from "@supabase/supabase-js";
import { requirePlan, resolvePlan } from "../../src/lib/billing/guard.server";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const paid = process.argv[2]!;

const { data: fresh } = await db
  .from("organizations")
  .insert({ name: "E2E Gate Unpaid", slug: `e2e-gate-${Date.now()}`, plan: "certify", is_synthetic: false })
  .select("id").single();

async function probe(label: string, orgId: string, tier: any) {
  try {
    const p = await requirePlan(db as any, orgId, tier, "sandbox");
    console.log(`${label} requirePlan(${tier}) => ALLOWED (effective ${p})`);
  } catch (e) {
    console.log(`${label} requirePlan(${tier}) => DENIED (${(e as Error).message})`);
  }
}

console.log("unpaid org record claims:", (await db.from("organizations").select("plan").eq("id", fresh!.id).single()).data);
console.log("unpaid effective plan:", await resolvePlan(db as any, fresh!.id, "sandbox"));
await probe("unpaid", fresh!.id, "certify");
console.log("paid effective plan:", await resolvePlan(db as any, paid, "sandbox"));
await probe("paid", paid, "certify");
await probe("paid", paid, "govern");
