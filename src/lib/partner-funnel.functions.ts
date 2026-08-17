import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FunnelStageRow, FunnelWindow } from "./partner-funnel.server";

/**
 * Referral funnel for the signed-in partner. The window is the only input —
 * the partner id is resolved server-side from the caller's membership, so a
 * browser can never ask for someone else's funnel.
 */
export const getMyFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { windowDays: number }): { windowDays: FunnelWindow } => {
    const w = Number(data?.windowDays);
    if (w !== 7 && w !== 30 && w !== 90) throw new Error("Unsupported window");
    return { windowDays: w };
  })
  .handler(async ({ context, data }): Promise<FunnelStageRow[] | null> => {
    const { readMyFunnel } = await import("./partner-funnel.server");
    return readMyFunnel(context.supabase, context.userId, data.windowDays);
  });
