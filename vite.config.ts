// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import wasm from "vite-plugin-wasm";

// Dispatch 88. Baked into the bundle so the running deployment can state which
// tree it was built from; the stale-deploy detector recomputes the same hash
// locally and compares. See scripts/audit/fingerprint.mjs.
import { computeFingerprint, gitHead } from "./scripts/audit/fingerprint.mjs";

const build = computeFingerprint(process.cwd());
const head = gitHead(process.cwd());

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __BUILD_FINGERPRINT__: JSON.stringify(build.fingerprint),
      __BUILD_FILES__: JSON.stringify(build.files),
      __BUILD_COMMIT__: JSON.stringify(head.commit ?? null),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    // workers-og ships Yoga/Resvg as .wasm side-files. Left externalised, the dev
    // SSR loader cannot resolve them; bundled, Vite needs an explicit wasm loader.
    plugins: [wasm()],
    ssr: { noExternal: ["workers-og"] },
    optimizeDeps: { exclude: ["workers-og"] },
    /**
     * Dispatch 205. The integration suites talk to the real database over the
     * network. Vitest's 5s default is fine for a file run alone and is not fine
     * when a dozen network-bound files run concurrently — which is why the same
     * code passed in isolation and failed in the full run. The failures were
     * scheduling, not logic; this removes the ambiguity permanently.
     */
    test: {
      testTimeout: 60_000,
      hookTimeout: 120_000,
    },

  },
});
