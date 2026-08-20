import { PRIVACY_VERSION, TERMS_VERSION, type ConsentMethod } from "@/lib/consent";

/**
 * Write the acceptance record for a freshly created account.
 *
 * Runs with the admin client because the record must exist even when signup
 * requires email confirmation — at that moment there is no session yet, so the
 * user cannot write it themselves. The caller is unauthenticated, so the user
 * id is never trusted on its own: we look the user up and require the claimed
 * email to match, and the row is unique per (user, terms, privacy) version so a
 * replay cannot inflate the record.
 */
export async function writeConsentRecord(input: {
  userId: string;
  email: string;
  method: ConsentMethod;
}): Promise<{ recorded: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: found, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(
    input.userId,
  );
  if (lookupError || !found?.user) return { recorded: false };
  const email = found.user.email?.toLowerCase() ?? "";
  if (!email || email !== input.email.trim().toLowerCase()) return { recorded: false };

  const { error } = await supabaseAdmin.from("consent_records").upsert(
    {
      user_id: input.userId,
      email,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      method: input.method,
    },
    { onConflict: "user_id,terms_version,privacy_version", ignoreDuplicates: true },
  );
  if (error) throw error;
  return { recorded: true };
}
