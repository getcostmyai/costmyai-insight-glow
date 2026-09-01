import { useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { NewsletterSignupForm } from "@/components/marketing/NewsletterSignupForm";
import {
  isPromptEligiblePath,
  markPromptDismissed,
  readPromptState,
  shouldShowPrompt,
} from "@/lib/newsletter/prompt";

/**
 * The once-ever slide-in.
 *
 * A small bottom-right card, never a full-screen interruption. Desktop shows it
 * on exit intent (pointer leaving through the top of the window), touch shows it
 * past 70% of the page, since there is no exit intent to read there.
 *
 * Eligibility is decided on every navigation, and dismissal or a subscription
 * anywhere on the site retires it permanently — see prompt.ts for the rules.
 */
export function NewsletterPrompt() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  // Arm only after mount: the stored state is browser-only, and rendering it
  // during SSR would both mismatch and flash.
  useEffect(() => {
    if (open) return;
    setArmed(shouldShowPrompt(pathname, readPromptState()));
  }, [pathname, open]);

  useEffect(() => {
    if (!armed || open) return;

    const show = () => {
      // Re-check: a footer signup may have happened since we armed.
      if (!shouldShowPrompt(pathname, readPromptState())) return;
      setOpen(true);
      window.setTimeout(() => setVisible(true), 40);
    };

    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) show();
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      if (window.scrollY / max >= 0.7) show();
    };

    const touch =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

    if (touch) {
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
    document.addEventListener("mouseout", onLeave);
    // A desktop reader who never leaves the window but reaches the end has
    // shown the same intent the scroll rule reads on mobile.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mouseout", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, [armed, open, pathname]);

  if (!open || !isPromptEligiblePath(pathname)) return null;

  function close() {
    setVisible(false);
    markPromptDismissed();
    window.setTimeout(() => {
      setOpen(false);
      setArmed(false);
    }, 250);
  }

  return (
    <div
      role="dialog"
      aria-label="Subscribe to the weekly AI spend brief"
      data-testid="newsletter-prompt"
      className={`fixed bottom-4 right-4 z-[55] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border/70 glass p-5 shadow-lg transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <p className="eyebrow">Weekly brief</p>
      <p className="mt-2 pr-6 text-base font-semibold leading-snug tracking-[-0.02em]">
        What AI prices did this week, in one email.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Price moves, quality-cleared switches, no pitch. One click to leave.
      </p>
      <NewsletterSignupForm source="slide-in" compact className="mt-4" />
    </div>
  );
}
