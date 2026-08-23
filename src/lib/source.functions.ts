import { createServerFn } from "@tanstack/react-start";

/**
 * First-touch acquisition capture, run once per document request.
 *
 * Called from `__root.beforeLoad` on the server side only: the SSR document
 * request is the single request whose `Referer` is the site that actually sent
 * the visitor, and whose URL still carries the UTM parameters they landed
 * with. Every later server-function POST refers to our own page.
 *
 * The write itself is first-touch-only (see `captureFirstTouchSource`), so
 * calling this on every document request is safe and idempotent.
 */
export const captureFirstTouch = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ok: true }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { captureFirstTouchSource } = await import("./telemetry/lead-events.server");
    try {
      captureFirstTouchSource(getRequest());
    } catch (err) {
      // Telemetry never breaks the page it is measuring.
      console.error("first touch not captured", err instanceof Error ? err.message : String(err));
    }
    return { ok: true };
  },
);
