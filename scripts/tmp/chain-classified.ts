/**
 * Final chain proof: real Anthropic traffic through the real container with
 * local classification ON, into the real Chain Drill Co workspace — then the
 * real certification pipeline over the resulting rollups.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig } from "../../packages/gateway-container/src/config";
import { createGateway } from "../../packages/gateway-container/src/index";

const TOKEN = "cma_live_ee8a2f22505a4530c01eacc238754f7d795cf160e975a48f";
const PORT = 8896;
const N = Number(process.argv[2] ?? 60);
const MODEL = process.argv[3] ?? "claude-opus-4-5";

const CODE_FILLER = Array.from(
  { length: 40 },
  (_, i) => `export function step${i}(rows: number[]): number { return rows.reduce((a, b) => a + b, 0) / rows.length }`,
).join("\n");

const gateway = createGateway(
  loadConfig({
    COSTMYAI_INGEST_TOKEN: TOKEN,
    COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
    COSTMYAI_BASE_URL: "http://localhost:8080",
    COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "costmyai-chain-classified-")),
    COSTMYAI_PORT: String(PORT),
    COSTMYAI_FLUSH_INTERVAL_MS: "600000",
    COSTMYAI_CLASSIFY_LOCAL: "true",
  }),
);
await new Promise<void>((r) => gateway.server.listen(PORT, r));

const labels: Record<string, number> = {};
let ok = 0;
let fail = 0;

async function one(i: number) {
  const res = await fetch(`http://127.0.0.1:${PORT}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env["ANTHROPIC_API_KEY"]!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `This module throws a TypeError on an empty array. Fix it and explain the bug.\n\`\`\`ts\n${CODE_FILLER}\n\`\`\`\nRequest ${i}.`,
        },
      ],
    }),
  });
  const label = res.headers.get("x-costmyai-task") ?? "none";
  labels[label] = (labels[label] ?? 0) + 1;
  const body = await res.text();
  if (res.ok) ok++;
  else {
    fail++;
    if (fail <= 2) console.log("FAIL", res.status, body.slice(0, 300));
  }
}

const queue = Array.from({ length: N }, (_, i) => i);
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (;;) {
      const i = queue.shift();
      if (i === undefined) return;
      await one(i);
    }
  }),
);

console.log(JSON.stringify({ ok, fail, labels }));
for (let i = 0; i < 200 && gateway.queue.size < ok; i++) await new Promise((r) => setTimeout(r, 50));
console.log("flushed:", JSON.stringify(await gateway.flush()));
await gateway.shutdown("SIGTERM");
