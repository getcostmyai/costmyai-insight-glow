// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import wasm from "vite-plugin-wasm";

// Dispatch 88. Baked into the bundle so the running deployment can state which
// tree it was built from; the stale-deploy detector recomputes the same hash
// locally and compares. See scripts/audit/fingerprint.mjs.
import { computeFingerprint, gitHead } from "./scripts/audit/fingerprint.mjs";

const build = computeFingerprint(process.cwd());
const head = gitHead(process.cwd());

/**
 * The deployed Worker only receives the JavaScript modules of the bundle, so a
 * `.wasm` side-file emitted next to it is simply not there at runtime ("No such
 * module"). Inlining the bytes into the module graph keeps the rasteriser in the
 * one file that does get deployed, and the module is compiled once when the
 * module is first evaluated rather than per request.
 */
const WASM_MODULE_RE = /\.wasm\?module$/;
const require_ = createRequire(import.meta.url);
const inlineWasmModule = {
  name: "costmyai:inline-wasm-module",
  enforce: "pre" as const,
  applyToEnvironment: (env: { name: string }) => env.name === "ssr",
  resolveId(id: string) {
    return WASM_MODULE_RE.test(id) ? `\0${id}` : null;
  },
  load(id: string) {
    if (!id.startsWith("\0") || !WASM_MODULE_RE.test(id)) return null;
    const file = require_.resolve(id.slice(1).replace(/\?module$/, ""));
    const base64 = readFileSync(file).toString("base64");
    return [
      `const b64 = ${JSON.stringify(base64)};`,
      `const bin = atob(b64);`,
      `const bytes = new Uint8Array(bin.length);`,
      `for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);`,
      `export default new WebAssembly.Module(bytes);`,
    ].join("\n");
  },
};



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
    plugins: [deferWasmModuleToNitro, wasm()],
    ssr: { noExternal: ["workers-og"] },
    optimizeDeps: { exclude: ["workers-og"] },


  },
});
