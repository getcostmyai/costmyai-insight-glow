import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Reveal } from "@/components/marketing/Reveal";

/**
 * Copy-paste embed block.
 *
 * The widget is an <iframe>, never a <script>: whoever embeds us gets an
 * isolated document that cannot touch their page and that their page cannot
 * touch. The snippet is assembled from the reader's own origin so it is
 * correct on preview and on production without a hardcoded host.
 */
const WIDGET_PATH = "/embed/intelligence-widget";

function snippetFor(origin: string) {
  return `<iframe src="${origin}${WIDGET_PATH}"
  title="AI price market — via CostMyAI"
  width="100%" height="200" loading="lazy"
  style="border:0;max-width:520px"
  referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

export function EmbedWidgetSection() {
  const [origin, setOrigin] = useState("https://costmyai.com");
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const snippet = snippetFor(origin);

  return (
    <section
      id="embed"
      className="relative overflow-hidden border-t border-border/60 wash-brand px-5 py-28 sm:px-8 sm:py-36"
    >
      <div className="rule-brand absolute inset-x-5 top-0 sm:inset-x-8" aria-hidden />
      <div className="mx-auto max-w-6xl">

        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Embed
          </p>
          <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Put the live market on your own page
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            A self-contained frame that rotates the three sharpest numbers of the month: how many
            prices moved, the steepest rise and the steepest cut. It refreshes itself, needs no
            script on your site, and always credits CostMyAI.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
          <Reveal>
            <iframe
              src={WIDGET_PATH}
              title="AI price market — via CostMyAI"
              width="100%"
              height={200}
              loading="lazy"
              className="w-full rounded-2xl border-0"
            />
          </Reveal>

          <Reveal delay={80}>
            <div className="relative">
              <pre className="overflow-x-auto rounded-2xl bg-foreground/[0.04] p-5 text-[12.5px] leading-relaxed">
                <code className="font-mono">{snippet}</code>
              </pre>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(snippet).then(() => setCopied(true));
                }}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium shadow-sm transition-opacity hover:opacity-70"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <ul className="mt-8 divide-y divide-border/60 border-t border-border/60 text-sm">
              {[
                ["Rotation", "Month-over-month move count, biggest rise, biggest cut."],
                ["Freshness", "Server-cached and refreshed every five minutes."],
                ["Safety", "Isolated iframe, no script in your page, nothing configurable."],
                ["Attribution", "The “via CostMyAI” link is part of the widget on every plan."],
              ].map(([k, v]) => (
                <li key={k} className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
                  <span className="font-semibold tracking-tight">{k}</span>
                  <span className="text-muted-foreground">{v}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
