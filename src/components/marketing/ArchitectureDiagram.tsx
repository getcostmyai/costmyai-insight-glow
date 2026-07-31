import { Boxes, Cloud, Server, ShieldCheck } from "lucide-react";

/**
 * The real request path, drawn honestly.
 *
 * Each leg is separate and numbered: the outbound request, the provider's
 * response back through the engine, and — on its own dashed path — the
 * aggregate metadata that leaves for CostMyAI. Merging those into one arrow
 * would misrepresent what the middleware actually does.
 */
export function ArchitectureDiagram() {
  return (
    <div className="card-surface p-6 sm:p-9">
      <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1.15fr_auto_1fr]">
        <Node
          icon={Boxes}
          title="Your App"
          body="Makes API requests"
          step="01"
        />

        <Leg label="request" number="01" />

        <Node
          icon={Server}
          title="Verification Engine"
          body="Middleware in your environment"
          highlight
          step="02"
        />

        <Leg label="forwarded unchanged" number="02" />

        <Node icon={Cloud} title="AI Provider" body="OpenAI, Anthropic, Gemini, others" step="03" />
      </div>

      {/* Return leg, drawn separately — the response really does come back. */}
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border bg-background px-4 py-3">
        <span className="num shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
          03
        </span>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Response</span> travels the same path in
          reverse — provider → engine → your app. The engine counts tokens; it does not read the
          body.
        </p>
      </div>

      {/* The one leg that leaves your environment. */}
      <div className="mt-4 grid gap-4 rounded-2xl border border-primary/25 bg-primary-soft p-5 sm:grid-cols-[auto_1fr]">
        <div className="flex items-start gap-3">
          <span className="num shrink-0 rounded-full bg-card px-2 py-0.5 text-[11px] text-primary">
            04
          </span>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl fill-gradient-brand text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="font-semibold tracking-tight">
            Verification Engine → CostMyAI · metadata only
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Aggregate rows. Token counts, model names. No prompt content. This is the only leg that
            leaves your environment, and it carries nothing we could reconstruct a prompt from.
          </p>
        </div>
      </div>
    </div>
  );
}

function Node({
  icon: Icon,
  title,
  body,
  highlight = false,
  step,
}: {
  icon: typeof Server;
  title: string;
  body: string;
  highlight?: boolean;
  step: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight
          ? "border-primary/40 bg-primary-soft shadow-[var(--shadow-card)]"
          : "border-border bg-background"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className={`grid h-10 w-10 place-items-center rounded-xl ${
            highlight ? "fill-gradient-brand text-primary-foreground" : "bg-secondary text-primary"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <span className="num text-xs text-muted-foreground">{step}</span>
      </div>
      <p className="mt-3.5 font-semibold tracking-tight">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Leg({ label, number }: { label: string; number: string }) {
  return (
    <div className="flex items-center justify-center gap-2 lg:flex-col lg:justify-center">
      <span className="num rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
        {number}
      </span>
      <div className="hidden h-px w-10 bg-gradient-to-r from-border to-primary/50 lg:block" />
      <div className="h-6 w-px bg-border lg:hidden" />
      <span className="max-w-[7rem] text-center text-[11px] leading-tight text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
