import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { CircleUserRound, LogIn, Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";

import { Wordmark } from "./Wordmark";

/**
 * The marketing chrome: light, spacious, Apple-adjacent — deliberately not the
 * dark dashboard language. Every page-level CTA inside this shell uses the
 * shared .btn-gradient utility, so the brand gradient has exactly one source.
 */

const NAV = [
  { to: "/", label: "How it works", hash: "how" },
  { to: "/models", label: "Models" },
  { to: "/intelligence", label: "Intelligence" },
  { to: "/partners", label: "Become a Partner" },
  { to: "/blog", label: "Blog" },
  { to: "/pricing", label: "Pricing" },
] as const;


function useSignedIn() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

export function MarketingNav() {
  const signedIn = useSignedIn();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 glass">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 sm:px-8">
        <div className="flex min-w-0 items-center gap-8">
          <Link to="/" className="shrink-0 text-[17px]">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                hash={"hash" in item ? item.hash : undefined}
                className="whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="hidden rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted sm:inline-flex"
          >
            Book a Demo
          </a>
          <Link to="/auth" className="btn-gradient px-4 py-2 text-sm">
            Start free
          </Link>
          <Link
            to={signedIn ? "/workspace" : "/auth"}
            aria-label={signedIn ? "Your workspace — signed in" : "Sign in or sign up"}
            title={signedIn ? "Your workspace" : "Sign in"}
            className={
              signedIn
                ? "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/40 transition-colors hover:bg-primary/25"
                : "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            {signedIn ? (
              <CircleUserRound className="h-[18px] w-[18px]" />
            ) : (
              <LogIn className="h-[18px] w-[18px]" />
            )}
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-border bg-card px-5 py-3 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              hash={"hash" in item ? item.hash : undefined}
              onClick={() => setOpen(false)}
              className="block py-2 text-sm font-medium text-muted-foreground"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setOpen(false)}
            className="block py-2 text-sm font-medium text-muted-foreground"
          >
            Book a Demo
          </a>
          <Link
            to={signedIn ? "/workspace" : "/auth"}
            onClick={() => setOpen(false)}
            className="block py-2 text-sm font-medium text-muted-foreground"
          >
            {signedIn ? "Your workspace" : "Sign in"}
          </Link>
        </nav>
      ) : null}
    </header>
  );
}


export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div className="max-w-xs">
            <Wordmark className="text-[17px]" />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Certified, quality-checked switches that cut AI spend without touching output
              quality. We never hold your provider keys.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-14 gap-y-8 sm:grid-cols-4">
            <FooterColumn title="Product">
              <FooterLink to="/" hash="estimator">
                Estimator
              </FooterLink>
              <FooterLink to="/models">Models</FooterLink>
              <FooterLink to="/intelligence">Intelligence</FooterLink>
              <FooterLink to="/pricing">Plans</FooterLink>
              <FooterLink to="/" hash="architecture">
                API
              </FooterLink>
            </FooterColumn>
            <FooterColumn title="Resources">
              <FooterLink to="/" hash="faq">
                FAQ
              </FooterLink>
              <FooterLink to="/legal/methodology">Methodology</FooterLink>
              <FooterLink to="/models">Data Sources</FooterLink>
              <FooterLink to="/partners">Become a Partner</FooterLink>
              <FooterExternal href={BOOK_DEMO_URL}>Book a Demo</FooterExternal>
            </FooterColumn>

            <FooterColumn title="Company">
              <FooterLink to="/about">About</FooterLink>
              <FooterLink to="/contact">Contact</FooterLink>
              <FooterLink to="/press">Press</FooterLink>
            </FooterColumn>
            <FooterColumn title="Legal">
              <FooterLink to="/privacy">Privacy</FooterLink>
              <FooterLink to="/terms">Terms</FooterLink>
              <FooterLink to="/disclaimer">Disclaimer</FooterLink>
            </FooterColumn>

          </div>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          <span className="num">©</span> CostMyAI. Prices and benchmarks are sourced from public
          provider and evaluation feeds; every recommendation states the measurement it rests on.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function FooterLink({
  to,
  hash,
  children,
}: {
  to: string;
  hash?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      hash={hash}
      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function FooterExternal({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
