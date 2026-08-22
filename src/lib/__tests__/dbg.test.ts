import { describe, it } from "vitest";
import { requestHandler } from "@tanstack/start-server-core";
import { runWithStartContext } from "@tanstack/start-storage-context";
// @ts-expect-error virtual
import * as split from "@/lib/partner-application.functions?tss-serverfn-split";

describe("dbg", () => {
  it("x", async () => {
    console.log("SPLIT KEYS", Object.keys(split));
    const fn = (split as any).submitPartnerApplication_createServerFn_handler;
    const request = new Request("https://x.dev/a", { method: "POST", headers: { "cf-connecting-ip": "203.0.113.9" } });
    const h = requestHandler(async () => runWithStartContext({ contextAfterGlobalMiddlewares: {}, request } as never, async () => {
      const out = await fn({ data: { firstName: "A", lastName: "B", email: "dbg-drill@costmyai-test.dev", phone: "+43 660 1234567", company: "C", activeClients: "101–300", startingSoon: "3+" }, context: {} });
      console.log("OUT", JSON.stringify(out, (k,v)=> v instanceof Error ? v.message : v));
      return new Response("ok");
    }));
    await h(request, {} as never);
  }, 60000);
});
