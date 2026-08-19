import { goldenSet } from "../audit/classify-golden";
const LABELS = ["code","reasoning","agentic","generation","classification","unknown"] as const;
const SYSTEM =
  "You classify one LLM API request into exactly one task label.\n" +
  "code: writing, fixing, refactoring or explaining source code, SQL or config.\n" +
  "reasoning: multi-step analysis, maths, proofs, or judgement over given facts.\n" +
  "agentic: the request declares tools/functions or asks for a plan-then-execute loop.\n" +
  "generation: producing prose — summaries, drafts, rewrites, marketing copy.\n" +
  "classification: assigning short labels/tags/sentiment to given items.\n" +
  "unknown: genuinely undecidable.\nAnswer with the label only.";
const TOOL = { type: "function", function: { name: "label", parameters: { type: "object", properties: { task: { type: "string", enum: LABELS } }, required: ["task"], additionalProperties: false }, strict: true } };
const key = process.env["CostMyAI_OpenAI_Test_Key"]!;
const items = goldenSet().slice(0, 40);
const lat: number[] = []; let valid = 0, tin = 0, tout = 0;
for (const it of items) {
  const t0 = performance.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-5-mini", messages: [{ role: "system", content: SYSTEM }, { role: "user", content: it.prompt.slice(0, 4000) }], max_completion_tokens: 96, reasoning_effort: "minimal", tools: [TOOL], tool_choice: { type: "function", function: { name: "label" } } }) });
  const ms = performance.now() - t0; const j: any = await res.json();
  if (!res.ok) { console.log("ERR", res.status, JSON.stringify(j).slice(0,200)); continue; }
  lat.push(ms); tin += j.usage?.prompt_tokens ?? 0; tout += j.usage?.completion_tokens ?? 0;
  const raw = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  try { const p = JSON.parse(raw ?? "{}"); if ((LABELS as readonly string[]).includes(p.task)) valid++; } catch {}
}
lat.sort((a,b)=>a-b);
const q=(p:number)=>Math.round(lat[Math.min(lat.length-1,Math.floor(p*lat.length))]);
console.log(JSON.stringify({ n: lat.length, valid, min: Math.round(lat[0]), p50: q(0.5), p90: q(0.9), max: Math.round(lat[lat.length-1]), avgIn: tin/lat.length, avgOut: tout/lat.length,
  costPer1k: ((tin/lat.length)*0.25 + (tout/lat.length)*2.0)/1e6*1000 }, null, 2));
