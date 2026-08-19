#!/usr/bin/env bash
# Docker-parity build for packages/gateway-container.
#
# The vitest suite compiles nothing the way the image does: it runs under the
# repo root tsconfig (bundler resolution, vitest types present, every src/ file
# reachable). The image build sees only the files the Dockerfile COPYs, installs
# with npm, and resolves with nodenext. That gap is what let Dispatch 233's v2
# publish fail on `tsc ... exit code 2` with a green local suite.
#
# This script reproduces the image build exactly: same COPY set, same
# "type": "module" marker, same `npm install` + `npx tsc` + boot smoke test.
# It needs no Docker daemon, so CI and a laptop can both run it.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/packages/gateway-container" "$work/src/lib/ingest" "$work/src/lib/dashboard"

# Keep this COPY set identical to packages/gateway-container/Dockerfile.
cp "$repo/packages/gateway-container/package.json" "$repo/packages/gateway-container/tsconfig.json" \
  "$work/packages/gateway-container/"
cp -r "$repo/packages/gateway-container/src" "$work/packages/gateway-container/src"
cp "$repo/src/lib/ingest/contract.ts" "$repo/src/lib/ingest/backfill.ts" \
  "$repo/src/lib/ingest/switch-plan.ts" "$work/src/lib/ingest/"
cp "$repo/src/lib/dashboard/provider-gate.ts" "$work/src/lib/dashboard/"
printf '{"type":"module"}\n' > "$work/package.json"

cd "$work/packages/gateway-container"
npm install --no-audit --no-fund >/dev/null
npx tsc -p tsconfig.json
node --input-type=module \
  -e "await import('$work/packages/gateway-container/dist/packages/gateway-container/src/index.js');"
echo "container build parity: tsc clean, entrypoint graph loaded"
