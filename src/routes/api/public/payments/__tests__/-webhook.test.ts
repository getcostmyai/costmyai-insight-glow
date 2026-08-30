import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 5 Tier 3 real bugs (Campbell, Ohno) — src/routes/api/public/payments/webhook.ts
 * had zero test coverage before this file. Three real bugs, three regression tests:
 *
 * 1. refundedFraction() defaulted to 1 (claw back 100%) on a malformed/zero-amount
 *    charge instead of refusing — an over-clawback is not a smaller incident than an
 *    under-clawback.
 * 2. (signature timing side-channel — see src/lib/__tests__/stripe.server.test.ts,
 *    this file does not re-test that; it mocks verifyWebhook entirely so the webhook
 *    dispatch logic can be exercised in isolation from signature verification.)
 * 3. charge.dispute.closed (won) never restored a commission clawed back when the
 *    dispute was created — this file drives the real exported handleWebhook() with a
 *    mocked Supabase client and a mocked Stripe client, asserting the actual RPC calls
 *    made, not that the code "looks right".
 */

const state = vi.hoisted(() => ({
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpcResponses: {} as Record<string, { data?: unknown; error?: unknown }>,
  chargesRetrieve: null as unknown as (id: string) => Promise<unknown>,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return Promise.resolve(state.rpcResponses[name] ?? { data: { ok: true }, error: null });
    },
    from: () => {
      throw new Error("this suite never exercises a .from() table read/write");
    },
  }),
}));

const mockVerifyWebhook = vi.fn();
vi.mock("@/lib/stripe.server", () => ({
  verifyWebhook: (...args: unknown[]) => mockVerifyWebhook(...args),
  createStripeClient: () => ({
    charges: { retrieve: (id: string) => state.chargesRetrieve(id) },
  }),
}));

// Imported after the mocks above so the module under test picks them up.
import { ChargeAmountUnknownError, handleWebhook, refundedFraction } from "../webhook";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SUPABASE_URL = "http://localhost:9999";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  state.rpcCalls = [];
  state.rpcResponses = {};
  state.chargesRetrieve = () => Promise.resolve(null);
  mockVerifyWebhook.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

function stripeEvent(type: string, object: unknown, id = "evt_test") {
  return { id, type, created: Math.floor(Date.now() / 1000), data: { object } };
}

describe("Bug 1 — refundedFraction() refuses rather than over-clawing-back", () => {
  it("computes a real fraction for a normal charge", () => {
    expect(refundedFraction({ amount: 1000, amount_refunded: 250 })).toBeCloseTo(0.25);
  });

  it("clamps a fraction above 1 (defensive: refunded should never exceed amount)", () => {
    expect(refundedFraction({ amount: 1000, amount_refunded: 5000 })).toBe(1);
  });

  it("throws ChargeAmountUnknownError instead of defaulting to 1 when amount is 0", () => {
    expect(() => refundedFraction({ id: "ch_bad", amount: 0, amount_refunded: 0 })).toThrow(
      ChargeAmountUnknownError,
    );
  });

  it("throws ChargeAmountUnknownError instead of defaulting to 1 when amount is missing", () => {
    expect(() => refundedFraction({ id: "ch_missing" })).toThrow(ChargeAmountUnknownError);
  });

  it("handleWebhook on charge.refunded with a real amount calls clawback_commission with the real fraction, never 1 by default", async () => {
    mockVerifyWebhook.mockResolvedValue(
      stripeEvent("charge.refunded", {
        id: "ch_1",
        invoice: "in_1",
        amount: 1000,
        amount_refunded: 300,
      }),
    );

    await handleWebhook(new Request("http://x"), "sandbox");

    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]).toMatchObject({
      name: "clawback_commission",
      args: { _invoice_id: "in_1", _fraction: 0.3, _environment: "sandbox" },
    });
  });

  it("handleWebhook on charge.refunded with a zero-amount charge refuses to clawback_commission at all — no over-clawback, no throw, event acknowledged", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockVerifyWebhook.mockResolvedValue(
      stripeEvent("charge.refunded", { id: "ch_bad", invoice: "in_2", amount: 0, amount_refunded: 0 }),
    );

    await expect(handleWebhook(new Request("http://x"), "sandbox")).resolves.toBeUndefined();

    // The old bug would have called clawback_commission with _fraction: 1
    // (100% clawback) here. The fix calls it zero times.
    expect(state.rpcCalls).toHaveLength(0);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Clawback NOT computed for charge ch_bad"));
  });
});

describe("Bug 3 — charge.dispute.closed (won) restores the clawback; (lost) leaves it standing", () => {
  it("charge.dispute.created claws back the full commission (unchanged behavior)", async () => {
    state.chargesRetrieve = () => Promise.resolve({ id: "ch_3", invoice: "in_3", amount: 1000, amount_refunded: 0 });
    mockVerifyWebhook.mockResolvedValue(
      stripeEvent("charge.dispute.created", { charge: "ch_3" }),
    );

    await handleWebhook(new Request("http://x"), "live");

    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]).toMatchObject({
      name: "clawback_commission",
      args: { _invoice_id: "in_3", _reason: "payment disputed", _environment: "live", _fraction: 1 },
    });
  });

  it("charge.dispute.closed with status 'won' restores the commission via restore_commission, using the charge's real refunded fraction", async () => {
    state.chargesRetrieve = () =>
      Promise.resolve({ id: "ch_4", invoice: "in_4", amount: 1000, amount_refunded: 0 });
    mockVerifyWebhook.mockResolvedValue(
      stripeEvent("charge.dispute.closed", { charge: "ch_4", status: "won" }),
    );

    await handleWebhook(new Request("http://x"), "live");

    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]).toMatchObject({
      name: "restore_commission",
      args: {
        _invoice_id: "in_4",
        _reason: "dispute resolved in merchant's favor",
        _environment: "live",
        _fraction: 0, // nothing else refunded on the charge => restore all the way back
      },
    });
  });

  it("charge.dispute.closed (won) restores only down to a real independent partial refund, never past it", async () => {
    state.chargesRetrieve = () =>
      Promise.resolve({ id: "ch_5", invoice: "in_5", amount: 1000, amount_refunded: 400 });
    mockVerifyWebhook.mockResolvedValue(
      stripeEvent("charge.dispute.closed", { charge: "ch_5", status: "won" }),
    );

    await handleWebhook(new Request("http://x"), "live");

    expect(state.rpcCalls[0]).toMatchObject({
      name: "restore_commission",
      args: { _invoice_id: "in_5", _fraction: 0.4 },
    });
  });

  it("charge.dispute.closed with status 'lost' does nothing — the original clawback stands", async () => {
    mockVerifyWebhook.mockResolvedValue(
      stripeEvent("charge.dispute.closed", { charge: "ch_6", status: "lost" }),
    );

    await handleWebhook(new Request("http://x"), "live");

    expect(state.rpcCalls).toHaveLength(0);
  });

  it("charge.dispute.closed with status 'warning_closed' does nothing (not a resolved dispute in our favor)", async () => {
    mockVerifyWebhook.mockResolvedValue(
      stripeEvent("charge.dispute.closed", { charge: "ch_7", status: "warning_closed" }),
    );

    await handleWebhook(new Request("http://x"), "live");

    expect(state.rpcCalls).toHaveLength(0);
  });

  it("charge.dispute.closed (won) on a charge with an unusable amount refuses to restore rather than guessing — logs, does not throw, does not call restore_commission", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.chargesRetrieve = () =>
      Promise.resolve({ id: "ch_8", invoice: "in_8", amount: 0, amount_refunded: 0 });
    mockVerifyWebhook.mockResolvedValue(
      stripeEvent("charge.dispute.closed", { charge: "ch_8", status: "won" }),
    );

    await expect(handleWebhook(new Request("http://x"), "live")).resolves.toBeUndefined();

    expect(state.rpcCalls).toHaveLength(0);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Commission NOT restored for invoice in_8"));
  });
});
