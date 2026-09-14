import * as React from "react";
import { createPortal } from "react-dom";

/**
 * A hover panel that is always on top, everywhere.
 *
 * The dashboard used to draw these as an absolutely positioned child of the
 * trigger. That only works while no ancestor makes its own stacking context,
 * and card surfaces, gradients, transforms and sticky headers all do, so the
 * panel kept sliding under the next card's badge row.
 *
 * This renders into document.body instead, positioned from the trigger's live
 * bounding rect, which survives scrollable and transformed ancestors because
 * getBoundingClientRect already reports post-transform viewport coordinates
 * and the panel itself is fixed to the viewport. Position is recomputed on
 * scroll and resize while open.
 */
export function HoverPopover({
  trigger,
  children,
  width = 320,
  className = "",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Panel width in px; also used to keep it inside the viewport. */
  width?: number;
  className?: string;
}) {
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const place = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, r.left), window.innerWidth - width - margin);
    setPos({ top: r.bottom + margin, left });
  }, [width]);

  React.useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, place]);

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {trigger}
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              style={{ top: pos.top, left: pos.left, width }}
              className={`pointer-events-none fixed z-[9999] rounded-xl border border-border bg-background p-3 text-left shadow-[var(--shadow-float)] ${className}`}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
