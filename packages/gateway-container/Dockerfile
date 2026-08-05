# CostMyAI metadata connector.
#
# Build context is the REPOSITORY ROOT, not this directory: the container
# mirrors its endpoint contract from src/lib/ingest/contract.ts so a renamed
# route cannot silently drift away from the thing that calls it.
#
#   docker build -f packages/gateway-container/Dockerfile -t ghcr.io/costmyai/gateway:v1 .
FROM node:22-alpine AS build
WORKDIR /build
COPY packages/gateway-container/package.json packages/gateway-container/tsconfig.json ./packages/gateway-container/
COPY packages/gateway-container/src ./packages/gateway-container/src
COPY src/lib/ingest/contract.ts ./src/lib/ingest/contract.ts
RUN npm i -g typescript@5.9.2 \
  && cd packages/gateway-container \
  && tsc -p tsconfig.json

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
