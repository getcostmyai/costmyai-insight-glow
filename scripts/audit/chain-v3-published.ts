#!/usr/bin/env bun
/**
 * Chain Drill Co, re-run against the PUBLISHED v3 image — not the local tree.
 *
 * Every earlier classification proof ran the source in this repo. That proves
 * the code works; it does not prove the artifact a customer pulls works. So
 * this pulls the real `v3` layers out of GHCR anonymously, unpacks the real
 * filesystem, and starts the real published entrypoint **with the image's own
 * baked config Env** — which is the only reason remote classification turns on
 * here at all. Nothing in this script sets COSTMYAI_CLASSIFY_*.
 *
 * Then it drives real Anthropic traffic through it and reads the labels back
 * out of what the container actually queued.
 *
 *   ANTHROPIC_API_KEY=... bun scripts/audit/chain-v3-published.ts [n]
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTAINER_DEFAULTS } from "../../src/lib/ingest/contract";

const TAG = process.env["CHAIN_TAG"] ?? CONTAINER_DEFAULTS.remoteClassifyingTag;
const TOKEN = process.env["CHAIN_INGEST_TOKEN"] ?? "cma_live_ee8a2f22505a4530c01eacc238754f7d795cf160e975a48f";
const BASE_URL = process.env["CHAIN_BASE_URL"] ?? "http://127.0.0.1:8080";
const PORT = Number(process.env["CHAIN_PORT"] ?? 8899);
const N = Number(process.argv[2] ?? 24);
const MODEL = process.env["CHAIN_MODEL"] ?? "claude-opus-4-5";

const [registry, ...rest] = CONTAINER_DEFAULTS.image.split("/");
const repository = rest.join("/");
const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

const work = mkdtempSync(join(tmpdir(), "costmyai-v3-drill-"));
const rootfs = join(work, "rootfs");
mkdirSync(rootfs, { recursive: true });

const tokenRes = await fetch(
  `https://${registry}/token?scope=${encodeURIComponent(`repository:${repository}:pull`)}&service=${registry}`,
);
const regToken = ((await tokenRes.json()) as { token?: string }).token!;
const auth = { Accept: MANIFEST_TYPES, Authorization: `Bearer ${regToken}` };

const manifestRes = await fetch(`https://${registry}/v2/${repository}/manifests/${encodeURIComponent(TAG)}`, {
  headers: auth,
});
const indexDigest = manifestRes.headers.get("docker-content-digest");
let manifest = (await manifestRes.json()) as {
  manifests?: { digest: string; platform?: { os?: string; architecture?: string } }[];
  layers?: { digest: string }[];
  config?: { digest: string };
};
if (manifest.manifests?.length) {
  const picked =
    manifest.manifests.find((m) => m.platform?.os === "linux" && m.platform?.architecture === "amd64") ??
    manifest.manifests[0]!;
  manifest = (await (
    await fetch(`https://${registry}/v2/${repository}/manifests/${picked.digest}`, { headers: auth })
  ).json()) as typeof manifest;
}

console.log(`pulled  ${CONTAINER_DEFAULTS.image}:${TAG}`);
console.log(`digest  ${indexDigest}`);

for (const [i, layer] of (manifest.layers ?? []).entries()) {
  const blob = await fetch(`https://${registry}/v2/${repository}/blobs/${layer.digest}`, {
    headers: { Authorization: `Bearer ${regToken}` },
  });
  const file = join(work, `layer-${i}.tar.gz`);
  writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  execFileSync("tar", ["-xf", file, "-C", rootfs], { stdio: "ignore" });
}

const cfg = (await (
  await fetch(`https://${registry}/v2/${repository}/blobs/${manifest.config!.digest}`, {
    headers: { Authorization: `Bearer ${regToken}` },
  })
).json()) as { config?: { Env?: string[] } };

/** The image's OWN environment — the baked posture, exactly as `docker run` applies it. */
const bakedEnv: Record<string, string> = {};
for (const entry of cfg.config?.Env ?? []) {
  const eq = entry.indexOf("=");
  if (eq > 0) bakedEnv[entry.slice(0, eq)] = entry.slice(eq + 1);
}
console.log(
  `baked   ${CONTAINER_DEFAULTS.env.classifyLocalDefault}=${bakedEnv[CONTAINER_DEFAULTS.env.classifyLocalDefault]}` +
    `  ${CONTAINER_DEFAULTS.env.classifyRemoteDefault}=${bakedEnv[CONTAINER_DEFAULTS.env.classifyRemoteDefault]}`,
);

const entry = join(rootfs, "app/dist/packages/gateway-container/src/index.js");
if (!existsSync(entry)) {
  console.log("RESULT: published image has no entrypoint — cannot drill.");
  process.exit(1);
}

const spool = join(work, "spool");
mkdirSync(spool, { recursive: true });

const child = spawn("node", [entry], {
  env: {
    ...bakedEnv,
    PATH: process.env["PATH"]!,
    COSTMYAI_INGEST_TOKEN: TOKEN,
    COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
    COSTMYAI_BASE_URL: BASE_URL,
    COSTMYAI_SPOOL_DIR: spool,
    COSTMYAI_PORT: String(PORT),
    COSTMYAI_FLUSH_INTERVAL_MS: "4000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const logs: string[] = [];
child.stdout.on("data", (d) => logs.push(String(d)));
child.stderr.on("data", (d) => logs.push(String(d)));

for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/healthz`);
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 100));
}
console.log(`booted  container listening on ${PORT}`);

/**
 * Two prompt shapes on purpose: one the local rules recognise (code), one they
 * structurally cannot (open-ended agentic planning, the bucket that made this
 * whole dispatch necessary). The second is what the remote pass has to catch.
 */
const CODE_FILLER = Array.from(
  { length: 30 },
  (_, i) => `export function step${i}(rows: number[]): number { return rows.reduce((a, b) => a + b, 0) }`,
).join("\n");

function prompt(i: number): string {
  return i % 2 === 0
    ? `This module throws on an empty array. Fix the bug and explain it.\n\`\`\`ts\n${CODE_FILLER}\n\`\`\`\nRequest ${i}.`
    : `You are coordinating a three-week migration across four teams. Decide the order of operations, name the ` +
        `dependencies between them, and say which step you would run first and why. Request ${i}.`;
}

const headerLabels: Record<string, number> = {};
let ok = 0;
let fail = 0;

async function one(i: number) {
  const res = await fetch(`http://127.0.0.1:${PORT}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env["ANTHROPIC_API_KEY"]!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 160,
      messages: [{ role: "user", content: prompt(i) }],
    }),
  });
  const key = `${res.headers.get("x-costmyai-task") ?? "none"}${
    res.headers.get("x-costmyai-task-final") === "deferred" ? " (deferred)" : ""
  }`;
  headerLabels[key] = (headerLabels[key] ?? 0) + 1;
  await res.text();
  if (res.ok) ok++;
  else fail++;
}

const queue = Array.from({ length: N }, (_, i) => i);
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (;;) {
      const i = queue.shift();
      if (i === undefined) return;
      await one(i);
    }
  }),
);

console.log(`traffic ok=${ok} fail=${fail}`);
console.log(`headers ${JSON.stringify(headerLabels)}   (synchronous only — v3's header is not authoritative)`);

// Let the off-path remote pass land, then let the container flush on its own.
await new Promise((r) => setTimeout(r, 12_000));
child.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 2_000));
child.kill("SIGKILL");

console.log(`\ncontainer log tail:\n${logs.join("").trim().split("\n").slice(-6).join("\n")}`);
console.log(`\nworkdir kept for inspection: ${work}`);
if (process.env["CHAIN_KEEP"] !== "1") rmSync(work, { recursive: true, force: true });
