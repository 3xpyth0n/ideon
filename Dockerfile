FROM node:24.11-alpine AS base
RUN apk add --no-cache libc6-compat

# 1. Install all dependencies (for building)
FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# 2. Install production dependencies (for running)
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# 3. Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN IS_NEXT_BUILD=1 npm run build
RUN rm -rf .next/standalone .next/cache

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS='--max-old-space-size=8192'
ENV HOSTNAME="0.0.0.0"
# Install tini for better signal handling, curl for healthchecks and su-exec for permission management
RUN apk add --no-cache curl tini su-exec
RUN adduser -D -u 1001 appuser && \
    mkdir -p storage/avatars storage/yjs storage/uploads && \
    chown -R appuser:appuser storage
# Copy pruned node_modules from prod-deps
COPY --from=prod-deps --chown=appuser:appuser /app/node_modules ./node_modules
# Copy build artifacts
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/.next ./.next
COPY --from=builder --chown=appuser:appuser /app/public ./public
COPY --from=builder --chown=appuser:appuser /app/package.json ./package.json
COPY --from=builder --chown=appuser:appuser /app/src/app/i18n ./src/app/i18n

# Copy entrypoint script and make it executable
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

# Use tini as entrypoint for proper signal forwarding and entrypoint script for permission management
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "dist/server.cjs"]
