# syntax=docker/dockerfile:1

# React + Vite is a static SPA - it builds once into plain HTML/JS/CSS, so the runtime image is
# just nginx serving that output. No Node process runs in the final container.
#
# IMPORTANT: Vite bakes VITE_API_BASE into the JS bundle at BUILD time, not read at container
# start. The default below (http://localhost:3000) matches how this app already expects to run
# locally - the browser (not the container) is what calls this URL, so as long as the backend's
# port is published to the same host the browser is on, the default just works. Override via
# `docker compose build --build-arg VITE_API_BASE=https://your-backend-host:3000` (or the
# VITE_API_BASE variable in docker-compose.yml) only if the backend is reachable at a different
# host/port than the machine running the browser.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
# Cache mount: persists pnpm's store across build attempts on the host, so a build killed
# partway (OOM, a dropped connection) doesn't force a full re-download from zero on retry.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
ARG VITE_API_BASE=http://localhost:3000
ENV VITE_API_BASE=${VITE_API_BASE}
RUN pnpm build

FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
