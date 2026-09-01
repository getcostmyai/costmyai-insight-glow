import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { BlogShareButton } from "@/components/marketing/BlogShareButton";
import { NewsletterBlock } from "@/components/marketing/NewsletterSignupForm";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { Reveal } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import {
  formatPublished,
  postsNewestFirst,
  type BlogPost,
  type Block,
  type InternalPath,
} from "@/lib/blog/posts";

/**
 * Article renderer in the homepage design language: mesh hero, the price-drift
 * band as recurring artwork, oversized display typography, hairline rails
 * instead of cards, and a single accent. The only card on the page is the one
 * contextual CTA banner.
 */

/** Reading progress: the one moving element inside the reading column. */
function ReadingProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const sync = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max <= 0 ? 0 : Math.min(100, Math.max(0, (window.scrollY / max) * 100)));
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px]" aria-hidden>
      <div
        className="h-full origin-left bg-gradient-to-r from-[rgb(var(--brand-indigo))] via-[rgb(var(--brand-violet))] to-[rgb(var(--brand-magenta))] transition-[width] duration-150 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CtaBanner({
  headline,
  label,
  to,
}: {
  headline: string;
  label: string;
  to: InternalPath;
}) {
  return (
    <Reveal className="my-16">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-primary/[0.05] p-7 sm:p-10">
        <div className="pointer-events-none absolute inset-0 mesh-brand opacity-40" aria-hidden />
        <div className="relative flex items-start gap-4">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{headline}</p>
            <Link to={to} className="btn-gradient mt-6 inline-flex px-5 py-2.5 text-sm">
              {label}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function BlockView({ block, first }: { block: Block; first: boolean }) {
  if (block.t === "h2") {
    return (
      <Reveal>
        <h2 className="mt-20 flex items-baseline gap-4 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.6rem]">
          <span className="h-px w-8 shrink-0 translate-y-[-0.4em] bg-primary/60" aria-hidden />
          {block.v}
        </h2>
      </Reveal>
    );
  }
  if (block.t === "p") {
    return (
      <Reveal>
        <p
          className={
            first
              ? "mt-8 text-xl leading-[1.6] text-foreground/90 sm:text-[1.4rem]"
              : "mt-7 text-[1.09rem] leading-[1.78] text-muted-foreground sm:text-[1.15rem]"
          }
        >
          {block.v}
        </p>
      </Reveal>
    );
  }
  if (block.t === "defs") {
    return (
      <Reveal>
        <ul className="mt-10 border-t border-border">
          {block.items.map((it) => (
            <li
              key={it.term}
              className="grid gap-2 border-b border-border py-7 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-8"
            >
              <span className="text-base font-semibold tracking-[-0.02em]">{it.term}</span>
              <span className="text-[1.06rem] leading-[1.72] text-muted-foreground">{it.text}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    );
  }
  return <CtaBanner headline={block.headline} label={block.label} to={block.to} />;
}

function KeepReading({ slug }: { slug: string }) {
  const others = postsNewestFirst()
    .filter((p) => p.slug !== slug)
    .slice(0, 3);
  if (others.length === 0) return null;

  return (
    <section className="relative overflow-hidden border-t border-border wash-brand">
      <div className="relative mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-24">
        <Reveal
          as="p"
          className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          Keep reading
        </Reveal>
        <ul className="mt-8 border-t border-border">
          {others.map((p, i) => (
            <li key={p.slug} className="border-b border-border">
              <Reveal delay={i * 60}>
                <Link
                  to="/blog/$slug"
                  params={{ slug: p.slug }}
                  className="group block py-7"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {formatPublished(p.published)} · {p.minutes} min read
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] transition-colors group-hover:text-primary sm:text-2xl">
                    {p.title}
                  </h3>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function BlogArticle({ post }: { post: BlogPost }) {
  const firstParagraph = post.blocks.findIndex((b) => b.t === "p");

  return (
    <article className="flex flex-col">
      <ReadingProgress />

      <header className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
          aria-hidden
        />
        <PriceDriftRibbon
          moves={180}
          orientation="diagonal"
          className="absolute inset-x-0 bottom-0 h-[35%] opacity-[0.10] [mask-image:linear-gradient(180deg,transparent,#000_80%)]"
        />
        <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />

        <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
          <Reveal>
            <Link
              to="/blog"
              className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
            >
              Blog
            </Link>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl">
              {post.title}
            </h1>
            <p className="mt-7 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {post.deck}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-border pt-6">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {formatPublished(post.published)} · {post.minutes} min read
              </p>
              <BlogShareButton slug={post.slug} title={post.title} />
            </div>
          </Reveal>
        </div>
      </header>

      <div className="px-5 pb-10 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {post.blocks.map((b, i) => (
            <BlockView key={i} block={b} first={i === firstParagraph} />
          ))}
        </div>
      </div>

      <NewsletterBlock source="article-end" />

      <KeepReading slug={post.slug} />

      <section className="relative overflow-hidden border-t border-border px-5 py-24 sm:px-8 sm:py-32">
        <div className="pointer-events-none absolute inset-0 mesh-brand mesh-drift opacity-70" aria-hidden />
        <div className="relative mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
              {post.closingLine ?? "Start with the free level."}
              <br />
              <span className="text-gradient-brand-wide">
                See the saving before you pay us anything.
              </span>
            </h2>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/auth" className="btn-gradient px-6 py-3 text-sm">
                Start free
              </Link>
              <a
                href={BOOK_DEMO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
              >
                Book a Demo
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </article>
  );
}
