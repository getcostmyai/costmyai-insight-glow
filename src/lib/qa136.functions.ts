import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const qaProbe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string> => {
    const steps: string[] = [];
    try {
      const { supabase, userId } = context;
      steps.push(`user=${userId}`);
      const membership = await supabase
        .from("partner_users")
        .select("partner_id")
        .eq("user_id", userId)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      steps.push(`membership=${JSON.stringify(membership.data)} err=${membership.error?.message}`);
      const partner = await supabase
        .from("partners")
        .select("referral_code, status")
        .eq("id", membership.data?.partner_id ?? "")
        .maybeSingle();
      steps.push(`partner=${JSON.stringify(partner.data)} err=${partner.error?.message}`);
      steps.push(`origin=${getRequestUrl().origin}`);
    } catch (e) {
      steps.push(`ERROR=${e instanceof Error ? e.stack : String(e)}`);
    }
    return steps.join("\n");
  });
