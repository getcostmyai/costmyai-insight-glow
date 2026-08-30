import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Phase 5 Tier 3 Bug 2 (Campbell, Ohno): verifyWebhook() compared the computed
 * HMAC signature against Stripe's header with plain string equality
 * (`v1Signatures.includes(expected)`), a non-constant-time comparison that
 * leaks how many leading bytes an attacker guessed correctly through response
 * timing — the same side-channel Stripe's own SDK closes with
 * `crypto.timingSafeEqual`. These tests exercise the real, unmocked
 * verifyWebhook() against real HMAC-SHA256 signatures built the same way the
 * implementation builds its own expected value, so they prove correctness of
 * outcome (valid accepted, invalid rejected, length-mismatch handled cleanly)
 * for both the old and new implementation alike. They cannot themselves prove
 * *constant time* — that requires statistical timing measurement, which is
 * out of scope for a unit test — so this suite proves behavior is unchanged
 * and additionally proves the length-mismatch path (the one path
 * `crypto.timingSafeEqual` behaves differently on — it throws instead of
 * returning false) is handled without leaking an unhandled exception.
 */

import { verifyWebhook } from "../stripe.server";

const SECRET = "whsec_test_secret_1234567890";
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET = SECRET;
  process.env.PAYMENTS_LIVE_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function sign(timestamp: number, body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return Buffer.from(new Uint8Array(signed)).toString("hex");
}

function requestWith(signatureHeader: string, body: string): Request {
  return new Request("http://x/webhook", {
    method: "POST",
    headers: { "stripe-signature": signatureHeader },
    body,
  });
}

describe("verifyWebhook() signature check", () => {
  it("accepts a genuinely valid signature and returns the parsed event", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "test.event" });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await sign(timestamp, body);

    const event = await verifyWebhook(requestWith(`t=${timestamp},v1=${sig}`, body), "sandbox");
    expect(event.id).toBe("evt_1");
  });

  it("accepts when the valid signature is not the first v1= entry (Stripe sends multiple during secret rotation)", async () => {
    const body = JSON.stringify({ id: "evt_2", type: "test.event" });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await sign(timestamp, body);
    const decoy = "0".repeat(sig.length);

    const event = await verifyWebhook(
      requestWith(`t=${timestamp},v1=${decoy},v1=${sig}`, body),
      "sandbox",
    );
    expect(event.id).toBe("evt_2");
  });

  it("rejects a same-length but byte-wrong signature", async () => {
    const body = JSON.stringify({ id: "evt_3", type: "test.event" });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await sign(timestamp, body);
    const wrong = ("0" + sig.slice(1) === sig ? "1" : "0") + sig.slice(1);

    await expect(verifyWebhook(requestWith(`t=${timestamp},v1=${wrong}`, body), "sandbox")).rejects.toThrow(
      "Invalid webhook signature",
    );
  });

  it("rejects a signature of the wrong length without throwing an unhandled crypto error (the exact path where timingSafeEqual differs from plain string comparison)", async () => {
    const body = JSON.stringify({ id: "evt_4", type: "test.event" });
    const timestamp = Math.floor(Date.now() / 1000);
    const shortSig = "abcd1234"; // valid hex, wrong length vs a real 64-byte hex digest

    await expect(
      verifyWebhook(requestWith(`t=${timestamp},v1=${shortSig}`, body), "sandbox"),
    ).rejects.toThrow("Invalid webhook signature");
  });

  it("rejects when the body was tampered with after signing", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await sign(timestamp, JSON.stringify({ id: "evt_5", type: "test.event" }));
    const tamperedBody = JSON.stringify({ id: "evt_5", type: "test.event", amount: 999999 });

    await expect(
      verifyWebhook(requestWith(`t=${timestamp},v1=${sig}`, tamperedBody), "sandbox"),
    ).rejects.toThrow("Invalid webhook signature");
  });

  it("rejects a timestamp older than 5 minutes even with an otherwise-valid signature", async () => {
    const body = JSON.stringify({ id: "evt_6", type: "test.event" });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 301;
    const sig = await sign(staleTimestamp, body);

    await expect(
      verifyWebhook(requestWith(`t=${staleTimestamp},v1=${sig}`, body), "sandbox"),
    ).rejects.toThrow("Webhook timestamp too old");
  });
});
