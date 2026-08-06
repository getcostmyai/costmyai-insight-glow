import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Badge and banner endpoints.
 *
 * The badge lookup is deliberately public — that is what makes it verifiable.
 * The banners are not: they are rendered only for the partner account the
 * caller's own token belongs to. No partner id is accepted from the client, so
 * there is nothing to tamper with, and an unauthenticated call never reaches
 * the handler at all.
 */

export interface PublicBadge {
  code: string;
  name: string;
  tierName: string;
  joinedAt: string;
}

export const getPartnerBadge = createServerFn({ method: "GET" })
  .inputValidator((data: { code: string }) => ({ code: String(data.code ?? "").slice(0, 32) }))
  .handler(async ({ data }): Promise<PublicBadge | null> => {
    const { readPartnerBadge } = await import("@/lib/partner-badge.server");
    const badge = await readPartnerBadge(data.code);
    if (!badge) return null;
    return {
      code: badge.code,
      name: badge.name,
      tierName: badge.tierName,
      joinedAt: badge.joinedAt,
    };
  });

export interface BannerDownload {
  filename: string;
  width: number;
  height: number;
  /** PNG bytes as a data URL, so the download never needs a public file URL. */
  dataUrl: string;
}

export const getMyPartnerBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { format: "personal" | "company" | "badge" }) => {
    const format = data?.format;
    if (format !== "personal" && format !== "company" && format !== "badge") {
      throw new Error("Unknown banner format");
    }
    return { format };
  })
  .handler(async ({ data, context }): Promise<BannerDownload> => {
    const { supabase, userId } = context;

    // The partner account comes from the caller's own membership row, never
    // from the request. A signed-in non-partner gets nothing.
    const membership = await supabase
      .from("partner_users")
      .select("partner_id")
      .eq("user_id", userId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) throw new Error("Not a partner account");

    const partner = await supabase
      .from("partners")
      .select("referral_code, status")
      .eq("id", membership.data.partner_id)
      .maybeSingle();
    if (partner.error) throw partner.error;
    if (!partner.data || partner.data.status !== "active") {
      throw new Error("Partner account is not active yet");
    }

    const {
      readPartnerBadge,
      renderBadgePng,
      renderBannerPng,
      badgeVerifyUrl,
      BANNER_SPEC,
    } = await import("@/lib/partner-badge.server");

    const badge = await readPartnerBadge(partner.data.referral_code);
    if (!badge) throw new Error("Partner account is not active yet");

    const origin = getRequestUrl().origin;
    const verifyUrl = badgeVerifyUrl(origin, badge.code);

    const png =
      data.format === "badge"
        ? await renderBadgePng(badge, origin, verifyUrl)
        : await renderBannerPng(badge, data.format, origin, verifyUrl);

    let binary = "";
    for (let i = 0; i < png.length; i += 0x8000) {
      binary += String.fromCharCode(...png.subarray(i, i + 0x8000));
    }

    const spec =
      data.format === "badge"
        ? { width: 600, height: 600 }
        : BANNER_SPEC[data.format];

    return {
      filename: `costmyai-${data.format}-${badge.code.toLowerCase()}.png`,
      width: spec.width,
      height: spec.height,
      dataUrl: `data:image/png;base64,${btoa(binary)}`,
    };
  });
