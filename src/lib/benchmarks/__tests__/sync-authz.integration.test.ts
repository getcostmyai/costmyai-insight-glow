/**
 * Phase 5 Tier 1 PARTIAL #3 (Deming): runBenchmarkSync().
 *
 * The auth logic re-derives the actor from the bearer token via the real
 * `is_platform_admin` RPC rather than trusting a caller-supplied workspace id —
 * the right pattern, per Deming's read of the source. But nothing asserted a
 * non-admin actually gets refused and an admin actually gets through. That gate
 * lives entirely inside `requireSupabaseAuth` + a real Postgres RPC that reads
 * `auth.uid()` and the `platform_admins` table — there is no way to fake that
 * meaningfully without a real Supabase project, so this is a real
 * `.integration.test.ts`: real users, a real JWT each, the real
 * `is_platform_admin` RPC, and the real `runBenchmarkSync` server function
 * invoked through the framework's own request-context machinery
 * (`requestHandler`), exactly like a live request would be.
 *
 * `syncArtificialAnalysis` itself is mocked out for the admin-success case only
 * — this file proves the AUTHORIZATION GATE, not the sync; the sync's own
 * orchestration is covered for real (mocked fetch + mocked Supabase writes,
 * no live DB) in aa-sync-orchestration.test.ts. Hitting the live Artificial
 * Analysis API and writing real `benchmarks`/`benchmark_margins` rows from an
 * authz test would be its own kind of test pollution.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requestHandler } from "@tanstack/start-server-core";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL_ = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

const admin = createClient(URL_, SERVICE, {
  global: { fetch: keyFetch(SERVICE) },
  auth: { persistSession: false, autoRefreshToken: false },
});

// Fixtures never persist in the customer database — see support/isolation.ts.
guardIntegrationDatabase(admin);

const PASSWORD = "Test-Benchmark-Authz-2026!";
const stamp = Date.now();

interface Actor {
  id: string;
  email: string;
  accessToken: string;
}

async function makeActor(who: string): Promise<Actor> {
  const email = `benchmark-authz-${who}-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const client: SupabaseClient = createClient(URL_, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const accessToken = signedIn.data.session?.access_token;
  if (!accessToken) throw new Error(`no access token minted for ${email}`);
  return { id: created.data.user!.id, email, accessToken };
}

let nonAdmin: Actor;
let platformAdmin: Actor;

beforeAll(async () => {
  [nonAdmin, platformAdmin] = await Promise.all([makeActor("member"), makeActor("admin")]);
  await admin.from("platform_admins").insert({ user_id: platformAdmin.id, note: "test" });
}, 90_000);

afterAll(async () => {
  // Dispatch 231 discipline (see partners.integration.test.ts): the privileged
  // grant is dropped first and verified by read-back, never left to a
  // best-effort cascade.
  try {
    await admin.from("platform_admins").delete().eq("user_id", platformAdmin.id);
    const { data: left } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", platformAdmin.id)
      .maybeSingle();
    if (left) throw new Error(`platform_admins grant for ${platformAdmin.id} survived teardown`);
  } finally {
    for (const a of [nonAdmin, platformAdmin]) await admin.auth.admin.deleteUser(a.id);
  }
}, 90_000);

/**
 * Runs `runBenchmarkSync()` for real, inside a real framework request context
 * carrying the given bearer token — the same AsyncLocalStorage-backed context
 * `requireSupabaseAuth`'s `getRequest()` reads from on a live request.
 *
 * Same mechanism as partner-apply-e2e.integration.test.ts: `requestHandler`
 * alone does NOT install that storage context under vitest, so the call is
 * wrapped in `runWithStartContext`, and the SERVER half of the server function
 * (`*_createServerFn_handler`, from the `?tss-serverfn-split` virtual module)
 * is invoked directly — the client stub would attempt a network RPC. The
 * middleware chain, `requireSupabaseAuth` and the handler body all run for
 * real; only the browser→worker network hop is absent.
 *
 * Returns a plain descriptor so a thrown 403 `Response` is observable instead
 * of escaping into the framework's own error serialization.
 */
type SyncOutcome =
  | { outcome: "ok"; runId: string }
  | { outcome: "response"; status: number }
  | { outcome: "error"; message: string };

async function attemptSync(token: string | undefined): Promise<SyncOutcome> {
  const serverFns = (await import(
    // @ts-expect-error virtual module produced by the TanStack server-fn plugin
    /* @vite-ignore */ "@/lib/benchmarks/sync.functions?tss-serverfn-split"
  )) as unknown as Record<
    string,
    (opts: {
      data?: unknown;
      context: Record<string, unknown>;
    }) => Promise<{ result?: unknown; error?: unknown }>
  >;
  const execute = serverFns["runBenchmarkSync_createServerFn_handler"]!;

  const request = new Request("https://www.costmyai.com/_serverFn/runBenchmarkSync", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  const describeFailure = (err: unknown): SyncOutcome =>
    err instanceof Response
      ? { outcome: "response", status: err.status }
      : { outcome: "error", message: err instanceof Error ? err.message : String(err) };

  const handler = requestHandler(async () =>
    runWithStartContext({ contextAfterGlobalMiddlewares: {}, request } as never, async () => {
      try {
        const out = await execute({ context: {} });
        if (out.error) return Response.json(describeFailure(out.error));
        const report = out.result as { runId: string };
        return Response.json({ outcome: "ok", runId: report.runId });
      } catch (err) {
        return Response.json(describeFailure(err));
      }
    }),
  );

  const response = await handler(request, {} as never);
  return (await (response as Response).json()) as SyncOutcome;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("runBenchmarkSync() is gated by the real is_platform_admin RPC", () => {
  it("refuses a signed-in caller who is not a platform admin", async () => {
    const result = await attemptSync(nonAdmin.accessToken);
    expect(result.outcome).toBe("response");
    expect((result as { status: number }).status).toBe(403);
  });

  it("refuses a request with no bearer token at all", async () => {
    const result = await attemptSync(undefined);
    // requireSupabaseAuth throws a plain Error (no Authorization header),
    // never reaching the RPC — still a refusal, just earlier in the chain.
    expect(result.outcome).not.toBe("ok");
  });

  it("lets a real platform admin through to the sync", async () => {
    vi.doMock("../aa-sync.server", () => ({
      syncArtificialAnalysis: vi.fn(async () => ({
        runId: "aa-authz-test-run",
        fetchedModels: 0,
        matchedModels: [],
        unmatchedModels: [],
        scoresWritten: 0,
        latenciesWritten: 0,
        hostRowsWithLatency: 0,
        marginsWritten: [],
        chosenEvals: [],
        skipped: [],
        fixturesRetired: 0,
      })),
    }));

    const result = await attemptSync(platformAdmin.accessToken);
    expect(result).toEqual({ outcome: "ok", runId: "aa-authz-test-run" });
  });
});
