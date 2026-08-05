#!/usr/bin/env bun
/**
 * Standing check — is the connector image Robin publishes actually published?
 *
 * The quickstart a customer copies (Settings page and the package README, both
 * rendered from CONTAINER_DEFAULTS) names one exact image reference. If that
 * reference is not anonymously pullable, every customer's first command fails
 * with "manifest unknown" and the product looks broken at the first step.
 *
 * So this asks the real registry, anonymously — the same way a stranger's
 * Docker daemon asks — rather than trusting a local build cache.
 *
 *   bun scripts/audit/image-published.ts
 */
import { CONTAINER_DEFAULTS, containerImageRef } from "../../src/lib/ingest/contract";

const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

interface Probe {
  ref: string;
  ok: boolean;
  status: number;
  digest: string | null;
  detail: string;
}

/**
 * Anonymous pull, by the registry's own protocol: fetch a pull token for the
 * repository, then HEAD the manifest. A private image yields a token that the
 * manifest endpoint then rejects — which is exactly the failure a customer
 * would hit, and is reported as unpublished rather than as a network blip.
 */
async function probe(registry: string, repository: string, tag: string): Promise<Probe> {
  const ref = `${registry}/${repository}:${tag}`;
  try {
    const tokenRes = await fetch(
      `https://${registry}/token?scope=${encodeURIComponent(`repository:${repository}:pull`)}&service=${registry}`,
    );
    const token = tokenRes.ok ? ((await tokenRes.json()) as { token?: string }).token : undefined;

    const res = await fetch(`https://${registry}/v2/${repository}/manifests/${encodeURIComponent(tag)}`, {
      method: "HEAD",
      headers: {
        Accept: MANIFEST_TYPES,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return {
      ref,
      ok: res.ok,
      status: res.status,
      digest: res.headers.get("docker-content-digest"),
      detail: res.ok
        ? "anonymously pullable"
        : res.status === 401 || res.status === 403
          ? "registry refuses anonymous pull — the package is private, or does not exist"
          : res.status === 404
            ? "no such tag in the registry"
            : `registry answered ${res.status}`,
    };
  } catch (error) {
    return {
      ref,
      ok: false,
      status: 0,
      digest: null,
      detail: `could not reach the registry: ${(error as Error).message}`,
    };
  }
}

function split(image: string): { registry: string; repository: string } {
  const [registry, ...rest] = image.split("/");
  return { registry: registry!, repository: rest.join("/") };
}

const { registry, repository } = split(CONTAINER_DEFAULTS.image);

/**
 * The tag the quickstart names is the one that has to work. The pinned release
 * tag is checked too: `v1` moving without an immutable `vX.Y.Z` behind it
 * leaves no way to say which build a customer is actually running.
 */
const PINNED = process.env["CONNECTOR_RELEASE_TAG"] ?? "v1.0.1";

const results = [
  await probe(registry, repository, CONTAINER_DEFAULTS.tag),
  await probe(registry, repository, PINNED),
];

console.log(`Connector image, as a stranger's Docker daemon sees it\n`);
for (const r of results) {
  console.log(`${r.ok ? "PUBLISHED " : "MISSING   "} ${r.ref}`);
  console.log(`           ${r.detail}`);
  if (r.digest) console.log(`           ${r.digest}`);
}

const quickstart = results[0]!;
console.log(`\nQuickstart reference: ${containerImageRef()}`);

if (!quickstart.ok) {
  console.log(
    "\nRESULT: the image in the customer-facing quickstart is not pullable." +
      "\n        Publish it (packages/gateway-container/README.md, 'Publishing the image')" +
      "\n        or this is the first command every new customer runs and fails.",
  );
  process.exit(1);
}

if (!results[1]!.ok) {
  console.log(
    `\nRESULT: ${quickstart.ref} is live, but the pinned release tag ${PINNED} is not.` +
      "\n        A moving tag with nothing immutable behind it cannot identify a build.",
  );
  process.exit(1);
}

/**
 * Pullable is NOT the same as runnable.
 *
 * Dispatch 109: v1 was anonymously pullable and this check said so, while the
 * image it was blessing died on startup for every customer who pulled it — the
 * shared contract module had been emitted as CommonJS into an ESM entrypoint.
 * A registry HEAD can never see that. So the check now pulls the real layers
 * and imports the real entrypoint graph out of the real published filesystem.
 */
async function bootCheck(tag: string): Promise<{ ok: boolean; detail: string }> {
  const { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const work = mkdtempSync(join(tmpdir(), "costmyai-boot-"));
  const rootfs = join(work, "rootfs");
  mkdirSync(rootfs, { recursive: true });
  try {
    const tokenRes = await fetch(
      `https://${registry}/token?scope=${encodeURIComponent(`repository:${repository}:pull`)}&service=${registry}`,
    );
    const token = ((await tokenRes.json()) as { token?: string }).token;
    const auth = { Accept: MANIFEST_TYPES, ...(token ? { Authorization: `Bearer ${token}` } : {}) };

    const get = async (reference: string) =>
      (await (await fetch(`https://${registry}/v2/${repository}/manifests/${reference}`, { headers: auth })).json()) as {
        manifests?: { digest: string; platform?: { os?: string; architecture?: string } }[];
        layers?: { digest: string }[];
      };

    let manifest = await get(encodeURIComponent(tag));
    if (manifest.manifests?.length) {
      // Multi-arch index: take the linux/amd64 image, the one a server pulls.
      const picked =
        manifest.manifests.find((m) => m.platform?.os === "linux" && m.platform?.architecture === "amd64") ??
        manifest.manifests[0]!;
      manifest = await get(picked.digest);
    }
    if (!manifest.layers?.length) return { ok: false, detail: "manifest carries no layers" };

    for (const [i, layer] of manifest.layers.entries()) {
      const blob = await fetch(`https://${registry}/v2/${repository}/blobs/${layer.digest}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!blob.ok) return { ok: false, detail: `layer ${i} not pullable (${blob.status})` };
      const file = join(work, `layer-${i}.tar.gz`);
      writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
      execFileSync("tar", ["-xf", file, "-C", rootfs], { stdio: "ignore" });
    }

    const entry = join(rootfs, "app/dist/packages/gateway-container/src/index.js");
    if (!existsSync(entry)) return { ok: false, detail: `entrypoint missing from the image at ${entry.replace(rootfs, "")}` };

    // `isEntrypoint` is false under -e, so the whole graph loads without binding a port.
    const out = execFileSync(
      "node",
      ["--input-type=module", "-e", `await import(${JSON.stringify(entry)}); console.log("loaded");`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
    );
    return { ok: out.includes("loaded"), detail: "entrypoint graph loads from the published filesystem" };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    const why = (err.stderr ?? err.message ?? String(error)).trim().split("\n").slice(0, 4).join(" | ");
    return { ok: false, detail: `the published image does not start: ${why}` };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.env["AUDIT_SKIP_BOOT"] === "1") {
  console.log("\nboot check skipped (AUDIT_SKIP_BOOT=1) — pullability alone was verified.");
} else {
  const boot = await bootCheck(CONTAINER_DEFAULTS.tag);
  console.log(`\n${boot.ok ? "BOOTS     " : "BROKEN    "} ${quickstart.ref}`);
  console.log(`           ${boot.detail}`);
  if (!boot.ok) {
    console.log(
      "\nRESULT: the published image is pullable but does NOT run." +
        "\n        Every customer's first command would succeed at the pull and fail at the start." +
        "\n        Rebuild and republish (packages/gateway-container/README.md).",
    );
    process.exit(1);
  }
}

console.log("\nRESULT: the published image matches what the quickstart tells customers to run, and it starts.");

