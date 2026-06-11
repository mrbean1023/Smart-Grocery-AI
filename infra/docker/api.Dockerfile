# syntax=docker/dockerfile:1
# =============================================================================
# Smart Grocery AI — API image (NestJS + Prisma + in-process BullMQ worker)
# Build from the REPO ROOT:  docker build -f infra/docker/api.Dockerfile .
# =============================================================================

# ---- Stage 1: deps — install the full workspace dependency tree -------------
FROM node:22-alpine AS deps
WORKDIR /app

# Only manifests first so this layer caches across source-only changes
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces --include-workspace-root

# ---- Stage 2: build — generate Prisma client, build shared then api ---------
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build -w packages/shared && npm run build -w apps/api

# ---- Stage 3: prune — fresh production-only node_modules --------------------
FROM node:22-alpine AS prune
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --omit=dev --workspaces --include-workspace-root \
    && npm cache clean --force

# ---- Stage 4: runner ---------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    API_PORT=4000

# Production node_modules (workspace symlinks preserved)
COPY --from=prune --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/api/package.json ./apps/api/

# Built shared package (target of the node_modules/@smart-grocery/shared symlink)
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist

# Compiled API + prisma schema/migrations
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node apps/api/prisma ./apps/api/prisma

# Prisma: generated client + engines + CLI (CLI is a devDependency, so the
# pruned node_modules above does not include it — copy it from the build stage
# so `npx prisma migrate deploy` resolves locally instead of hitting the network)
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=node:node /app/node_modules/prisma ./node_modules/prisma

# Entrypoint script (LF line endings required — see comment inside the script).
# --chmod avoids relying on the executable bit surviving a Windows checkout.
COPY --chmod=755 infra/docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:4000/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
