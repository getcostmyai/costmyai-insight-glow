import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";

/** Shared observer options — a section counts as "arrived" once a third of it is up. */
const OBSERVER_OPTIONS: IntersectionObserverInit = {
  threshold: 0.25,
  rootMargin: "0px 0px -10% 0px",
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Fires once, when the element first scrolls into view. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, OBSERVER_OPTIONS);
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, inView };
}

/**
 * Fade-and-rise on entry. Content is fully present in the SSR markup and for
 * reduced-motion users; only the transform/opacity is deferred.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`motion-safe:transition-all motion-safe:duration-[900ms] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] ${
        inView ? "opacity-100 translate-y-0" : "motion-safe:opacity-0 motion-safe:translate-y-6"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * Counts a number up when it scrolls into view. The final value is what renders
 * on the server and before hydration, so the page is never wrong — the count is
 * decoration layered on top of an already-correct readout.
 */
export function CountUp({
  value,
  format,
  duration = 1400,
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(value);
  // Where this run starts from. Zero on first arrival, the value currently on
  // screen when a refreshed stat comes in — a live number that jumped back to
  // zero to re-count would read as a reset rather than a change.
  const from = useRef(0);
  const settled = useRef(false);
  const fmt = useMemo(
    () => format ?? ((n: number) => Math.round(n).toLocaleString("en-GB")),
    [format],
  );

  useEffect(() => {
    if (!inView || prefersReducedMotion()) {
      from.current = value;
      settled.current = true;
      setShown(value);
      return;
    }
    const origin = settled.current ? from.current : 0;
    settled.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // easeOutExpo — fast arrival, long settle.
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const next = origin + (value - origin) * eased;
      from.current = next;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={`num tabular-nums ${className}`}>
      {fmt(shown)}
    </span>
  );
}
