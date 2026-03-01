FROM node:24.11-alpine AS base
WORKDIR /app

# 1. Install dependencies and build app
FROM base AS builder
RUN apk add --no-cache libc6-compat python3 make g++
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
ENV NODE_ENV=production
RUN IS_NEXT_BUILD=1 npm run build
RUN rm -rf .next/cache

# 2. Install only the packages nft misses
FROM base AS server-runtime
RUN apk add --no-cache libc6-compat python3 make g++
COPY package-lock.json ./
RUN echo '{"name":"runtime","private":true,"dependencies":{"y-leveldb":"*","kysely":"*","nanoid":"*"}}' > package.json \
    && npm install --no-audit --no-fund

# 3. Production image
FROM base AS runner
ENV NODE_ENV=production
RUN apk add --no-cache tini curl su-exec shadow
RUN adduser -D -u 1001 appuser \
    && mkdir -p /app/storage/avatars /app/storage/yjs /app/storage/uploads \
    && mkdir -p /app/.next/cache \
    && chown -R appuser:appuser /app/storage /app/.next/cache

# standalone already contains the nft-traced node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=server-runtime /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/next ./node_modules/next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/app/i18n ./src/app/i18n
COPY --from=builder /app/src/app/db/migrations ./src/app/db/migrations
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "dist/server.cjs"]
