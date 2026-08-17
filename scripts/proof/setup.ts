import { createClient } from "@supabase/supabase-js";
import { mintApiKey } from "@/lib/ingest/keys.server";

const URL_ = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUB = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}
const admin = createClient(URL_, SERVICE, { global: { fetch: keyFetch(SERVICE) }, auth: { persistSession: false } });
const stamp = Date.now();
const email = `switch-proof-${stamp}@costmyai-test.dev`;
const password = "Switch-Proof-2026!";
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw created.error;
const userId = created.data.user!.id;
const user = createClient(URL_, PUB, { global: { fetch: keyFetch(PUB) }, auth: { persistSession: false } });
const signIn = await user.auth.signInWithPassword({ email, password });
if (signIn.error) throw signIn.error;
const { data: orgId, error: orgErr } = await user.rpc("create_organization", { _name: "Switch Execution Proof" });
if (orgErr) throw orgErr;
const { data: orgRow } = await admin.from("organizations").select("id,name,plan,is_synthetic").eq("id", orgId as string).single();
const key = await mintApiKey(orgId as string, "Switch Execution Proof container", userId);
console.log(JSON.stringify({ email, password, userId, orgId, orgRow, token: key.token, accessToken: signIn.data.session!.access_token }, null, 2));
