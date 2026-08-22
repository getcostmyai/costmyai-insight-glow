import { describe, expect, it } from "vitest";
import { submitPartnerApplication } from "@/lib/partner-application.functions";

describe("probe", () => {
  it("invokes", async () => {
    try {
      const r = await submitPartnerApplication({ data: { firstName: "", lastName: "", email: "", phone: "", company: "", activeClients: "11–50", startingSoon: "3+" } as never });
      console.log("RESULT", r);
    } catch (e) {
      console.log("THREW", e instanceof Error ? e.message : String(e));
    }
    expect(true).toBe(true);
  }, 30000);
});
