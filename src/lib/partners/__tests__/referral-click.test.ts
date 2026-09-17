import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The click row is the only record that a referral link was ever opened, so
 * these tests pin the four rules that make it trustworthy: one row per
 * first-touch match, none on a repeat click, none on an unknown code, and a
 * redirect that survives the write failing.
 */

const inserts: Array<Record<string, unknown>> = [];
let partnerRow: { id: string; referral_code: string } | null = null;
let insertThrows = false;

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      if (table === "partners") {
        const chain = {
          select: () => chain,
          ilike: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: partnerRow, error: null }),
        };
        return chain;
      }
      return {
        insert: async (row: Record<string, unknown>) => {
          if (insertThrows) throw new Error("data api down");
          inserts.push(row);
          return { error: null };
        },
      };
    },
  },
}));

const { handleReferralRedirect } = await import("../referral-redirect");

function click(cookie?: string): Promise<Response> {
  return handleReferralRedirect(
    new Request("https://www.costmyai.com/r/8EXAKGEN", {
      headers: cookie ? { cookie } : undefined,
    }),
    "8exakgen",
  );
}

describe("referral click recording", () => {
  beforeEach(() => {
    inserts.length = 0;
    insertThrows = false;
    partnerRow = { id: "11111111-1111-4111-8111-111111111111", referral_code: "8EXAKGEN" };
  });

  it("writes exactly one row on a first-touch match, with the partner attached", async () => {
    const res = await click();
    expect(res.status).toBe(302);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      event_type: "referral_click",
      referred_by_partner_id: "11111111-1111-4111-8111-111111111111",
      is_synthetic: false,
    });
    expect(typeof inserts[0]!.visitor_id).toBe("string");
    expect(typeof inserts[0]!.session_id).toBe("string");

    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("cma_ref=8EXAKGEN");
    expect(cookies).toContain("cma_vid=");
    expect(cookies).toContain("cma_sid=");
  });

  it("records nothing on a repeat click, because first touch already won", async () => {
    const res = await click("cma_ref=8EXAKGEN; cma_vid=22222222-2222-4222-8222-222222222222");
    expect(res.status).toBe(302);
    expect(inserts).toHaveLength(0);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("records nothing for a code that matches no active partner", async () => {
    partnerRow = null;
    const res = await click();
    expect(res.status).toBe(302);
    expect(inserts).toHaveLength(0);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("still redirects and still sets the cookie when the write fails", async () => {
    insertThrows = true;
    const res = await click();
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://www.costmyai.com/");
    expect(res.headers.getSetCookie().join("\n")).toContain("cma_ref=8EXAKGEN");
    expect(inserts).toHaveLength(0);
  });
});
