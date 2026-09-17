import { describe, expect, it, vi } from "vitest";

import { reissueCode } from "../partner-create.server";

/**
 * The reissue path is admin-only. This proves the refusal happens before the
 * database routine is ever reached, so a non-admin cannot even learn whether a
 * partner id exists.
 */
describe("reissueCode", () => {
  const partnerId = "11111111-1111-1111-1111-111111111111";

  it("refuses a caller who is not a platform admin", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    await expect(reissueCode({ rpc } as never, partnerId)).rejects.toThrow(/not found/i);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("is_platform_admin");
  });

  it("mints a new code for a platform admin and returns the previous one", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "is_platform_admin"
        ? { data: true, error: null }
        : {
            data: { partner_id: partnerId, previous_code: "HOWNOT", referral_code: "8EXAKGEN" },
            error: null,
          },
    );
    const result = await reissueCode({ rpc } as never, partnerId, "test");
    expect(result.previous_code).toBe("HOWNOT");
    expect(result.referral_code).toBe("8EXAKGEN");
    expect(rpc).toHaveBeenCalledWith("reissue_referral_code", {
      _partner_id: partnerId,
      _reason: "test",
    });
  });
});
