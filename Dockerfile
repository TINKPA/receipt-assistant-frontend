# syntax=docker/dockerfile:1.6
#
# Multi-stage build for receipt-assistant-frontend.
#
#   builder  — installs full deps, runs `vite build` → /app/dist/
#   runtime  — nginx:alpine serving /usr/share/nginx/html with a
#              /api/* → $BACKEND_URL proxy. SPA fallback to index.html.
#
# Build artifacts are produced INSIDE the image (no `COPY dist/` from
# host). See project CLAUDE.md — a stale host `dist/` once shipped
# pre-PR code to production.

# ---- Stage 1: builder ----
FROM node:22-bookworm AS builder

WORKDIR /app

# Vite inlines VITE_* env vars into the JS bundle at build time, so
# they MUST be present in the builder stage env. Empty default is fine
# — the frontend gates its map block on the key being truthy and
# simply hides the block otherwise (see ReceiptDetail.tsx).
ARG VITE_GOOGLE_MAPS_API_KEY=
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

# Install deps first (cached layer as long as package*.json is unchanged)
COPY package.json package-lock.json ./
RUN npm ci

# Copy everything the build needs. Keep this list explicit so that the
# build context stays predictable (see .dockerignore for the blocklist).
COPY tsconfig.json vite.config.ts eslint.config.js index.html ./
COPY src/ ./src/

RUN npm run build

# ---- Stage 2: runtime ----
FROM nginx:1.27-alpine AS runtime

# `wget` is already in the base image (busybox applet); used by HEALTHCHECK.
# `envsubst` ships via `gettext` so we can template $BACKEND_URL at start.
RUN apk add --no-cache gettext

# Static bundle from the builder stage.
COPY --from=builder /app/dist/ /usr/share/nginx/html/

# nginx template — $BACKEND_URL is substituted at container start by the
# default nginx entrypoint (/docker-entrypoint.d/20-envsubst-on-templates.sh).
COPY nginx.conf /etc/nginx/templates/default.conf.template

ENV BACKEND_URL=http://host.docker.internal:3000
# Only expand our var — otherwise nginx directives like $uri / $scheme
# would be stripped.
ENV NGINX_ENVSUBST_TEMPLATE_SUFFIX=.template
ENV NGINX_ENVSUBST_FILTER=BACKEND_URL

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ | grep -qi '<!DOCTYPE' || exit 1
