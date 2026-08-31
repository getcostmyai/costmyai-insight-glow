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
 *
 * Serial phase (this session). `delisted-price.integration.test.ts` inserts a
 * synthetic `host_prices` row at $0.001/Mtok. `host_prices` is a single global
 * table with no tenant or test boundary — every suite that runs a live
 * evaluation reads it unfiltered — so for the seconds that row is listed it is
 * the cheapest destination in the market for every concurrently-running suite,
 * which is exactly how govern-synthetic and certify-synthetic picked up one-off
 * contamination. Vitest's real mechanism for "run this after everything else"
 * is `sequence.groupOrder` across projects: groups run lowest to highest, and
 * only projects sharing a group order run at the same time. The polluting file
 * therefore gets group 1 and runs alone once group 0 has finished.
 */
const SERIAL_FILES = ["src/lib/engine/__tests__/delisted-price.integration.test.ts"];

export default defineConfig(async (env) => {
  // The app's vite config is a callback (it resolves plugins per-mode), so it
  // has to be invoked before it can be merged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = await (viteConfig as any)(env);
  const shared = {
    maxWorkers: 6,
    minWorkers: 6,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  };
  return mergeConfig(base, {
    test: {
      ...shared,
      projects: [
        {
          extends: true,
          test: {
            ...shared,
            name: "parallel",
            exclude: [
              "**/node_modules/**",
              "**/dist/**",
              "eslint-rules/**/*.test.js",
              ...SERIAL_FILES,
            ],
          },
        },
        {
          extends: true,
          test: {
            ...shared,
            name: "serial",
            include: SERIAL_FILES,
            exclude: ["eslint-rules/**/*.test.js"],
            sequence: { groupOrder: 1 },
          },
        },
      ],
    },
  });
});

