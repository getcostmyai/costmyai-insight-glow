import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { _types: {}, options: {} },
}));

/**
 * The reissue action is admin-only. This proves the refusal happens before the
 * database routine is ever reached, so a non-admin cannot even see whether a
 * partner id exists.
 */
describe("reissuePartnerCode", () => {
  async function handler() {
    const mod = await import("../partner-create.functions");
    const fn = mod.reissuePartnerCode as unknown as {
      options: { handler: (ctx: unknown) => Promise<unknown> };
    };
    return fn.options.handler;
  }

  it("refuses a caller who is not a platform admin", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "is_platform_admin" ? { data: false, error: null } : { data: null, error: null },
    );
    const run = await handler();
    await expect(
      run({
        data: { partnerId: "11111111-1111-1111-1111-111111111111" },
        context: { supabase: { rpc } },
      }),
    ).rejects.toThrow(/not found/i);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith("reissue_referral_code", expect.anything());
  });

  it("mints a new code for a platform admin", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "is_platform_admin"
        ? { data: true, error: null }
        : {
            data: {
              partner_id: "11111111-1111-1111-1111-111111111111",
              previous_code: "HOWNOT",
              referral_code: "8EXAKGEN",
            },
            error: null,
          },
    );
    const run = await handler();
    const result = (await run({
      data: { partnerId: "11111111-1111-1111-1111-111111111111", reason: "test" },
      context: { supabase: { rpc } },
    })) as { referral_code: string };
    expect(result.referral_code).toBe("8EXAKGEN");
  });
});
