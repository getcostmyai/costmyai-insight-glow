#!/usr/bin/env bun
/**
 * Check 1 — stale-deploy detector.
 *
 * Asks one question the deploy log cannot answer: is the code being served
 * right now built from the code in this tree? It recomputes the build
 * fingerprint locally and compares it against `/api/public/build-info` on the
 * published site and the preview site.
 *
 * Exit code 0 means both deployments match. Exit code 1 means at least one is
 * serving something else — the exact failure that made three separate "fixed"
 * dispatches look broken in production.
 *
 *   bun scripts/audit/stale-deploy.ts
 *   bun scripts/audit/stale-deploy.ts --published-only
 */
import { computeFingerprint, gitHead } from "./fingerprint.mjs";

const TARGETS = [
  { name: "published", url: "https://costmyai-insight-glow.lovable.app" },
  {
    name: "preview",
    url: "https://project--e64eb6e2-38b5-4107-b0fb-2e2b0ab7a1d4-dev.lovable.app",
  },
];

interface BuildInfo {
  fingerprint: string | null;
  files: number | null;
  commit: string | null;
  builtAt: string | null;
}

async function readBuildInfo(base: string): Promise<BuildInfo | { error: string }> {
  try {
    const res = await fetch(`${base}/api/public/build-info`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return (await res.json()) as BuildInfo;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

const local = computeFingerprint(process.cwd());
const head = gitHead(process.cwd());
const only = process.argv.includes("--published-only") ? ["published"] : null;

console.log("Stale-deploy detector");
console.log("---------------------");
console.log(`local fingerprint : ${local.fingerprint}  (${local.files} files)`);
console.log(`local commit      : ${head.short ?? "unknown"}  ${head.subject ?? ""}`);
console.log(`committed at      : ${head.committedAt ?? "unknown"}`);
console.log("");

let stale = false;
for (const target of TARGETS) {
  if (only && !only.includes(target.name)) continue;
  const info = await readBuildInfo(target.url);
  if ("error" in info) {
    stale = true;
    console.log(`${target.name.padEnd(10)} UNREACHABLE  ${info.error}`);
    continue;
  }
  if (!info.fingerprint) {
    stale = true;
    console.log(
      `${target.name.padEnd(10)} NO FINGERPRINT  deployment predates the detector — redeploy to arm it`,
    );
    continue;
  }
  const match = info.fingerprint === local.fingerprint;
  if (!match) stale = true;
  console.log(
    `${target.name.padEnd(10)} ${match ? "MATCH " : "STALE "} served=${info.fingerprint} commit=${
      info.commit?.slice(0, 7) ?? "unknown"
    } built=${info.builtAt ?? "unknown"}`,
  );
  if (!match) {
    console.log(
      `${" ".repeat(11)}       the live bundle was not built from this tree — publish before trusting any check against it`,
    );
  }
}

console.log("");
console.log(stale ? "RESULT: STALE — do not verify behaviour against these URLs yet." : "RESULT: current.");
process.exit(stale ? 1 : 0);
