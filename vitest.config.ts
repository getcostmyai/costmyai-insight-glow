import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

/**
 * Dispatch 205 — the test-run inconsistency, fixed at its cause.
 *
 * The integration suites talk to the real database over the network. Vitest's
 * default 5s per-test timeout is comfortable when one file runs alone and is
 * not comfortable when a dozen network-bound files run concurrently: the same
 * unchanged code passed in isolation and timed out in the full run. That is a
 * scheduling property of the runner, not an intermittent fault in the code
 * under test, and leaving it in place makes every future full run a coin flip.
 *
 * The timeouts below are deliberately generous. A test that genuinely hangs
 * still fails; a test that is merely queued behind other network calls no
 * longer reports itself as a broken feature.
 */
export default mergeConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viteConfig as any,
  defineConfig({
    test: {
      testTimeout: 60_000,
      hookTimeout: 120_000,
    },
  }),
);
