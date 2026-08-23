import type { ReactNode } from "react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Shared chrome for the legal surface. Same Intelligence-page language as the
 * rest of the site: oversized display heading, hairline rails, no cards.
 */
export function LegalPage({
  eyebrow,
  title,
  accent,
  intro,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  intro: ReactNode;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <MarketingShell>
      <div className="flex flex-col">
        <section className="relative overflow-hidden border-b border-border">
          <div
            className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
            aria-hidden
          />
          <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
            <Reveal className="max-w-4xl">
              <p className="eyebrow">{eyebrow}</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
                {title} {accent ? <span className="text-gradient-brand-wide">{accent}</span> : null}
              </h1>

              <p className="mt-7 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                {intro}
              </p>
              {updated ? (
                <p className="mt-6 text-sm text-muted-foreground">Last updated: {updated}</p>
              ) : null}
            </Reveal>
          </div>
        </section>

        <section className="px-5 pb-28 sm:px-8 sm:pb-36">
          <div className="mx-auto max-w-6xl">
            <ul className="divide-y divide-border/60 border-t border-border/60">{children}</ul>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li>
      <Reveal>
        <div className="grid gap-5 py-12 sm:grid-cols-[minmax(0,1fr)_minmax(0,38rem)] sm:gap-14">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h2>
          <div className="space-y-4 self-center text-[1.0625rem] leading-[1.75] text-muted-foreground">
            {children}
          </div>
        </div>
      </Reveal>
    </li>
  );
}

export function MailLink() {
  return (
    <a
      href="mailto:mail@costmyai.com"
      className="font-semibold text-foreground transition-colors hover:text-primary"
    >
      mail@costmyai.com
    </a>
  );
}
