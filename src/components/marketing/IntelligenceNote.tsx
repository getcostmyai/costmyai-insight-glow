import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";

import { Reveal } from "@/components/marketing/Reveal";
import { NoteShareButton } from "@/components/marketing/NoteShareButton";
import { DecompositionBar } from "@/components/marketing/IntelligenceCharts";
import {
  LABELS,
  formatNoteDate,
  type Exhibit,
  type Note,
  type NoteBlock,
  type NotePath,
} from "@/lib/intelligence/notes";

/**
 * The note renderer.
 *
 * Two rules are enforced here rather than left to the author. A note's
 * provenance chip is drawn from the same field the corpus test reads, so there
 * is no code path that renders a body without one; and an exhibit always
 * renders its caption, so an artifact can never appear without saying where it
 * came from.
 */

export function LabelChip({ label }: { label: Note["label"] }) {
  const meta = LABELS[label];
  const tone =
    label === "proven-mechanism"
      ? "border-primary/40 text-primary"
      : label === "correlated"
        ? "border-border text-muted-foreground"
        : "border-border text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] ${tone}`}
    >
      {meta.short}
    </span>
  );
}

function ExhibitView({ ex }: { ex: Exhibit }) {
  return (
    <Reveal>
      <figure className="mt-12 border-t border-border/60 pt-6">
        <figcaption className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-primary">
            {ex.ref}
          </span>
          <span className="text-base font-semibold tracking-tight">{ex.title}</span>
        </figcaption>
        <pre className="mt-5 overflow-x-auto border-l-2 border-primary/40 pl-5 font-mono text-[0.8rem] leading-[1.85] text-foreground/90">
          {ex.lines.join("\n")}
        </pre>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          {ex.caption}
          {ex.sourcePath ? (
            <>
              {" "}
              Verifiable in the repository at <span className="font-mono">{ex.sourcePath}</span>.
            </>
          ) : null}
        </p>
      </figure>
    </Reveal>
  );
}

function CtaBanner({ headline, label, to }: { headline: string; label: string; to: NotePath }) {
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

function BlockView({ block }: { block: NoteBlock }) {
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
  if (block.t === "quote") {
    return (
      <Reveal>
        <blockquote className="mt-10 border-l-2 border-border pl-6">
          <p className="text-xl leading-[1.6] tracking-[-0.01em] sm:text-2xl">{block.v}</p>
          <cite className="mt-4 block text-xs not-italic uppercase tracking-[0.14em] text-muted-foreground">
            {block.attribution}
          </cite>
        </blockquote>
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
  if (block.t === "exhibit") return <ExhibitView ex={block.v} />;
  if (block.t === "decomposition") {
    return (
      <Reveal>
        <div className="mt-14">
          <DecompositionBar d={block.v} />
        </div>
      </Reveal>
    );
  }
  return <CtaBanner headline={block.headline} label={block.label} to={block.to} />;
}

export function IntelligenceNoteView({ note }: { note: Note }) {
  const meta = LABELS[note.label];
  return (
    <article className="flex flex-col">
      <header className="wash-hero px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <p className="eyebrow">Intelligence note</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl">
              {note.title}
            </h1>
            <p className="mt-7 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {note.deck}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <LabelChip label={note.label} />
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {formatNoteDate(note.published)} · {note.minutes} min read
              </span>
              {/* Sits on the byline rail, same place a reader looks for the date. */}
              <NoteShareButton slug={note.slug} title={note.title} />
            </div>
            <p className="mt-5 max-w-2xl border-t border-border/60 pt-5 text-sm leading-relaxed text-muted-foreground">
              {meta.statement}
              {note.source ? ` Source: ${note.source}.` : ""}
            </p>
            {note.month ? (
              <Link
                to="/intelligence/$month"
                params={{ month: note.month }}
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                Figures this note reads: the frozen {note.month} report
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
          </Reveal>
        </div>
      </header>

      <div className="px-5 pb-8 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {note.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      </div>

      <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
              The figures behind this note are
              <br />
              <span className="text-gradient-brand">public, and frozen monthly.</span>
            </h2>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/intelligence" className="btn-gradient px-6 py-3 text-sm">
                Open Intelligence
              </Link>
              <Link
                to="/legal/methodology"
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
              >
                How every figure is computed
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </article>
  );
}
