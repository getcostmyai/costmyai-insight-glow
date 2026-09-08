import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Link2Off, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { unsubscribeFromNewsletter } from "@/lib/newsletter.functions";

/**
 * Leaving must be one click and must never fail loudly.
 *
 * The server function is idempotent: an already-unsubscribed token settles as
 * "unsubscribed" too, so the only other outcome is a token that never meant
 * anything.
 */
export const Route = createFileRoute("/newsletter/unsubscribe")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Unsubscribe from the CostMyAI newsletter" },
      {
        name: "description",
        content:
          "Remove your address from the weekly CostMyAI briefing. One click, no questions, effective immediately.",
      },
      { property: "og:title", content: "Unsubscribe from the CostMyAI newsletter" },
      {
        property: "og:description",
        content: "One click removes your address from the weekly CostMyAI briefing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <UnsubscribePage token={Route.useSearch().token} />,
});

export function UnsubscribePage({ token }: { token: string }) {
  const unsubscribe = useServerFn(unsubscribeFromNewsletter);
  const [status, setStatus] = useState<"working" | "unsubscribed" | "invalid">("working");

  useEffect(() => {
    let alive = true;
    void unsubscribe({ data: { token } })
      .then((r) => {
        if (alive) setStatus(r.status === "unsubscribed" ? "unsubscribed" : "invalid");
      })
      .catch(() => {
        if (alive) setStatus("invalid");
      });
    return () => {
      alive = false;
    };
  }, [unsubscribe, token]);

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
              Removing your address.
            </p>
          ) : status === "unsubscribed" ? (
            <>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary">
                <CheckCircle2 className="h-7 w-7 text-primary" />
              </div>
              <p className="mt-8 eyebrow">Unsubscribed</p>
              <h1 className="mt-5 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3rem]">
                You are <span className="text-gradient-brand">off the list</span>.
              </h1>
              <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                No further issues will be sent to this address. The numbers stay public either way:
                the intelligence pages carry the same price moves the newsletter reports.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link to="/intelligence" className="btn-gradient px-6 py-3 text-[15px]">
                  Read the intelligence pages
                </Link>
                <Link to="/" className="btn-quiet px-6 py-3 text-[15px]">
                  Back to CostMyAI
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
                We could not match this link to an address. If you already unsubscribed, nothing
                else is needed. Otherwise write to mail@costmyai.com and the address comes off by
                hand.
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
