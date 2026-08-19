/**
 * Drift diagnosis (Dispatch 235): when a cheap model's labels converge on one
 * bucket as a run proceeds, is it (a) prompt caching, (b) context carryover
 * between calls, or (c) genuine per-request unreliability?
 *
 * Three probes, all against the same model:
 *   A  same prompt, 24 sequential calls  -> label stability + cached_tokens
 *   B  ordered vs shuffled golden slice  -> position dependence
 *   C  first vs last third of a long run -> convergence over time
 */
import { goldenSet } from "./classify-golden";

const KEY = process.env["CostMyAI_OpenAI_Test_Key"];
if (!KEY) throw new Error("CostMyAI_OpenAI_Test_Key is not set");
const MODEL = process.argv[2] ?? "gpt-5-nano";
const LABELS = ["code", "reasoning", "agentic", "generation", "classification", "unknown"];
const SYSTEM = "Classify the request as one of: code, reasoning, agentic, generation, classification, unknown.";

async function call(prompt: string): Promise<{ label: string; cached: number }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt.slice(0, 4000) },
      ],
      max_completion_tokens: 96,
      ...(MODEL.startsWith("gpt-5") ? { reasoning_effort: "minimal" } : {}),
      tools: [
        {
          type: "function",
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
        },
      ],
      tool_choice: { type: "function", function: { name: "label" } },
    }),
  });
  const json = (await res.json()) as any;
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  let label = "unknown";
  try {
    label = JSON.parse(args ?? "{}").task ?? "unknown";
  } catch {
    /* keep unknown */
  }
  return { label, cached: json.usage?.prompt_tokens_details?.cached_tokens ?? 0 };
}

const items = goldenSet();
const tally = (xs: string[]): Record<string, number> =>
  xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});

// --- A: same prompt, 24 sequential calls ------------------------------------
const fixed = items.find((i) => i.bucket === "agentic")!.prompt;
const repeat: string[] = [];
let cachedHits = 0;
for (let i = 0; i < 24; i++) {
  const r = await call(fixed);
  repeat.push(r.label);
  if (r.cached > 0) cachedHits++;
}
console.log("A same-prompt x24:", JSON.stringify(tally(repeat)), "cached-token responses:", cachedHits);
console.log("  sequence:", repeat.join(","));

// --- B: ordered vs shuffled, same 50 items ----------------------------------
const slice = items.slice(0, 50);
const ordered: Record<number, string> = {};
for (const it of slice) ordered[it.id] = (await call(it.prompt)).label;
let seed = 7;
const shuffled = [...slice].sort(() => ((seed = (seed * 48271) % 2147483647) % 1000) / 1000 - 0.5);
const shuf: Record<number, string> = {};
for (const it of shuffled) shuf[it.id] = (await call(it.prompt)).label;
const agree = slice.filter((it) => ordered[it.id] === shuf[it.id]).length;
console.log(`B ordered vs shuffled: agreement ${agree}/${slice.length}`);
console.log("  ordered  :", JSON.stringify(tally(Object.values(ordered))));
console.log("  shuffled :", JSON.stringify(tally(Object.values(shuf))));

// --- C: convergence over a long single-order run ----------------------------
const long = items.slice(0, 90);
const labels: string[] = [];
for (const it of long) labels.push((await call(it.prompt)).label);
const third = Math.floor(labels.length / 3);
console.log("C first third :", JSON.stringify(tally(labels.slice(0, third))));
console.log("C last third  :", JSON.stringify(tally(labels.slice(-third))));
