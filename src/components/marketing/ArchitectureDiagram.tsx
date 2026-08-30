import { Boxes, Cloud, Server, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/marketing/Reveal";

/**
 * The real request path, drawn honestly — as a single line, not a row of cards.
 *
 * Each leg is still separate and numbered: the outbound request, the provider's
 * response back through the engine, and — on its own dashed path — the
 * aggregate metadata that leaves for CostMyAI. Merging those into one arrow
 * would misrepresent what the middleware actually does.
 */
const NODES = [
  { icon: Boxes, title: "Your App", body: "Makes API requests" },
  {
    icon: Server,
    title: "Verification Engine",
    body: "Middleware in your environment",
    highlight: true,
  },
  { icon: Cloud, title: "AI Provider", body: "OpenAI, Anthropic, Gemini, others" },
];

export function ArchitectureDiagram() {
  return (
    <div className="relative">
      {/* The wire every node sits on. The gradient is wider than the wire and
          slides along it, so the line reads as metadata in motion rather than
          as a static rule. Off under reduced motion. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[16.6%] right-[16.6%] top-9 hidden h-px overflow-hidden lg:block"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        }}
      >
        <div className="wire-flow h-px w-[300%]" />
      </div>


      <div className="relative grid gap-12 lg:grid-cols-3 lg:gap-6">
        {NODES.map((n, i) => (
          <Reveal key={n.title} delay={i * 110} className="text-center">
            <div className="flex justify-center">
              <span
                className={`grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full ${
                  n.highlight
                    ? "fill-gradient-brand text-primary-foreground shadow-[var(--shadow-glow)]"
                    : "bg-secondary text-primary ring-1 ring-border"
                }`}
              >
                <n.icon className="h-7 w-7" />
              </span>
            </div>
            <p className="num mt-6 text-[11px] tracking-[0.18em] text-primary">
              {`0${i + 1}`}
              <span className="ml-2 font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {i === 0 ? "request" : i === 1 ? "forwarded unchanged" : "provider"}
              </span>
            </p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">{n.title}</p>
            <p className="mx-auto mt-1.5 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
              {n.body}
            </p>
          </Reveal>
        ))}
      </div>

      {/* Return leg, stated separately — the response really does come back. */}
      <Reveal
        delay={340}
        className="mx-auto mt-16 max-w-3xl border-t border-border pt-8 text-center"
      >
        <p className="num text-[11px] tracking-[0.18em] text-muted-foreground">03 · RESPONSE</p>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Travels the same path in reverse — provider → engine → your app. The engine counts tokens;{" "}
          <span className="font-medium text-foreground">it does not read the body.</span>
        </p>
      </Reveal>

      {/* The one leg that leaves your environment. */}
      <Reveal delay={420} className="mx-auto mt-12 max-w-3xl text-center">
        <span className="grid h-12 w-12 place-items-center justify-self-center rounded-full fill-gradient-brand text-primary-foreground mx-auto">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <p className="num mt-5 text-[11px] tracking-[0.18em] text-primary">04 · METADATA ONLY</p>
        <p className="mt-3 text-2xl font-semibold leading-snug tracking-[-0.03em] sm:text-[1.75rem]">
          The only leg that leaves your environment carries nothing we could reconstruct a prompt
          from.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Aggregate rows. Token counts, model names, hosts. No prompt content by default.
        </p>
      </Reveal>
    </div>
  );
}
