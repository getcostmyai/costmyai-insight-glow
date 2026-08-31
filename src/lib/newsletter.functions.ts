import { createServerFn } from "@tanstack/react-start";

import { isValidEmail, isPlausibleToken } from "./newsletter/newsletter";

/**
 * Public newsletter surface.
 *
 * Same conventions as the partner application form: every field is
 * re-validated server-side, the shared Postgres rate limiter guards the write
 * path, and the response never distinguishes "this address is on the list"
 * from "this address is not".
 */
export const subscribeToNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; source?: string | null }) => {
    if (!isValidEmail(data?.email)) throw new Error("Please enter a valid email address");
    return { email: data.email, source: data.source ?? null };
  })
  .handler(async ({ data }) => {
    // Each accepted call sends a real email, so this sits at the
    // partner-application end of the scale rather than the telemetry end.
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.newsletterSignup, callerIdentity(getRequest()));

    // The event is written before the outcome is known, deliberately: this
    // records "someone submitted the form", which is true regardless of
    // whether the address turns out to be already-confirmed. Making the event
    // conditional on the outcome would reintroduce the enumeration signal we
    // just removed from the response.
    const { recordLeadEvent } = await import("./telemetry/lead-events.server");
    const { visitorId, sessionId } = await recordLeadEvent("newsletter_signup_submitted", {
      source: data.source ?? null,
    });

    const { subscribe } = await import("./newsletter/newsletter.server");
    await subscribe(data.email, data.source, { visitorId, sessionId });

    // One fixed answer for every path. The page says "check your inbox".
    return { ok: true } as const;
  });

/** Fired when a signup form actually becomes visible, so conversion has a denominator. */
export const trackNewsletterShown = createServerFn({ method: "POST" })
  .inputValidator((data: { source?: string | null }) => ({ source: data?.source ?? null }))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.newsletterTelemetry, callerIdentity(getRequest()));

    const { recordLeadEvent } = await import("./telemetry/lead-events.server");
    await recordLeadEvent("newsletter_signup_shown", { source: data.source });
    return { ok: true } as const;
  });

/**
 * Double opt-in completion. Token-only: no session, nothing else identifies the
 * caller, which is why the token has 256 bits behind it and is consumed on use.
 */
export const confirmNewsletterSubscription = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "").trim() }))
  .handler(async ({ data }) => {
    if (!isPlausibleToken(data.token)) return { status: "invalid" } as const;

    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.newsletterToken, callerIdentity(getRequest()));

    const { confirmSubscription } = await import("./newsletter/newsletter.server");
    const result = await confirmSubscription(data.token);

    if (result.status === "confirmed") {
      const { recordLeadEvent } = await import("./telemetry/lead-events.server");
      await recordLeadEvent("newsletter_signup_confirmed", null);
    }

    return {
      status: result.status,
      unsubscribeToken: result.unsubscribeToken ?? null,
    } as const;
  });

/** Leaving is idempotent and never rate-limited into failure — see the fail-open limiter. */
export const unsubscribeFromNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "").trim() }))
  .handler(async ({ data }) => {
    if (!isPlausibleToken(data.token)) return { status: "invalid" } as const;

    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.newsletterToken, callerIdentity(getRequest()));

    const { unsubscribeByToken } = await import("./newsletter/newsletter.server");
    const result = await unsubscribeByToken(data.token);
    return { status: result.status } as const;
  });
