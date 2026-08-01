import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";

import { Reveal } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import {
  formatPublished,
  type BlogPost,
  type Block,
  type InternalPath,
} from "@/lib/blog/posts";

/**
 * Article renderer in the Intelligence page design language: oversized display
 * typography, generous vertical rhythm, hairline rails instead of cards, and a
 * single accent. The only card on the page is the one contextual CTA banner.
 */

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
    <Reveal className="my-14">
      <div className="rounded-3xl bg-primary/[0.06] p-7 sm:p-9">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-semibold tracking-tight sm:text-2xl">{headline}</p>
            <Link
              to={to}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {label}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.t === "h2") {
    return (
      <Reveal>
        <h2 className="mt-16 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{block.v}</h2>
      </Reveal>
    );
  }
  if (block.t === "p") {
    return (
      <Reveal>
        <p className="mt-6 text-[1.0625rem] leading-[1.75] text-muted-foreground sm:text-lg">
          {block.v}
        </p>
      </Reveal>
    );
  }
  if (block.t === "defs") {
    return (
      <Reveal>
        <ul className="mt-9 divide-y divide-border/60 border-t border-border/60">
          {block.items.map((it) => (
            <li
              key={it.term}
              className="grid gap-2 py-6 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-8"
            >
              <span className="text-base font-semibold tracking-tight">{it.term}</span>
              <span className="text-[1.0625rem] leading-[1.7] text-muted-foreground">
                {it.text}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    );
  }
  return <CtaBanner headline={block.headline} label={block.label} to={block.to} />;
}

export function BlogArticle({ post }: { post: BlogPost }) {
  return (
    <article className="flex flex-col">
      <header className="wash-hero px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <p className="eyebrow">Blog</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl">
              {post.title}
            </h1>
            <p className="mt-7 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {post.deck}
            </p>
            <p className="mt-8 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {formatPublished(post.published)} · {post.minutes} min read
            </p>
          </Reveal>
        </div>
      </header>

      <div className="px-5 pb-8 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {post.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      </div>

      <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
              {post.closingLine ?? "Start with the free level."}
              <br />
              <span className="text-gradient-brand">See the saving before you pay us anything.</span>
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
