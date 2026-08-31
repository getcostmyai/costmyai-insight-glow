import { describe, expect, it } from "vitest";

import { asOfLabel } from "../share-cards";

describe("asOfLabel", () => {
  it("is deterministic and UTC-stamped for a fixed ISO input", () => {
    expect(asOfLabel("2026-08-31T09:05:00.000Z")).toBe("31 Aug 2026, 09:05 UTC");
  });

  it("does not shift the date across a timezone boundary", () => {
    expect(asOfLabel("2026-08-31T23:45:00.000Z")).toBe("31 Aug 2026, 23:45 UTC");
  });
});
