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
export default defineConfig(async (env) => {
  // The app's vite config is a callback (it resolves plugins per-mode), so it
  // has to be invoked before it can be merged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = await (viteConfig as any)(env);
  return mergeConfig(base, {
    test: {
      maxWorkers: 6,
      minWorkers: 6,
      testTimeout: 60_000,
      hookTimeout: 120_000,
    },
  });
});
