import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  CONSENT_EVENT,
  analyticsConfigured,
  initAnalytics,
  readConsent,
  writeConsent,
} from "@/lib/analytics";

/**
 * Consent gate for Google Analytics. Rendered once at the root.
 *
 * Design follows the Intelligence standard: a hairline rail over glass, no
 * card, real typography, one purple accent on the single affirmative action.
 * Decline is a real, equally reachable choice, not a greyed-out afterthought.
 */
export function CookieConsent() {
  const [decided, setDecided] = useState(true); // assume decided until mounted: no SSR flash
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    initAnalytics();
    if (!analyticsConfigured()) return;
    if (readConsent() !== null) return;
    setDecided(false);
    // One frame later so the entry transition actually runs.
    const t = window.setTimeout(() => setVisible(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  // Re-open when the footer control clears the stored decision.
  useEffect(() => {
    function onConsent(e: Event) {
      const value = (e as CustomEvent).detail as string | null;
      if (value === null) {
        setDecided(false);
        setVisible(true);
      }
    }
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);

  if (decided) return null;

  function decide(value: "granted" | "denied") {
    setVisible(false);
    writeConsent(value);
    window.setTimeout(() => setDecided(true), 260);
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className={`fixed inset-x-0 bottom-0 z-[60] border-t border-border/70 glass transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-6 sm:px-8 md:flex-row md:items-center md:justify-between md:gap-10">
        <div className="max-w-2xl">
          <p className="eyebrow">Cookies</p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            We use Google Analytics to see which pages people actually read. It is not needed for
            the site to work, so it stays off until you say yes. Nothing is loaded and no analytics
            cookie is set before you choose.{" "}
            <Link to="/privacy" className="text-foreground underline underline-offset-4">
              Privacy
            </Link>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="rounded-full border border-border px-5 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="btn-gradient px-5 py-2 text-sm"
          >
            Accept analytics
          </button>
        </div>
      </div>
    </div>
  );
}
