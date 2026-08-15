// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import wasm from "vite-plugin-wasm";

/**
 * The Worker runtime refuses to compile wasm from bytes at request time, so the
 * resvg module has to arrive as a build-time `?module` import that only Nitro's
 * unwasm plugin understands. Every other environment (client, SSR, prerender)
 * would try to read that id off disk and fail, and none of them ever rasterises
 * anything, so they get an inert stub instead.
 */
const WASM_MODULE_RE = /\.wasm\?module$/;
const stubWasmModuleOutsideWorker = {
  name: "costmyai:stub-wasm-module",
  applyToEnvironment: (env: { name: string }) => env.name !== "nitro",
  resolveId(id: string) {
    return WASM_MODULE_RE.test(id) ? "\0costmyai-wasm-module-stub" : null;
  },
  load(id: string) {
    return id === "\0costmyai-wasm-module-stub" ? "export default null;" : null;
  },
};

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
    plugins: [stubWasmModuleOutsideWorker, wasm()],
    ssr: { noExternal: ["workers-og"] },
    optimizeDeps: { exclude: ["workers-og"] },


  },
});
