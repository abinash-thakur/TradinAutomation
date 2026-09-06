# syntax=docker/dockerfile:1

# NestJS backend. Debian slim (not alpine) because the dependency tree includes native
# modules - sqlite3 and bufferutil are optional peers of TypeORM/socket.io that pnpm builds
# from source (see pnpm-workspace.yaml allowBuilds) - and those are far more reliable against
# glibc than musl. The app itself only uses the `pg` driver; sqlite3 is never imported at
# runtime, but it still has to compile cleanly for `pnpm install` to succeed.

FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

# ---- deps: install once with dev deps, needed to run `nest build` ----
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build: compile TypeScript -> dist/ ----
FROM deps AS build
COPY . .
RUN pnpm build

# ---- prod-deps: same install, production dependencies only (smaller final image) ----
FROM base AS prod-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/main"]
