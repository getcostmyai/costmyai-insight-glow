/**
 * The honest empty state.
 *
 * Shown when a page's live read could not complete. It is deliberately plain:
 * no number, no estimate, no remembered figure presented as current. The rule
 * this component exists to keep is the same one the product sells on. If we
 * cannot measure it right now, we say so and show nothing, rather than drawing
 * a zero that reads like a finding.
 */
export function FiguresUnavailable({
  what = "The live figures",
  className = "",
}: {
  /** What is missing, in plain words, e.g. "The model catalog". */
  what?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      data-degraded="true"
      className={`mx-auto max-w-6xl px-5 py-12 sm:px-8 ${className}`}
    >
      <div className="border-l-2 border-primary/50 pl-5">
        <p className="eyebrow">Temporarily unavailable</p>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {what} cannot be read right now, so this page is showing none. We would rather show you
          nothing than a number we cannot stand behind. The figures return on their own as soon as
          the feed answers again.
        </p>
      </div>
    </div>
  );
}
