import { describe, expect, it } from "vitest";

import { effectivePlan, isEntitledTo, subscriptionIsCurrent } from "../entitlement";

/**
 * The rebuild carries no launch-free promotion. These tests exist to make that
 * structural: a paid level is reachable only through a live subscription, and
 * nothing about a date, an environment, or a workspace record alone can open
 * one.
 */

const now = new Date("2026-07-31T00:00:00Z");
const future = "2026-08-30T00:00:00Z";
const past = "2026-07-01T00:00:00Z";

describe("plan entitlement", () => {
  it("gives every workspace Compare for free", () => {
    expect(isEntitledTo("compare", "compare", null, now)).toBe(true);
  });

  it("refuses a paid level when the workspace record claims it but nothing is paid", () => {
    expect(effectivePlan("govern", null, now)).toBe("compare");
    expect(isEntitledTo("certify", "govern", null, now)).toBe(false);
  });

  it("grants the level while the subscription is active", () => {
    const sub = {
      plan: "rightsize" as const,
      status: "active",
      currentPeriodEnd: future,
      cancelAtPeriodEnd: false,
    };
    expect(effectivePlan("rightsize", sub, now)).toBe("rightsize");
    expect(isEntitledTo("certify", "rightsize", sub, now)).toBe(true);
    expect(isEntitledTo("govern", "rightsize", sub, now)).toBe(false);
  });

  it("keeps access through a retrying payment, and through notice until the paid period ends", () => {
    const dunning = {
      plan: "certify" as const,
      status: "past_due",
      currentPeriodEnd: future,
      cancelAtPeriodEnd: false,
    };
    expect(subscriptionIsCurrent(dunning, now)).toBe(true);

    const cancelling = {
      plan: "certify" as const,
      status: "canceled",
      currentPeriodEnd: future,
      cancelAtPeriodEnd: true,
    };
    expect(effectivePlan("certify", cancelling, now)).toBe("certify");
  });

  it("drops to Compare once the paid period is over", () => {
    const lapsed = {
      plan: "govern" as const,
      status: "canceled",
      currentPeriodEnd: past,
      cancelAtPeriodEnd: true,
    };
    expect(effectivePlan("govern", lapsed, now)).toBe("compare");
  });

  it("never grants more than the subscription actually bought", () => {
    const sub = {
      plan: "certify" as const,
      status: "active",
      currentPeriodEnd: future,
      cancelAtPeriodEnd: false,
    };
    expect(effectivePlan("govern", sub, now)).toBe("certify");
    expect(isEntitledTo("govern", "govern", sub, now)).toBe(false);
  });
});
