import { describe, it } from "vitest";
import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { handleProxy } from "../../../../packages/gateway-container/src/proxy";
describe("g", () => { it("dbg", async () => {
  const queue = { enqueue(){} } as any;
  const config = loadConfig({ COSTMYAI_INGEST_TOKEN:"cma_live_test", COSTMYAI_UPSTREAM_URL:"https://generativelanguage.googleapis.com", COSTMYAI_SPOOL_DIR:"/tmp/costmyai-dbg" });
  const r = await handleProxy(new Request("http://localhost/v1beta/models/gemini-2.5-flash:generateContent",{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":process.env["GEMINI_API_KEY"]!},body:JSON.stringify({contents:[{parts:[{text:"say ok"}]}],generationConfig:{maxOutputTokens:16}})}),{config,queue});
  console.log("STATUS", r.status, (await r.text()).slice(0,600));
},60000); });
