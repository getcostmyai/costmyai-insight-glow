import { createFileRoute } from "@tanstack/react-router";

/**
 * What this deployment was built from.
 *
 * Values are baked in at build time by `vite.config.ts`, so they describe the
 * bundle actually being served rather than whatever the server can read from
 * disk. The stale-deploy detector (`scripts/audit/stale-deploy.ts`) recomputes
 * the same fingerprint from the working tree and compares.
 *
 * Nothing here is sensitive: a commit hash and a content hash, no paths, no
 * environment, no data.
 */
declare const __BUILD_FINGERPRINT__: string;
declare const __BUILD_FILES__: number;
declare const __BUILD_COMMIT__: string | null;
declare const __BUILD_TIME__: string;

export const Route = createFileRoute("/api/public/build-info")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            fingerprint: typeof __BUILD_FINGERPRINT__ === "string" ? __BUILD_FINGERPRINT__ : null,
            files: typeof __BUILD_FILES__ === "number" ? __BUILD_FILES__ : null,
            commit: typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : null,
            builtAt: typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : null,
          },
          { headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
