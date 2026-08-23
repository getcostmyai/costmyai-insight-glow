import { createServerFn } from "@tanstack/react-start";

/**
 * Intelligence share telemetry.
 *
 * Same transport as `trackEstimatorEvent` and `trackPartnerEvent`: one POST
 * server function into `recordLeadEvent`, which is what resolves `cma_vid` /
 * `cma_sid` and the referral partner. No new pipeline, no new table.
 *
 * The payload can only ever be `{ cardId, platform }`. `cardId` is the stable
 * identifier the page already owns — an anchor id from `share-cards.ts`, or
 * `note-<slug>` for an Intelligence Note — and is clamped to the shape those
 * generators actually produce (kebab/slug characters, bounded length), so this
 * cannot become a free-text write channel.
 */
export const SHARE_PLATFORMS = ["linkedin", "x", "copy_link", "og_image", "copy_post", "download_data"] as const;
export type SharePlatform = (typeof SHARE_PLATFORMS)[number];

const CARD_ID = /^[a-z0-9][a-z0-9._-]{0,119}$/;

export const trackIntelligenceShare = createServerFn({ method: "POST" })
  .inputValidator((data: { cardId?: string; platform?: string }) => {
    const cardId = typeof data?.cardId === "string" ? data.cardId.trim() : "";
    const platform = SHARE_PLATFORMS.includes(data?.platform as SharePlatform)
      ? (data!.platform as SharePlatform)
      : null;
    return {
      cardId: CARD_ID.test(cardId) ? cardId : null,
      platform,
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.intelligenceTelemetry, callerIdentity(getRequest()));

    // A malformed identifier or platform is dropped rather than echoed into the
    // table: an unattributable row is worse than a missing one.
    if (!data.cardId || !data.platform) return { ok: true };

    const { recordLeadEvent } = await import("./telemetry/lead-events.server");
    await recordLeadEvent("intelligence_card_shared", {
      cardId: data.cardId,
      platform: data.platform,
    });
    return { ok: true };
  });
