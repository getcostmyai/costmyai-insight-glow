import type { ReactNode } from "react";

/**
 * The one place a card is allowed on a marketing page.
 *
 * The site rule is hairline rails, no cards — because a card around text is a
 * box pretending the text needs help. This is not that: it is a frame around
 * real product imagery, and the frame is the artwork. The brand mesh lives
 * inside it at full strength, the product surface floats above it, and no body
 * copy ever sits on the color.
 *
 * Deliberately not a grid. One panel per page, or it stops being a moment.
 */
export function GradientPanel({
  src,
  alt,
  caption,
  className = "",
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={className}>
      <div className="gradient-panel px-5 pb-0 pt-10 sm:px-14 sm:pt-16">
        {/* The drifting field sits on its own layer so the image above it stays
            perfectly sharp and unaffected by the transform. */}
        <div className="absolute inset-0 mesh-brand mesh-drift" aria-hidden />
        <div className="absolute inset-0 texture-dots opacity-25" aria-hidden />
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="relative mx-auto block w-full max-w-4xl rounded-t-xl border border-border/60 shadow-[0_40px_80px_-30px_rgba(23,15,60,0.45)]"
        />
      </div>
      {caption ? (
        <figcaption className="mt-4 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
