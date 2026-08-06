#!/usr/bin/env bun
/**
 * Standing check — can a stranger's first container actually deliver anything?
 *
 * Dispatch 124 found that every quickstart, README and generated `docker run`
 * named `COSTMYAI_BASE_URL=https://app.costmyai.com`, a hostname with no DNS
 * record at all. A container started with it proxies inference perfectly and
 * spools metadata to disk forever: no error the customer would notice, no
 * events on the dashboard, and nothing in the test suite caught it because
 * every internal test pointed the container at a local server.
 *
 * So this check does the one thing those tests could not: it resolves and calls
 * the real, published address the copy-paste actually contains, the same way a
 * customer's container would.
 *
 *   bun scripts/audit/onboarding.ts
 */
import {
  CONTAINER_DEFAULTS,
  INGEST_PATHS,
  PROVIDER_PRESETS,
  dockerRunSnippet,
  sdkBaseUrl,
} from "../../src/lib/ingest/contract";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

const base = CONTAINER_DEFAULTS.appUrl.replace(/\/+$/, "");

/** The address in the copy-paste has to be a real, reachable deployment. */
async function baseUrlResolves(): Promise<void> {
  try {
    const res = await fetch(`${base}/api/public/build-info`, {
      signal: AbortSignal.timeout(20_000),
    });
    const body = res.ok ? ((await res.json()) as { commit?: string; builtAt?: string }) : null;
    record(
      "base URL resolves",
      res.ok,
      res.ok
        ? `${base} — deployed ${body?.builtAt ?? "?"} (${(body?.commit ?? "?").slice(0, 8)})`
        : `${base} answered ${res.status}`,
    );
  } catch (err) {
    record(
      "base URL resolves",
      false,
      `${base} is unreachable (${err instanceof Error ? err.message : String(err)}). Every quickstart names it; a customer's container would spool forever.`,
    );
  }
}

/**
 * The ingest route must exist and must refuse an unauthenticated push. A 404
 * means the container's path drifted; a 200 would mean anyone can write to a
 * customer's workspace.
 */
async function ingestRouteLive(): Promise<void> {
  for (const [label, path] of Object.entries(INGEST_PATHS)) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ v: 1, events: [] }),
        signal: AbortSignal.timeout(20_000),
      });
      const ok = res.status === 401 || res.status === 403;
      record(
        `${label} endpoint live and authenticated`,
        ok,
        `${path} → ${res.status}${ok ? " (refuses an unauthenticated push, as it must)" : res.status === 404 ? " — route missing; the container would post into the void" : " — expected 401/403"}`,
      );
    } catch (err) {
      record(
        `${label} endpoint live and authenticated`,
        false,
        `${path} unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** The pasted command must carry the same base URL this check just proved. */
function snippetCarriesLiveBaseUrl(): void {
  const snippet = dockerRunSnippet("cma_live_example");
  record(
    "docker run snippet uses the live base URL",
    snippet.includes(`${CONTAINER_DEFAULTS.env.baseUrl}=${base}`),
    `snippet sets ${CONTAINER_DEFAULTS.env.baseUrl} to the audited address`,
  );
}

/**
 * Per-provider SDK base URLs. An Anthropic client appending `/v1/messages` to
 * a base that already ends in `/v1` gets a 404 from Anthropic that reads like a
 * broken proxy, so the pairing is asserted rather than assumed.
 */
function presetsWellFormed(): void {
  const ids = new Set<string>();
  const ports = new Set<number>();
  let ok = true;
  const notes: string[] = [];
  for (const preset of PROVIDER_PRESETS) {
    if (ids.has(preset.id) || ports.has(preset.port)) {
      ok = false;
      notes.push(`${preset.id}: duplicate id or port ${preset.port}`);
    }
    ids.add(preset.id);
    ports.add(preset.port);
    const url = sdkBaseUrl(preset);
    if (!preset.verifyPath.startsWith(preset.sdkPath || "/")) {
      ok = false;
      notes.push(`${preset.id}: verify path ${preset.verifyPath} is not under ${url}`);
    }
    if (!preset.upstream.startsWith("https://")) {
      ok = false;
      notes.push(`${preset.id}: upstream is not https`);
    }
    notes.push(`${preset.label}: ${preset.sdkEnv}=${url} → ${preset.upstream}`);
  }
  record("provider presets well formed", ok, notes.join("; "));
}

await baseUrlResolves();
await ingestRouteLive();
snippetCarriesLiveBaseUrl();
presetsWellFormed();

console.log("=== onboarding path ===\n");
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}\n      ${check.detail}`);
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${failed.length ? `FAILED: ${failed.map((c) => c.name).join(", ")}` : "Every check passed."}`);
process.exit(failed.length ? 1 : 0);
