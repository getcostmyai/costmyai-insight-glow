/**
 * Classifier accuracy harness (Dispatch 235).
 *
 * Scores a classifier against the labeled Chain Drill golden set, per bucket.
 * Three back-ends:
 *
 *   local            the shipped in-container rules classifier (v2)
 *   <openai model>   remote classification, tool-constrained decoding
 *
 * Usage:
 *   bun scripts/audit/classify-accuracy.ts local
 *   bun scripts/audit/classify-accuracy.ts gpt-5-nano [n] [--shuffle]
 *
 * The OpenAI key is read from CostMyAI_OpenAI_Test_Key and never printed.
 */
import { classifyContent } from "../../packages/gateway-container/src/classify-local";
import { BUCKETS, goldenSet, type Bucket, type GoldenItem } from "./classify-golden";

const LABELS = [...BUCKETS, "unknown"] as const;
type Label = (typeof LABELS)[number];

const SYSTEM =
  "You classify one LLM API request into exactly one task label.\n" +
  "code: writing, fixing, refactoring or explaining source code, SQL or config.\n" +
  "reasoning: multi-step analysis, maths, proofs, or judgement over given facts.\n" +
  "agentic: the request declares tools/functions or asks for a plan-then-execute loop.\n" +
  "generation: producing prose — summaries, drafts, rewrites, marketing copy.\n" +
  "classification: assigning short labels/tags/sentiment to given items.\n" +
  "unknown: genuinely undecidable.\n" +
  "Answer with the label only.";

const TOOL = {
  type: "function" as const,
  function: {
    name: "label",
    parameters: {
      type: "object",
      properties: { task: { type: "string", enum: LABELS } },
      required: ["task"],
      additionalProperties: false,
    },
    strict: true,
  },
};

async function remoteLabel(
  model: string,
  key: string,
  prompt: string,
): Promise<{ label: Label; ms: number; in: number; out: number }> {
  const started = performance.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt.slice(0, 4000) },
      ],
      max_completion_tokens: 96,
      // gpt-5* default to a reasoning pass that eats the whole completion budget
      // before any tool call is emitted (finish_reason "length", 96 reasoning
      // tokens, empty message). Minimal effort is required for one-shot labels.
      ...(model.startsWith("gpt-5") ? { reasoning_effort: "minimal" } : {}),
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "label" } },
    }),
  });
  const ms = performance.now() - started;
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  const raw = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  let label: Label = "unknown";
  try {
    const parsed = JSON.parse(raw ?? "{}");
    if ((LABELS as readonly string[]).includes(parsed.task)) label = parsed.task;
  } catch {
    /* leave unknown */
  }
  return { label, ms, in: json.usage?.prompt_tokens ?? 0, out: json.usage?.completion_tokens ?? 0 };
}

function localLabel(prompt: string): Label {
  const body = new TextEncoder().encode(
    JSON.stringify({ model: "claude-opus-4-5", max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
  );
  return classifyContent(body).hint as Label;
}

async function pool<T>(items: T[], width: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  const queue = items.map((item, i) => [item, i] as const);
  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await fn(next[0], next[1]);
      }
    }),
  );
}

const backend = process.argv[2] ?? "local";
const limit = Number(process.argv[3] ?? 200);
const shuffle = process.argv.includes("--shuffle");

let items: GoldenItem[] = goldenSet().slice(0, limit);
if (shuffle) {
  let seed = 20260819;
  const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  items = items.map((v) => [rnd(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

const confusion = new Map<string, number>();
const latencies: number[] = [];
let tokIn = 0;
let tokOut = 0;
const order: { i: number; truth: Bucket; got: Label }[] = [];

if (backend === "local") {
  items.forEach((item, i) => {
    const got = localLabel(item.prompt);
    confusion.set(`${item.bucket}>${got}`, (confusion.get(`${item.bucket}>${got}`) ?? 0) + 1);
    order.push({ i, truth: item.bucket, got });
  });
} else {
  const key = process.env["CostMyAI_OpenAI_Test_Key"];
  if (!key) throw new Error("CostMyAI_OpenAI_Test_Key is not set");
  await pool(items, 6, async (item, i) => {
    const r = await remoteLabel(backend, key, item.prompt);
    confusion.set(`${item.bucket}>${r.label}`, (confusion.get(`${item.bucket}>${r.label}`) ?? 0) + 1);
    latencies.push(r.ms);
    tokIn += r.in;
    tokOut += r.out;
    order.push({ i, truth: item.bucket, got: r.label });
  });
}

const perBucket: Record<string, { n: number; correct: number; abstain: number; wrong: Record<string, number> }> = {};
for (const b of BUCKETS) perBucket[b] = { n: 0, correct: 0, abstain: 0, wrong: {} };
for (const [pair, count] of confusion) {
  const [truth, got] = pair.split(">") as [Bucket, Label];
  const row = perBucket[truth]!;
  row.n += count;
  if (got === truth) row.correct += count;
  else if (got === "unknown") row.abstain += count;
  else row.wrong[got] = (row.wrong[got] ?? 0) + count;
}

const total = Object.values(perBucket).reduce((a, r) => a + r.n, 0);
const correct = Object.values(perBucket).reduce((a, r) => a + r.correct, 0);
const wrong = Object.values(perBucket).reduce((a, r) => a + Object.values(r.wrong).reduce((x, y) => x + y, 0), 0);
const pct = (x: number, n: number): string => (n ? `${((x / n) * 100).toFixed(1)}%` : "-");

console.log(`\nbackend=${backend} n=${total}${shuffle ? " shuffled" : ""}`);
for (const b of BUCKETS) {
  const r = perBucket[b]!;
  const conf = Object.entries(r.wrong)
    .sort((a, b2) => b2[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  console.log(
    `  ${b.padEnd(15)} correct ${String(r.correct).padStart(3)}/${r.n} (${pct(r.correct, r.n).padStart(6)})  abstain ${String(r.abstain).padStart(3)}  wrong ${conf || "-"}`,
  );
}
console.log(`  OVERALL         correct ${correct}/${total} (${pct(correct, total)})  wrong ${wrong} (${pct(wrong, total)})`);

if (latencies.length) {
  const s = [...latencies].sort((a, b) => a - b);
  const q = (p: number): number => Math.round(s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!);
  console.log(
    `  latency ms  min ${Math.round(s[0]!)} p50 ${q(0.5)} p90 ${q(0.9)} max ${Math.round(s[s.length - 1]!)}  tokens in/out avg ${(tokIn / latencies.length).toFixed(1)}/${(tokOut / latencies.length).toFixed(1)}`,
  );
}

// Drift probe: does the answer depend on WHEN in the run it was asked?
const half = Math.floor(order.length / 2);
const share = (rows: typeof order, label: Label): string =>
  pct(rows.filter((r) => r.got === label).length, rows.length);
const first = order.slice(0, half);
const second = order.slice(half);
console.log(
  `  drift: generation share first-half ${share(first, "generation")} second-half ${share(second, "generation")}`,
);
