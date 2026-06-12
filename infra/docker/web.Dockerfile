# syntax=docker/dockerfile:1
# =============================================================================
# Smart Grocery AI — Web image (Next.js 15, standalone output)
# Build from the REPO ROOT:  docker build -f infra/docker/web.Dockerfile .
# Requires `output: "standalone"` in apps/web/next.config.ts.
# =============================================================================

# ---- Stage 1: deps -----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces --include-workspace-root

# ---- Stage 2: build ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# NEXT_PUBLIC_* values are inlined at build time — pass them as build args.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
# npm nests workspace-local deps (next-auth/@auth/core) under apps/web —
# the root node_modules copy above does not include them.
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# shared must be built first — web imports @smart-grocery/shared from dist
RUN npm run build -w packages/shared && npm run build -w apps/web

# ---- Stage 3: runner ---------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Next standalone preserves the monorepo layout: server.js lives at apps/web/
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
