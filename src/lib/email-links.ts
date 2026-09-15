/**
 * Every link that leaves the building, built in one place.
 *
 * A link inside an email is permanent in a way an in-app link never is: it
 * sits in someone else's inbox long after the host that produced it has moved.
 * So none of these are allowed to depend on the request, the browser, or an
 * environment variable that may quietly be unset. They are built from
 * PUBLIC_SITE_ORIGIN and nothing else.
 *
 * This module exists so the next person writing an email does not have to
 * decide where the origin comes from. Reach for a named builder here; never
 * reach for process.env or a request origin in an email path. The unsubscribe
 * link in particular is a legal obligation, not a convenience: it has to keep
 * resolving for as long as the message exists.
 */
import { PUBLIC_SITE_ORIGIN, publicUrl } from "./public-origin";

/** The origin every outbound link carries. Re-exported so email code never imports an env var. */
export const OUTBOUND_ORIGIN = PUBLIC_SITE_ORIGIN;

export const partnerLoginUrl = () => publicUrl("/partner/login");

export const partnerReferralUrl = (code: string) => publicUrl(`/r/${code}`);

export const partnerVerifyUrl = (code: string) =>
  publicUrl(`/partner/verify/${code.toUpperCase()}`);

export const partnerApplicationsReviewUrl = () => publicUrl("/admin/partner-applications");

export const newsletterConfirmUrl = (token: string) =>
  publicUrl(`/newsletter/confirm?token=${encodeURIComponent(token)}`);

/**
 * Token-less form is the fallback for a subscriber row with no token: the page
 * still resolves and still lets the person unsubscribe by hand.
 */
export const newsletterUnsubscribeUrl = (token?: string | null) =>
  token
    ? publicUrl(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`)
    : publicUrl("/newsletter/unsubscribe");

export const newsletterArchiveUrl = () => publicUrl("/intelligence");

export const feedbackPostUrl = (postId: string) => publicUrl(`/feedback/${postId}`);
