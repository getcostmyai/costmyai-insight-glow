import { supabaseAdmin } from "@/integrations/supabase/client.server";
for (const t of ["partners","organizations","lead_events","commission_ledger","subscriptions"]) {
  const { data, error } = await supabaseAdmin.from(t as any).select("*").limit(1);
  console.log(t, error?.message ?? Object.keys(data?.[0] ?? {}));
}
