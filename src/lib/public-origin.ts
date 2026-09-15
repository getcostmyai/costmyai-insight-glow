/**
 * The origin every link a partner hands to someone else must carry.
 *
 * Deliberately a constant, not the request origin. Verification links and
 * referral links are rendered inside the app, but they are read somewhere else
 * entirely: a LinkedIn banner, a signature, a deck. A partner who opened the
 * preview host and copied a link would otherwise be handing out
 * preview--...lovable.app, which contradicts the promise printed right above it
 * and dies the moment the preview moves.
 *
 * Request-derived origin stays correct for in-app navigation. This is only for
 * URLs that leave the building.
 */
export const PUBLIC_SITE_ORIGIN = "https://www.costmyai.com";

export const publicUrl = (path: string) =>
  `${PUBLIC_SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
