import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Hard deadline for a single public Data API request.
 *
 * A page render is allowed to wait on the database, but not forever. When the
 * Data API is degraded (for example PGRST002, "could not query the database
 * for the schema cache"), it holds the socket open and retries internally,
 * which turns a slow backend into a document request that never answers at
 * all. 3s matches the render deadline already used in brand/render.server.ts
 * and stays well inside any reasonable page budget: past it we fail fast and
 * let the caller degrade.
 */
export const PUBLIC_DB_TIMEOUT_MS = 3000;

/**
 * Publishable-key Supabase client for server-side reads of public data.
 * RLS still applies as `anon`, so this can only ever see rows an anon policy allows.
 */
export function createPublicServerClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // sb_publishable_* keys are opaque, not JWTs — PostgREST rejects them as bearer tokens.
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PUBLIC_DB_TIMEOUT_MS);
        // A caller-supplied signal still wins: aborting it aborts ours too.
        const caller = init?.signal;
        const onCallerAbort = () => controller.abort();
        caller?.addEventListener("abort", onCallerAbort);

        try {
          return await fetch(input, { ...init, headers, signal: controller.signal });
        } catch (err) {
          if (controller.signal.aborted && !caller?.aborted) {
            throw new Error(`Data API request timed out after ${PUBLIC_DB_TIMEOUT_MS}ms`);
          }
          throw err;
        } finally {
          clearTimeout(timer);
          caller?.removeEventListener("abort", onCallerAbort);
        }
      },
    },
  });
}

export const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";
