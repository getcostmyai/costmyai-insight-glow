import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Link2Off, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { confirmNewsletterSubscription } from "@/lib/newsletter.functions";

/**
 * Where the double opt-in link lands.
 *
 * Token-only, no session. The server function answers with a settled status
 * rather than throwing, so this page has exactly two honest outcomes: the
 * address is now on the list, or the link is spent. Nothing here reveals
 * whether the address ever existed.
 */
export const Route = createFileRoute("/newsletter/confirm")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Confirm your CostMyAI newsletter subscription" },
      {
        name: "description",
        content:
          "Finish subscribing to the weekly CostMyAI briefing on what AI actually costs: price moves, spreads and quality-per-dollar, measured over the last 7 days.",
      },
      { property: "og:title", content: "Confirm your CostMyAI newsletter subscription" },
      {
        property: "og:description",
        content: "One click confirms the weekly CostMyAI briefing on real AI spend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ConfirmPage token={Route.useSearch().token} />,
});

export function ConfirmPage({ token }: { token: string }) {
  const confirm = useServerFn(confirmNewsletterSubscription);
  const [status, setStatus] = useState<"working" | "confirmed" | "invalid">("working");

  useEffect(() => {
    let alive = true;
    void confirm({ data: { token } })
      .then((r) => {
        if (alive) setStatus(r.status === "confirmed" ? "confirmed" : "invalid");
      })
      .catch(() => {
        if (alive) setStatus("invalid");
      });
    return () => {
      alive = false;
    };
  }, [confirm, token]);

  return (
    <MarketingShell>
      <section className="px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-xl text-center">
          {status === "working" ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Confirming your subscription.
            </p>
          ) : status === "confirmed" ? (
            <>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary">
                <CheckCircle2 className="h-7 w-7 text-primary" />
              </div>
              <p className="mt-8 eyebrow">Subscription confirmed</p>
              <h1 className="mt-5 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3rem]">
                You are on the <span className="text-gradient-brand">list</span>.
              </h1>
              <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                One issue every Monday: what model prices actually did over the last 7 days, which
                switches cleared quality, and what that does to a real AI bill. Every issue carries
                a one-click unsubscribe.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link to="/intelligence" className="btn-gradient px-6 py-3 text-[15px]">
                  Read the latest intelligence
                </Link>
                <Link to="/" className="btn-quiet px-6 py-3 text-[15px]">
                  What CostMyAI does
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary">
                <Link2Off className="h-7 w-7 text-muted-foreground" />
              </div>
              <h1 className="mt-8 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3rem]">
                This link has expired or was already used.
              </h1>
              <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                Confirmation links work once. If you already clicked it, you are subscribed and
                nothing more is needed. If not, enter your address again and a fresh link is on its
                way.
              </p>
              <Link to="/" className="btn-quiet mt-10 inline-flex px-6 py-3 text-[15px]">
                Back to CostMyAI
              </Link>
            </>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
