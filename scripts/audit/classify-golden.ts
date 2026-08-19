/**
 * The labeled golden set for classifier accuracy work (Dispatch 235).
 *
 * Every prompt here is built the same way the Chain Drill Co traffic scripts
 * build theirs (`scripts/tmp/chain-traffic.ts`, `chain-classified.ts`): a
 * realistic filler body plus the actual ask, with a per-request index so no two
 * bodies are byte-identical. The true label is known BY CONSTRUCTION — the
 * generator decided what each request was before it was ever sent — which is
 * what makes this a golden set rather than synthetic guessing.
 *
 * 200 requests, 40 per bucket, over the five decidable TASK_HINTS
 * (`unknown` is an abstention, never a target label).
 */

export type Bucket = "code" | "reasoning" | "agentic" | "generation" | "classification";

export const BUCKETS: Bucket[] = ["code", "reasoning", "agentic", "generation", "classification"];

const OPS_FILLER =
  "The quarterly operations review covers throughput, latency, cost per request, error budgets, staffing, and vendor commitments across every region we serve. ".repeat(
    12,
  );

const CODE_FILLER = Array.from(
  { length: 24 },
  (_, i) =>
    `export function step${i}(rows: number[]): number { return rows.reduce((a, b) => a + b, 0) / rows.length }`,
).join("\n");

const LOG_FILLER = Array.from(
  { length: 16 },
  (_, i) =>
    `2026-08-1${i % 9}T04:${String(10 + i).padStart(2, "0")}:02Z region=eu-central-1 svc=router status=200 ms=${120 + i * 7} model=claude-opus-4-5`,
).join("\n");

const TICKET_FILLER = [
  "Ticket 88213: shipping was late but the product itself is great, would order again.",
  "Ticket 88214: third failed delivery attempt, nobody answers the support line.",
  "Ticket 88215: works as described, setup took ten minutes.",
  "Ticket 88216: invoice shows a currency I did not select at checkout.",
].join("\n");

/** Five distinct shapes per bucket, cycled to 40 with a request index. */
const TEMPLATES: Record<Bucket, ((i: number) => string)[]> = {
  code: [
    (i) =>
      `This module throws a TypeError on an empty array. Fix it and explain the bug.\n\`\`\`ts\n${CODE_FILLER}\n\`\`\`\nRequest ${i}.`,
    (i) =>
      `Refactor the following TypeScript so the aggregation runs in one pass instead of three. Keep the exported signatures.\n\`\`\`ts\n${CODE_FILLER}\n\`\`\`\nRequest ${i}.`,
    (i) =>
      `Write a Postgres migration that adds a nullable numeric column \`task_confidence\` to \`usage_rollups\`, backfills it to NULL, and adds a CHECK constraint for 0..1. Request ${i}.`,
    (i) =>
      `Our vitest suite fails with "ReferenceError: mapWithConcurrency is not defined" after a bundle split. Here is the failing module:\n\`\`\`ts\n${CODE_FILLER}\n\`\`\`\nDiagnose and patch. Request ${i}.`,
    (i) =>
      `Implement a bounded-width async pool in TypeScript: \`mapWithConcurrency<T,R>(items, width, fn)\`, preserving input order in the result array. Include the type signature. Request ${i}.`,
  ],
  reasoning: [
    (i) =>
      `A workload costs $4,180/month on model A at 62% of its quality ceiling, and model B is 71% cheaper per token but scores 4 points lower on the same benchmark. Under what token mix does the switch stop paying for itself? Show the arithmetic. Request ${i}.`,
    (i) =>
      `${OPS_FILLER}\n\nGiven the above, which of these is true and why? (A) latency dominates cost, (B) cost per request dominates, (C) neither can be determined from the passage. Justify step by step. Request ${i}.`,
    (i) =>
      `Three services share one rate limit of 600 rpm. A takes 55% of traffic, B 30%, C 15%. If C's share triples while total traffic stays flat, does A breach a 300 rpm floor? Work it out. Request ${i}.`,
    (i) =>
      `Prove or disprove: if every event carries a monotonically increasing \`created\` timestamp, a last-writer-wins merge on that field is sufficient to make subscription state convergent. Reason carefully about ties. Request ${i}.`,
    (i) =>
      `A cohort must contain at least 5 companies before a benchmark cut is disclosed. An attacker can query overlapping cuts. Explain whether repeated overlapping queries can recover a single company's figure, and under what conditions. Request ${i}.`,
  ],
  agentic: [
    (i) =>
      `You have access to the following tools: search(query), fetch(url), write_file(path, contents). Plan the steps, then execute them, to produce a competitor pricing summary at ./out/pricing.md. Request ${i}.`,
    (i) =>
      `Tools available: sql(query), send_email(to, subject, body). First find every organization whose subscription went past_due in the last 7 days, then email each owner. Call the tools; do not ask me for confirmation between steps. Request ${i}.`,
    (i) =>
      `You are an autonomous agent with a browser tool. Goal: sign in to the admin panel, open the payouts page, and report the pending total. Decide each next action from the previous observation. Request ${i}.`,
    (i) =>
      `Use the shell tool to run the test suite, read the failures, patch the offending file with the edit tool, and re-run until green. Report the final command output. Request ${i}.`,
    (i) =>
      `Available functions: list_invoices(org_id), refund(invoice_id, amount_cents). Work out which invoices were double-charged this month and issue the refunds. Chain the calls yourself. Request ${i}.`,
  ],
  generation: [
    (i) =>
      `${OPS_FILLER}\n\nRequest ${i}: summarise the passage above in about 120 words.`,
    (i) =>
      `Draft a launch announcement email for our new pricing tier. Warm, plain language, no exclamation marks, under 180 words. Request ${i}.`,
    (i) =>
      `Rewrite this paragraph for a landing page so it reads as one confident claim instead of three hedged ones: "We may be able to help teams reduce some of their model spend, in certain cases, depending on workload." Request ${i}.`,
    (i) =>
      `${OPS_FILLER}\n\nRequest ${i}: turn the above into five bullet points for a board slide.`,
    (i) =>
      `Write a 150-word changelog entry announcing that the gateway now classifies task type locally, on the customer's own machine, with no prompt text leaving the container. Request ${i}.`,
  ],
  classification: [
    (i) =>
      `Classify the sentiment of each ticket as positive, negative, or neutral. Respond with one word per line, nothing else.\n${TICKET_FILLER}\nRequest ${i}.`,
    (i) =>
      `Label the following log lines as either "healthy" or "degraded". Output a JSON array of labels only.\n${LOG_FILLER}\nRequest ${i}.`,
    (i) =>
      `Is this support message about billing, delivery, or product quality? Answer with exactly one of those three words.\n"Invoice shows a currency I did not select at checkout."\nRequest ${i}.`,
    (i) =>
      `Tag each ticket below with one of: refund_request, praise, delivery_issue, billing_error. Output one tag per line.\n${TICKET_FILLER}\nRequest ${i}.`,
    (i) =>
      `Given the passage, answer only "yes" or "no": does it mention staffing?\n${OPS_FILLER}\nRequest ${i}.`,
  ],
};

export interface GoldenItem {
  id: number;
  bucket: Bucket;
  prompt: string;
}

/** 200 items, 40 per bucket, deterministically interleaved so no bucket runs consecutively. */
export function goldenSet(): GoldenItem[] {
  const perBucket = 40;
  const items: GoldenItem[] = [];
  for (let n = 0; n < perBucket; n++) {
    for (const bucket of BUCKETS) {
      const tpl = TEMPLATES[bucket][n % TEMPLATES[bucket].length]!;
      items.push({ id: items.length, bucket, prompt: tpl(n) });
    }
  }
  return items;
}
