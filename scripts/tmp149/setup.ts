/**
 * Dispatch 149 — proof matrix, setup half.
 *
 * Creates throwaway accounts and a throwaway partner, and writes their
 * Supabase sessions to a scratch file so the browser half can replay them.
 * Nothing here is a fixture: the partner row and membership are the same rows
 * a real approved partner gets.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function makeUser(tag: string) {
  const email = `d149-${tag}-${Date.now()}@costmyai.test`;
  const password = `D149-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const pub = createClient(URL_, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const signIn = await pub.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user!.id, session: signIn.data.session };
}

const nonPartner = await makeUser("nonpartner");
const partnerUser = await makeUser("partner");

const { data: partner, error: pErr } = await admin
  .from("partners")
  .insert({
    name: "D149 Proof Partner",
    referral_code: `D149PROOF${Date.now() % 100000}`,
    status: "active",
  })
  .select("id")
  .single();
if (pErr) throw pErr;
const { error: puErr } = await admin
  .from("partner_users")
  .insert({ partner_id: partner.id, user_id: partnerUser.id, role: "owner" });
if (puErr) throw puErr;

writeFileSync(
  "/tmp/browser/d149/state.json",
  JSON.stringify(
    {
      partnerId: partner.id,
      nonPartner: { id: nonPartner.id, session: nonPartner.session },
      partnerUser: { id: partnerUser.id, session: partnerUser.session },
    },
    null,
    2,
  ),
);
console.log("ready", { partnerId: partner.id });
