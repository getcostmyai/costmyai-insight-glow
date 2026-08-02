import { useEffect, useRef, useState } from "react";

import { CountUp, Reveal } from "@/components/marketing/Reveal";

/**
 * A read-only visual of how a month-end forecast is built.
 *
 * Reading order is deliberate: the answer (the month-end range) lands first,
 * then the evidence behind it appears in sequence — the known month-to-date
 * curve, the trailing projected run, and finally the "Today" split that
 * separates the two. No weights or coefficients are exposed, only the shape
 * of the mechanism.
 */

const DAYS = 30;
const TODAY = 18;

// Synthetic daily spend curve: low start, mid-month bump, trailing pattern.
const ACTUAL_DAILY = [
  120, 115, 132, 128, 145, 138, 110, 122, 130, 155, 148, 162, 170, 158, 149, 165, 172, 180,
];
const PROJECTED_DAILY = [168, 175, 162, 158, 170, 165, 172, 168, 175, 180, 185, 178];

const ACTUAL_CUMULATIVE = ACTUAL_DAILY.reduce<number[]>(
  (acc, v) => [...acc, (acc.at(-1) ?? 0) + v],
  [],
);
const LAST_KNOWN_CUMULATIVE = ACTUAL_CUMULATIVE.at(-1) ?? 0;

// Projected cumulative starts from the last known point and walks through remaining days.
const PROJECTED_CUMULATIVE = [
  LAST_KNOWN_CUMULATIVE,
  ...PROJECTED_DAILY.reduce<number[]>(
    (acc, v) => [...acc, (acc.at(-1) ?? LAST_KNOWN_CUMULATIVE) + v],
    [],
  ),
];

const FORECAST_POINT = PROJECTED_CUMULATIVE.at(-1) ?? 0;
const FORECAST_RANGE = [FORECAST_POINT * 0.955, FORECAST_POINT * 1.045];

const MAX_SPEND = FORECAST_RANGE[1] * 1.12;

const usd = (n: number) =>
  `$${Math.round(n).toLocaleString("en-GB")}`;

/** Staged choreography: range → known → projected → split. */
const STAGE_DELAYS = [120, 700, 1200, 1650];

function useStages(active: boolean) {
  const [stage, setStage] = useState(-1);
  useEffect(() => {
    if (!active) return;
    const timers = STAGE_DELAYS.map((d, i) => setTimeout(() => setStage((s) => Math.max(s, i)), d));
    return () => timers.forEach(clearTimeout);
  }, [active]);
  return stage;
}

/** True below the `sm` breakpoint. Defaults to false so SSR renders the wide chart. */
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}



export function ForecastDiagram() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const stage = useStages(active);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          io.disconnect();
        }
      },
      { threshold: 0.3, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const at = (i: number) => stage >= i;

  // On narrow screens the SVG is scaled down hard, so a wide/short viewBox makes
  // every label unreadable. Use a taller box with tighter padding there, which
  // scales the same type up relative to the available width.
  const narrow = useNarrow();
  const padX = narrow ? 38 : 64;
  const padY = narrow ? 44 : 48;
  const width = 900;
  const height = narrow ? 480 : 340;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;


  const xForDay = (d: number) => padX + (d / (DAYS - 1)) * plotW;
  const yForSpend = (s: number) => padY + plotH - (s / MAX_SPEND) * plotH;

  const actualPath = ACTUAL_CUMULATIVE.map(
    (v, i) => `${i === 0 ? "M" : "L"} ${xForDay(i)} ${yForSpend(v)}`,
  ).join(" ");
  const projectedPath = PROJECTED_CUMULATIVE.map(
    (v, i) => `${i === 0 ? "M" : "L"} ${xForDay(TODAY - 1 + i)} ${yForSpend(v)}`,
  ).join(" ");

  const areaActual = `
    M ${xForDay(0)} ${yForSpend(0)}
    ${ACTUAL_CUMULATIVE.map((v, i) => `L ${xForDay(i)} ${yForSpend(v)}`).join(" ")}
    L ${xForDay(TODAY - 1)} ${yForSpend(0)}
    Z
  `;

  const areaProjected = `
    M ${xForDay(TODAY - 1)} ${yForSpend(LAST_KNOWN_CUMULATIVE)}
    ${PROJECTED_CUMULATIVE.map((v, i) => `L ${xForDay(TODAY - 1 + i)} ${yForSpend(v)}`).join(" ")}
    L ${xForDay(DAYS - 1)} ${yForSpend(0)}
    L ${xForDay(TODAY - 1)} ${yForSpend(0)}
    Z
  `;

  const rangeTop = yForSpend(FORECAST_RANGE[1]);
  const rangeBottom = yForSpend(FORECAST_RANGE[0]);
  const rangeCenter = yForSpend(FORECAST_POINT);
  const bandHalf = narrow ? 56 : 40;
  const bandX = xForDay(DAYS - 1) - bandHalf;
  const tickDays = narrow ? [0, 14, 29] : [0, 7, 14, 21, 29];
  const labelSize = narrow ? { axis: 18, tag: 20 } : { axis: 10, tag: 12 };

  return (
    <div ref={hostRef} className="mx-auto max-w-5xl">
      {/* Answer first: the month-end range, in display type. */}
      <Reveal>
        <div className="text-center">
          <p className="num text-[10px] font-medium uppercase tracking-[0.2em] text-primary sm:text-[11px] sm:tracking-[0.22em]">
            Month-end forecast
          </p>
          <p className="num mt-4 text-[clamp(3.25rem,15vw,5.5rem)] font-semibold leading-[0.9] tracking-[-0.045em] text-saving sm:mt-5">
            <CountUp value={FORECAST_POINT} format={usd} />
          </p>
          <p className="num mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] font-medium tracking-[0.04em] text-muted-foreground sm:text-sm">
            <span>
              range {usd(FORECAST_RANGE[0])} – {usd(FORECAST_RANGE[1])}
            </span>
            <span aria-hidden className="hidden sm:inline">
              ·
            </span>
            <span>
              day {TODAY} of {DAYS}
            </span>
          </p>
          <h3 className="mx-auto mt-7 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:mt-8 sm:text-xl">
            Landed before the invoice does. Here is everything that number is built from.
          </h3>
        </div>
      </Reveal>


      <Reveal delay={120} className="mt-14">
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full select-none overflow-visible"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="knownGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.30" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="projectedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary-glow)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
              </linearGradient>
              <pattern
                id="projectedHatch"
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="10" stroke="var(--primary)" strokeOpacity="0.09" strokeWidth="1" />
              </pattern>
            </defs>

            {/* Baseline + minimal y ticks (hairline only, no boxed frame) */}
            {[0, 2000, 4000, 6000].map((v) => (
              <g key={v}>
                <line
                  x1={padX}
                  y1={yForSpend(v)}
                  x2={padX + plotW}
                  y2={yForSpend(v)}
                  stroke="var(--border)"
                  strokeOpacity={v === 0 ? 1 : 0.45}
                />
                <text
                  x={padX - 10}
                  y={yForSpend(v) - 6}
                  textAnchor="start"
                  className="num font-medium tracking-[0.08em]"
                  style={{ fill: "var(--muted-foreground)", fontSize: labelSize.axis }}
                >
                  ${(v / 1000).toFixed(0)}k
                </text>
              </g>
            ))}

            {tickDays.map((d) => (
              <text
                key={d}
                x={xForDay(d)}
                y={padY + plotH + labelSize.axis + 14}
                textAnchor={d === 0 ? "start" : d === 29 ? "end" : "middle"}
                className="num font-medium uppercase tracking-[0.16em]"
                style={{ fill: "var(--muted-foreground)", fontSize: labelSize.axis }}
              >
                Day {d + 1}
              </text>
            ))}


            {/* STAGE 0 — the forecast range lands first. */}
            <g
              style={{
                opacity: at(0) ? 1 : 0,
                transition: "opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <rect
                x={bandX}
                y={rangeTop}
                width={bandHalf * 2}
                height={Math.max(18, rangeBottom - rangeTop)}
                rx="10"
                fill="var(--saving-soft)"
                stroke="var(--saving)"
                strokeWidth="1.5"
                style={{
                  transform: `scaleY(${at(0) ? 1 : 0.2})`,
                  transformOrigin: `${xForDay(DAYS - 1)}px ${rangeCenter}px`,
                  transition: "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
              <circle
                cx={xForDay(DAYS - 1)}
                cy={rangeCenter}
                r={narrow ? 8 : 6}
                fill="var(--saving)"
                stroke="var(--background)"
                strokeWidth="2.5"
              />
              <text
                x={narrow ? xForDay(DAYS - 1) : bandX - 14}
                y={narrow ? rangeTop - 16 : rangeCenter + 4}
                textAnchor="end"
                className="num font-semibold uppercase tracking-[0.14em]"
                style={{ fill: "var(--saving)", fontSize: labelSize.tag }}
              >
                Forecast
              </text>

            </g>

            {/* STAGE 1 — known month-to-date. */}
            <path
              d={areaActual}
              fill="url(#knownGradient)"
              style={{ opacity: at(1) ? 1 : 0, transition: "opacity 0.9s 0.05s" }}
            />
            <path
              d={actualPath}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 1400,
                strokeDashoffset: at(1) ? 0 : 1400,
                transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />

            {/* STAGE 2 — trailing projected run. */}
            <g style={{ opacity: at(2) ? 1 : 0, transition: "opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1)" }}>
              <path d={areaProjected} fill="url(#projectedGradient)" />
              <rect
                x={xForDay(TODAY - 1)}
                y={padY}
                width={xForDay(DAYS - 1) - xForDay(TODAY - 1)}
                height={plotH}
                fill="url(#projectedHatch)"
              />
              <path
                d={projectedPath}
                fill="none"
                stroke="var(--primary-glow)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 5"
              />
            </g>

            {/* STAGE 3 — the Today split. */}
            <g style={{ opacity: at(3) ? 1 : 0, transition: "opacity 0.7s" }}>
              <line
                x1={xForDay(TODAY - 1)}
                y1={padY - 18}
                x2={xForDay(TODAY - 1)}
                y2={padY + plotH}
                stroke="var(--foreground)"
                strokeOpacity="0.5"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={xForDay(TODAY - 1)}
                y={padY - 24}
                textAnchor="middle"
                className="num font-semibold uppercase tracking-[0.16em]"
                style={{ fill: "var(--foreground)", fontSize: labelSize.tag }}
              >
                Today
              </text>

            </g>
          </svg>
        </div>
      </Reveal>

      <Reveal delay={220} className="mx-auto mt-14 max-w-4xl">
        <div className="grid gap-10 border-t border-border pt-10 sm:grid-cols-3">
          {[
            {
              step: "01",
              label: "Known",
              value: "Month-to-date",
              body: "Every day already billed is a fixed measurement. It never moves.",
              marker: "solid",
            },
            {
              step: "02",
              label: "Projected",
              value: "Remaining days",
              body: "Trailing usage shape is carried forward, damped so one spike cannot run away.",
              marker: "dashed",
            },
            {
              step: "03",
              label: "Forecast",
              value: "Month-end",
              body: "A single number when the data supports it. A range when that would be dishonest.",
              marker: "range",
            },
          ].map((item) => (
            <div key={item.label}>
              <div className="flex items-center gap-3">
                <span className="num text-[11px] font-medium tracking-[0.18em] text-muted-foreground/60">
                  {item.step}
                </span>
                {item.marker === "solid" && <span className="h-[3px] w-8 rounded-full bg-primary" />}
                {item.marker === "dashed" && (
                  <span className="h-0 w-8 border-t-2 border-dashed border-primary-glow" />
                )}
                {item.marker === "range" && (
                  <span className="h-3 w-6 rounded-sm bg-saving/30 ring-1 ring-saving" />
                )}
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">{item.value}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
