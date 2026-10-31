FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/sync-core/package.json packages/sync-core/package.json
COPY packages/live-core/package.json packages/live-core/package.json
COPY packages/plugin/package.json packages/plugin/package.json
COPY packages/shared-testkit/package.json packages/shared-testkit/package.json
COPY tests/package.json tests/package.json

RUN npm ci

COPY apps/worker apps/worker
COPY packages packages
RUN npm run build -w @vaultbridge/worker

ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "apps/worker/dist/server.mjs"]
