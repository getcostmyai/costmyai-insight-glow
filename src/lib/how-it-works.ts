/**
 * The one description of the four-step flow.
 *
 * It used to live inline in src/routes/index.tsx. It now backs both the
 * homepage teaser (titles only) and the dedicated /how-it-works page (body +
 * supporting detail), so there is exactly one copy of the claims.
 *
 * `body` is the original homepage copy, unchanged. `detail` is supporting
 * detail the squeezed homepage section had no room for — it restates how the
 * step already works, it does not add new promises.
 */
export type HowStep = {
  n: string;
  title: string;
  body: string;
  detail: readonly string[];
};

export const HOW_STEPS: readonly HowStep[] = [
  {
    n: "01",
    title: "Connect",
    body: "Point your application at the Verification Engine endpoint. One environment variable change. Requests forward to your provider unchanged. What reaches us is token counts, model names, and request counts. Never your prompt content: by default the engine does not read request bodies at all, and if you turn on local classification it reads them inside your own environment and sends us only the task label.",
    detail: [
      "The engine runs as middleware inside your own environment. We never hold your provider keys.",
      "Nothing to migrate and nothing to rewrite: the request and the response pass through unchanged.",
      "Only aggregate metadata leaves your environment, on its own path, after the response is served.",
    ],
  },
  {
    n: "02",
    title: "Map",
    body: "We read your real spend, group it by workload, and benchmark every model against the live catalog — which re-syncs continuously, so a verdict is always measured against today's prices, not last quarter's. The buy-side view, not the vendor's.",
    detail: [
      "Traffic is grouped by workload rather than by raw model name, so a verdict covers the job you are actually running.",
      "Prices come from the tracked provider feeds and are re-synced continuously, with every host priced separately.",
      "Scores come from published evaluations, carrying the suite, the task class and the measurement margin they were taken with.",
    ],
  },
  {
    n: "03",
    title: "Verdict",
    body: "See which switches hold quality on real benchmarks, and which ones we refuse to certify. A governed decision names what it cannot prove.",
    detail: [
      "Every recommendation states the measurement it rests on: the suite, the score and the margin.",
      "Where nothing clears the bar, you get a refusal with the reason instead of a switch.",
      "Same-model, cheaper-host moves are separated from quality-matched model changes, because they carry different risk.",
    ],
  },
  {
    n: "04",
    title: "Switch",
    body: "Switch the workloads that hold quality. Keep the savings. Leave the rest exactly where they are. Not paying more than you need to, on the record and defensible.",
    detail: [
      "Switches are activated per workload, can be paused, and roll back in one click.",
      "On Govern the same decision is re-checked at the moment of action, not only at the moment of evaluation.",
      "Every automated decision is written to an audit trail you can hand to finance.",
    ],
  },
] as const;

/**
 * Static dashboard captures, one per rung, taken from the real product.
 *
 * Convention: /images/how-it-works/<plan>-dashboard.png, served from
 * public/images/how-it-works/. The frame reserves a 16:10 slot and keeps its
 * caption whether or not the file exists yet, so the page is never broken and
 * never obviously empty while captures are pending.
 */
export function dashboardShot(plan: string) {
  return `/images/how-it-works/${plan}-dashboard.png`;
}
