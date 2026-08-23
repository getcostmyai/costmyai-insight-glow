/**
 * Consent-gated Google Analytics.
 *
 * Nothing about GA is loaded, and no cookie is written, until the visitor has
 * explicitly accepted. Declining is remembered too, so the banner does not
 * come back on every page. The measurement ID arrives from the connector as a
 * client-side env var; when it is absent every function here is a no-op, which
 * keeps local and preview builds analytics-free without extra branching.
 */

export const CONSENT_STORAGE_KEY = "costmyai.cookie-consent";
export const CONSENT_EVENT = "costmyai:cookie-consent";

export type ConsentValue = "granted" | "denied";

const MEASUREMENT_ID = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"] as
  | string
  | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export function analyticsConfigured() {
  return Boolean(MEASUREMENT_ID);
}

export function readConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return raw === "granted" || raw === "denied" ? raw : null;
  } catch {
    // Storage can throw in locked-down browsers. Treat that as "not decided".
    return null;
  }
}

export function writeConsent(value: ConsentValue) {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  if (value === "granted") loadAnalytics();
}

/** Clears the stored decision so the banner reappears. */
export function resetConsent() {
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null }));
}

// The canonical gtag shim. It MUST be a real function expression that pushes the
// raw `arguments` object: gtag.js only interprets array-like `arguments` entries
// in dataLayer and silently discards real Arrays (which a rest parameter would
// build), with no error — that is exactly how analytics went dark before.
const gtag: (...args: unknown[]) => void = function () {
  window.dataLayer = window.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
};



let loaded = false;

/** Injects gtag.js exactly once. Only ever called after consent is granted. */
export function loadAnalytics() {
  if (loaded || typeof window === "undefined" || !MEASUREMENT_ID) return;
  loaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: true,
  });
}

/** Loads GA on boot only if the visitor already opted in on a previous visit. */
export function initAnalytics() {
  if (readConsent() === "granted") loadAnalytics();
}

/** SPA route changes: gtag only auto-sends the very first page view. */
export function trackPageView(path: string) {
  if (!loaded) return;
  gtag("event", "page_view", { page_path: path });
}
