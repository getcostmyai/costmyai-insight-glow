import { it } from "vitest";
import { ingestBatchSchema } from "@/lib/ingest/schema";
import { handleProxy } from "../../../packages/gateway-container/src/proxy";
import { loadConfig } from "../../../packages/gateway-container/src/config";
it("x", async () => {
  const errBody = JSON.stringify({ error: { message: "no such model", type: "invalid_request_error", param: null, code: "model_not_found" }, request_id: "req_1" });
  const events: unknown[] = [];
  const config = loadConfig({ COSTMYAI_INGEST_TOKEN: "t".repeat(30), COSTMYAI_UPSTREAM_URL: "https://api.openai.com", COSTMYAI_BASE_URL: "http://localhost:1" });
  await handleProxy(new Request("http://x/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m" }), headers: { "content-type": "application/json" } }), {
    config,
    queue: { enqueue: (i: any) => events.push(i) } as any,
    fetchImpl: async () => new Response(errBody, { status: 404, headers: { "content-type": "application/json" } }),
  });
  await new Promise((r) => setTimeout(r, 100));
  const body: any = (events[0] as any).body;
  console.log(JSON.stringify(body));
  const r = ingestBatchSchema.safeParse({ v: 1, ...body });
  console.log("ok?", r.success, JSON.stringify(r.error?.issues));
});
