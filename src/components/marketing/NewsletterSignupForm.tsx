import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { isValidEmail } from "@/lib/newsletter/newsletter";
import { markSubscribed } from "@/lib/newsletter/prompt";
import { subscribeToNewsletter, trackNewsletterShown } from "@/lib/newsletter.functions";
import { shouldFire } from "@/lib/telemetry/fire-once";

/**
 * The weekly-issue signup, in the site's own language: a hairline rail, one
 * field, one gradient action. No card, no box, no second colour.
 *
 * The success state is fixed on purpose. The server function answers the same
 * way for a brand-new address, a pending one and a long-confirmed one, so this
 * component must never render anything that would leak which of the three it
 * was. "Check your inbox" is the only outcome the UI knows about.
 */

/**
 * Fires `newsletter_signup_shown` the first time the form is actually in the
 * viewport — mounting is not seeing, and the footer form mounts on every page.
 * Same shape as the estimator's view telemetry, with the shared cross-remount
 * guard from fire-once so one visit cannot produce two rows.
 */
export function useTrackShown(source: string, ref: React.RefObject<HTMLElement | null>) {
  const track = useServerFn(trackNewsletterShown);
  const sent = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || sent.current) return;

    const fire = () => {
      if (sent.current) return;
      sent.current = true;
      if (!shouldFire(`newsletter_signup_shown:${source}`)) return;
      void track({ data: { source } }).catch(() => {});
    };

    if (typeof IntersectionObserver === "undefined") {
      fire();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          fire();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [source, track, ref]);
}

export function NewsletterSignupForm({
  source,
  className = "",
  compact = false,
  onSubscribed,
}: {
  source: string;
  className?: string;
  compact?: boolean;
  onSubscribed?: () => void;
}) {
  const subscribe = useServerFn(subscribeToNewsletter);
  const ref = useRef<HTMLDivElement | null>(null);
  useTrackShown(source, ref);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await subscribe({ data: { email, source } });
      // Suppresses the slide-in from here on, everywhere.
      markSubscribed();
      setDone(true);
      onSubscribed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={ref} className={className} data-newsletter-source={source}>
      {done ? (
        <p
          role="status"
          className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          Check your inbox. There is a confirmation link waiting, and the list only starts once you
          click it.
        </p>
      ) : (
        <form onSubmit={send} noValidate className="flex flex-col gap-2">
          <div className={`flex flex-col gap-2 ${compact ? "" : "sm:flex-row"}`}>
            <label htmlFor={`newsletter-${source}`} className="sr-only">
              Email address
            </label>
            <input
              id={`newsletter-${source}`}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              placeholder="you@company.com"
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              className="w-full flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
            />
            <button
              type="submit"
              disabled={submitting}
              className="btn-gradient inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Subscribe
            </button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
      )}
    </div>
  );
}

/** The full block used mid-page and at the end of articles. */
export function NewsletterBlock({
  source,
  className = "",
  headline = "The weekly AI spend brief.",
  deck = "One email a week: what model prices actually did, which switches cleared quality, and what it means for your bill. No pitch, unsubscribe in one click.",
}: {
  source: string;
  className?: string;
  headline?: string;
  deck?: string;
}) {
  return (
    <section className={`border-t border-border/60 px-5 py-20 sm:px-8 sm:py-24 ${className}`}>
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Newsletter</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          {headline.split(" ").slice(0, -1).join(" ")}{" "}
          <span className="text-gradient-brand">{headline.split(" ").slice(-1)}</span>
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">{deck}</p>
        <NewsletterSignupForm source={source} className="mt-7 max-w-md" />
      </div>
    </section>
  );
}
