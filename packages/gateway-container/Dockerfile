# CostMyAI metadata connector.
#
# Build context is the REPOSITORY ROOT, not this directory: the container
# mirrors its endpoint contract from src/lib/ingest/contract.ts so a renamed
# route cannot silently drift away from the thing that calls it.
#
#   docker build -f packages/gateway-container/Dockerfile -t ghcr.io/getcostmyai/gateway:v1.0.0 -t ghcr.io/getcostmyai/gateway:v1 .
FROM node:22-alpine AS build
WORKDIR /build
COPY packages/gateway-container/package.json packages/gateway-container/tsconfig.json ./packages/gateway-container/
COPY packages/gateway-container/src ./packages/gateway-container/src
COPY src/lib/ingest/contract.ts src/lib/ingest/backfill.ts ./src/lib/ingest/
# NodeNext picks a module format per file from the NEAREST package.json. The
# gateway package declares "type": "module", but the shared src/lib/ingest
# sources sit above it, and in this build context nothing above them declares
# a type — so tsc emitted them as CommonJS while the rest of the image was ESM,
# and the published v1 image died at startup with "does not provide an export
# named 'CONTAINER_DEFAULTS'" (Dispatch 109). It passed locally only because the
# repo root package.json supplies "type": "module"; the image build has no root
# package.json at all. This marker restores that, explicitly.
RUN printf '{"type":"module"}\n' > /build/package.json
# The compiler and Node's type definitions are devDependencies of the package,
# so the image build gets the exact same versions the repo pins. Without
# @types/node here, tsc fails with TS2688 "Cannot find type definition file for 'node'".
RUN cd packages/gateway-container \
  && npm install --no-audit --no-fund \
  && npx tsc -p tsconfig.json \
  && rm -rf node_modules
# A compile that succeeds is not a container that boots: the failure above was
# invisible to tsc. Import the real entrypoint graph in the build so a module
# format regression fails the build instead of the customer's first pull.
# `isEntrypoint` is false under -e, so this loads every module without listening.
RUN cd packages/gateway-container \
  && node --input-type=module \
    -e "await import('./dist/packages/gateway-container/src/index.js'); console.log('boot smoke test: entrypoint graph loaded');"

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Dispatch 233. The one difference between the v1 and v2 images.
#
# v1 is built with the default below (empty → local classification OFF) and is
# byte-for-byte the posture it has always had. v2 is built with
# `--build-arg CLASSIFY_LOCAL_DEFAULT=true`, which bakes the ON default into
# THAT TAG ONLY. A customer's own COSTMYAI_CLASSIFY_LOCAL still overrides this
# in either direction, so `-e COSTMYAI_CLASSIFY_LOCAL=false` on v2 is a real
# opt-out and `=true` on v1 remains a no-op only because v1's binary predates
# the classifier entirely.
ARG CLASSIFY_LOCAL_DEFAULT=""
ENV COSTMYAI_CLASSIFY_LOCAL_DEFAULT=$CLASSIFY_LOCAL_DEFAULT
COPY --from=build /build/packages/gateway-container/dist ./dist
COPY packages/gateway-container/package.json ./package.json

# The spool lives on a mounted volume; without one, a restart loses the queue.
VOLUME ["/var/lib/costmyai/spool"]
EXPOSE 8787
# Non-root: the proxy needs nothing but the spool directory.
RUN mkdir -p /var/lib/costmyai/spool && chown -R node:node /var/lib/costmyai
USER node
ENTRYPOINT ["node", "dist/packages/gateway-container/src/index.js"]
