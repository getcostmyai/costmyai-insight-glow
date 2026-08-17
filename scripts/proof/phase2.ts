import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { loadConfig } from "../../packages/gateway-container/src/config";
import { createGateway } from "../../packages/gateway-container/src/index";
import { buildSwitchPlan } from "@/lib/ingest/switch-plan.server";
const ORG = "99488dd8-9fd3-4861-9d55-44f186ca2e56";
const TOKEN = "cma_live_0afa81c7c18ef77d6b30be3c66bf3ab37cf0519310890411";
console.log("plan BEFORE grant:", JSON.stringify(await buildSwitchPlan(ORG), null, 1));
const gw = createGateway(loadConfig({
  COSTMYAI_INGEST_TOKEN: TOKEN,
  COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
  COSTMYAI_BASE_URL: "http://localhost:8080",
  COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "cma-phase2-")),
  COSTMYAI_PORT: "8795",
  COSTMYAI_FLUSH_INTERVAL_MS: "5000",
  COSTMYAI_CONTAINER_ID: "switch-execution-proof",
  // Grant assertion only. No request is ever sent to this destination in this
  // run: the container refuses Phase 2 execution, so the value is never used.
  COSTMYAI_ROUTE_KEY_NOVITA: "placeholder-not-a-real-novita-key",
}));
await new Promise<void>((r) => gw.server.listen(8795, r));
for (let i = 0; i < 40 && !gw.switches.status().active; i++) await new Promise((r) => setTimeout(r, 250));
console.log("container status:", JSON.stringify(gw.switches.status()));
console.log("plan AFTER grant:", JSON.stringify((await buildSwitchPlan(ORG)).switches, null, 1));
await gw.switches.refresh();
console.log("container status after refresh:", JSON.stringify(gw.switches.status()));
const res = await fetch("http://127.0.0.1:8795/v1/messages", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": process.env["ANTHROPIC_API_KEY"]!, "anthropic-version": "2023-06-01" },
  body: JSON.stringify({ model: "claude-opus-5", max_tokens: 24, messages: [{ role: "user", content: "Reply with OK" }] }),
});
console.log("status", res.status, "reroute headers:", JSON.stringify(Object.fromEntries([...res.headers].filter(([k]) => k.startsWith("x-costmyai")))));
await new Promise((r) => setTimeout(r, 3000));
await gw.flush();
await gw.shutdown("SIGTERM");
