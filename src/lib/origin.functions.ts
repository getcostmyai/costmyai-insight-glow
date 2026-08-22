import { createServerFn } from "@tanstack/react-start";

/**
 * The origin this page is actually being served from, resolved on the server.
 *
 * Share URLs used to be built from `window.location.origin`, which is unknown
 * during SSR and during the first client render, so the served HTML carried
 * path-only share links (`?url=%2Fintelligence%2F...`) until hydration
 * finished. Crawlers and no-JS readers never saw a usable URL at all.
 *
 * The request already knows the origin, so that is what we read. It is correct
 * on localhost, on preview and on production with no constant to maintain and
 * nothing to keep in sync when a domain changes.
 */
export const getRequestOrigin = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const url = new URL(request.url);

    // Behind the sandbox's localhost rewrite the real public host only exists
    // in x-forwarded-host. Elsewhere that header is caller-spoofable, so it is
    // trusted for localhost and ignored everywhere else.
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      const forwardedHost = request.headers.get("x-forwarded-host");
      if (forwardedHost) {
        const proto = request.headers.get("x-forwarded-proto") ?? "https";
        return `${proto}://${forwardedHost}`;
      }
    }
    return url.origin;
  },
);
