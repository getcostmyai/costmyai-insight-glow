/**
 * Which panels the partner-facing workspace shows.
 *
 * Both panels stay fully built and their data keeps collecting in the
 * background, so switching one back on shows real history rather than an empty
 * shell. Re-enabling is a one-line change here. Platform-admin surfaces are not
 * gated by these flags.
 */

/** The "Referral funnel" panel on /partner. Events keep being recorded either way. */
export const SHOW_PARTNER_REFERRAL_FUNNEL = true;

/** The "Certified Partner badge and banners" panel on /partner. Generation stays live. */
export const SHOW_PARTNER_BADGE_ASSETS = false;
