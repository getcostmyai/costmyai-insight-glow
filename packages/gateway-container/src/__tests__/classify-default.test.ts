/**
 * Dispatch 233 — the local-classification default belongs to the IMAGE TAG.
 *
 * One source tree, two published postures. `v1` is built without
 * `CLASSIFY_LOCAL_DEFAULT` and behaves exactly as it always has; `v2` is built
 * with it and classifies by default. The customer's own
 * `COSTMYAI_CLASSIFY_LOCAL` overrides both, in both directions, because an
 * opt-out that a newer image can silently ignore is not an opt-out.
 *
 * These tests exist so a later refactor cannot collapse the two variables into
 * one and quietly hand v1's posture to v2's default, or vice versa.
 */
import { describe, expect, it } from "vitest";

import { CONTAINER_DEFAULTS } from "../../../../src/lib/ingest/contract";
import { loadConfig } from "../config";

const base = {
  COSTMYAI_INGEST_TOKEN: "cma_live_test",
  COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
  COSTMYAI_BASE_URL: "http://localhost:8080",
};

/** What the v1 image bakes in: nothing. */
const v1 = base;
/** What the v2 image bakes in, via `--build-arg CLASSIFY_LOCAL_DEFAULT=true`. */
const v2 = { ...base, COSTMYAI_CLASSIFY_LOCAL_DEFAULT: "true" };

describe("classification default is a property of the image tag", () => {
  it("is off on a v1-style image with nothing set", () => {
    expect(loadConfig(v1).classifyLocal).toBe(false);
  });

  it("is on on a v2-style image with nothing set", () => {
    expect(loadConfig(v2).classifyLocal).toBe(true);
  });
});

describe("the customer's own variable always wins", () => {
  it("opts in on a v1-style image", () => {
    expect(loadConfig({ ...v1, COSTMYAI_CLASSIFY_LOCAL: "true" }).classifyLocal).toBe(true);
  });

  it("opts OUT on a v2-style image — newer image, v1 posture", () => {
    for (const off of ["false", "0", "no", "off", "FALSE", " off "]) {
      expect(loadConfig({ ...v2, COSTMYAI_CLASSIFY_LOCAL: off }).classifyLocal).toBe(false);
    }
  });

  it("treats an empty override as unset rather than as an opt-out", () => {
    expect(loadConfig({ ...v2, COSTMYAI_CLASSIFY_LOCAL: "" }).classifyLocal).toBe(true);
    expect(loadConfig({ ...v1, COSTMYAI_CLASSIFY_LOCAL: "" }).classifyLocal).toBe(false);
  });

  it("resolves junk in either variable to off, the safe direction", () => {
    expect(loadConfig({ ...v1, COSTMYAI_CLASSIFY_LOCAL: "maybe" }).classifyLocal).toBe(false);
    expect(loadConfig({ ...base, COSTMYAI_CLASSIFY_LOCAL_DEFAULT: "maybe" }).classifyLocal).toBe(
      false,
    );
  });
});

describe("the quickstart default tag is a deliberate, locked choice", () => {
  /**
   * Dispatch 237. This assertion previously pinned `v1` and existed to stop the
   * default drifting to a classifying image by accident. The default was then
   * moved on purpose, so the lock moves with it rather than being deleted: a
   * revert to `v1` (or a silent slide to `v2`) fails here and has to be argued
   * for, exactly as moving to `v3` had to be.
   */
  it("hands a brand-new customer the remotely-classifying image", () => {
    expect(CONTAINER_DEFAULTS.tag).toBe("v3");
    expect(CONTAINER_DEFAULTS.tag).toBe(CONTAINER_DEFAULTS.remoteClassifyingTag);
  });

  it("keeps the quieter postures published and reachable by name", () => {
    expect(CONTAINER_DEFAULTS.nonClassifyingTag).toBe("v1");
    expect(CONTAINER_DEFAULTS.classifyingTag).toBe("v2");
    expect(CONTAINER_DEFAULTS.remoteClassifyingTag).toBe("v3");
  });
});
