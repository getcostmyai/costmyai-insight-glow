import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Partner early access — a real mechanism, not a claim.
 *
 * The public Intelligence page only ever publishes a month once it has been
 * frozen. Partners see the same month while it is still moving: the current,
 * unfrozen price-move figures, read from the same source the frozen page will
 * later publish. That is the whole of the early-access promise, and it is
 * gated on an active partner membership derived from the caller's own token.
 */

export interface PartnerEarlyAccess {
  monthLabel: string;
  generatedAt: string;
  liveModels: number;
  liveHosts: number;
  changesTotal: number;
  increases: number;
  decreases: number;
  newListings: number;
}

export const getPartnerEarlyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PartnerEarlyAccess | null> => {
    const { supabase, userId } = context;

    const membership = await supabase
      .from("partner_users")
      .select("partner_id")
      .eq("user_id", userId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) return null;

    const partner = await supabase
      .from("partners")
      .select("status")
      .eq("id", membership.data.partner_id)
      .maybeSingle();
    if (partner.error) throw partner.error;
    if (partner.data?.status !== "active") return null;

    const { readIntelligence } = await import("@/lib/intelligence/intelligence.server");
    const p = await readIntelligence();

    return {
      monthLabel: p.monthLabel,
      generatedAt: p.generatedAt,
      liveModels: p.liveModels,
      liveHosts: p.liveHosts,
      changesTotal: p.changesTotal,
      increases: p.increases,
      decreases: p.decreases,
      newListings: p.newListings,
    };
  });
