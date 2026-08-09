FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /app

# deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# build (typecheck + compile check, no emit today but validates)
FROM deps AS build
RUN pnpm typecheck
# future: pnpm build when tsc emit is enabled
# Uncomment when dist/ is produced:
# RUN pnpm -r build

# runtime
FROM node:20-slim AS runtime
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /app
COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY scripts ./scripts
COPY fixtures ./fixtures
COPY examples ./examples

# cox runs via tsx in v0.1 (source mode); for prod binary, add `pnpm build` and change to node dist
ENV NODE_ENV=production
ENTRYPOINT ["pnpm", "cox"]
CMD ["--help"]

LABEL org.opencontainers.image.source="https://github.com/chendren/coxswain"
LABEL org.opencontainers.image.description="Coxswain CXOS - spec-driven coding agent"
