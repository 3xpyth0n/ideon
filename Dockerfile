FROM node:24.11-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
# Mount cache to speed up subsequent builds
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:24.11-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN IS_NEXT_BUILD=1 npm run build

FROM node:24.11-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# Reuse built modules from deps and prune dev dependencies
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev

FROM node:24.11-alpine AS runner
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS='--max-old-space-size=8192'
ENV HOSTNAME="0.0.0.0"

RUN apk add --no-cache curl

RUN adduser -D -u 1001 appuser && \
    mkdir -p storage/avatars storage/yjs storage/uploads && \
    chown -R appuser:appuser storage

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

USER appuser
EXPOSE 3000

# Run node directly for better signal handling
CMD ["node", "dist/server.cjs"]
