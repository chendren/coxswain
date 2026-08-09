FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /app

# deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# build (typecheck + emit)
FROM deps AS build
COPY tsconfig.build.base.json tsconfig.build.json ./
COPY scripts ./scripts
RUN pnpm typecheck && pnpm build

# runtime
FROM node:20-slim AS runtime
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.base.json /app/tsconfig.build.base.json /app/tsconfig.build.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY scripts ./scripts
COPY fixtures ./fixtures
COPY examples ./examples

ENV NODE_ENV=production
ENTRYPOINT ["node", "packages/cli/dist/main.js"]
CMD ["--help"]

LABEL org.opencontainers.image.source="https://github.com/chendren/coxswain"
LABEL org.opencontainers.image.description="Coxswain CXOS - spec-driven coding agent"
