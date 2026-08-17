import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../packages/gateway-container/src/config";
import { createGateway } from "../../packages/gateway-container/src/index";

const TOKEN = "cma_live_0afa81c7c18ef77d6b30be3c66bf3ab37cf0519310890411";
const PORT = 8891;
const N = Number(process.argv[2] ?? 200);
const MODEL = process.argv[3] ?? "claude-opus-5";
const FILLER = ("The quarterly operations review covers throughput, latency, cost per request, error budgets, staffing, and vendor commitments across every region we serve. ").repeat(45);

const gateway = createGateway(loadConfig({
  COSTMYAI_INGEST_TOKEN: TOKEN,
  COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
  COSTMYAI_BASE_URL: "http://localhost:8080",
  COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "costmyai-proof-")),
  COSTMYAI_PORT: String(PORT),
  COSTMYAI_FLUSH_INTERVAL_MS: "600000",
}));
await new Promise<void>((r) => gateway.server.listen(PORT, r));
for (let i = 0; i < 40 && !gateway.switches.status().active; i++) await new Promise((r) => setTimeout(r, 250));
console.log("switch map:", JSON.stringify(gateway.switches.status()));

let ok = 0, fail = 0; const rerouteHeaders: Record<string, number> = {};
async function one(i: number) {
  const res = await fetch(`http://127.0.0.1:${PORT}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env["ANTHROPIC_API_KEY"]!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 220, messages: [{ role: "user", content: `${FILLER}\n\nRequest ${i}: summarise the passage above in about 120 words.` }] }),
  });
  const h = res.headers.get("x-costmyai-reroute") ?? "none";
  rerouteHeaders[h] = (rerouteHeaders[h] ?? 0) + 1;
  const body = await res.text();
  if (res.ok) ok++; else { fail++; if (fail <= 2) console.log("FAIL", res.status, body.slice(0, 300)); }
  if (i === 0) console.log("first response:", res.status, body.slice(0, 240), "| reroute header:", h);
}
const queue = Array.from({ length: N }, (_, i) => i);
await Promise.all(Array.from({ length: 10 }, async () => { for (;;) { const i = queue.shift(); if (i === undefined) return; await one(i); } }));
console.log(JSON.stringify({ ok, fail, rerouteHeaders, queued: gateway.queue.size }));
for (let i = 0; i < 100 && gateway.queue.size < ok; i++) await new Promise((r) => setTimeout(r, 50));
const flushed = await gateway.flush();
console.log("flushed:", JSON.stringify(flushed));
await gateway.shutdown("SIGTERM");
