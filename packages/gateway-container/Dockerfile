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
# The compiler and Node's type definitions are devDependencies of the package,
# so the image build gets the exact same versions the repo pins. Without
# @types/node here, tsc fails with TS2688 "Cannot find type definition file for 'node'".
RUN cd packages/gateway-container \
  && npm install --no-audit --no-fund \
  && npx tsc -p tsconfig.json \
  && rm -rf node_modules

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /build/packages/gateway-container/dist ./dist
COPY packages/gateway-container/package.json ./package.json
# The spool lives on a mounted volume; without one, a restart loses the queue.
VOLUME ["/var/lib/costmyai/spool"]
EXPOSE 8787
# Non-root: the proxy needs nothing but the spool directory.
RUN mkdir -p /var/lib/costmyai/spool && chown -R node:node /var/lib/costmyai
USER node
ENTRYPOINT ["node", "dist/packages/gateway-container/src/index.js"]
