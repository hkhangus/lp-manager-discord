# syntax=docker/dockerfile:1.7

############
# Builder  #
############
FROM node:22-alpine AS builder

WORKDIR /app

# Prisma engines need OpenSSL even at install time (postinstall runs `prisma generate`).
RUN apk add --no-cache openssl libc6-compat

# Yarn 4 (Berry) is pinned in package.json `packageManager` and fetched via Corepack.
RUN corepack enable

# Install deps first for better layer caching.
COPY package.json yarn.lock .yarnrc.yml ./
COPY prisma ./prisma
RUN yarn install --immutable

# Compile TypeScript.
COPY tsconfig.json ./
COPY src ./src
RUN yarn build


############
# Runtime  #
############
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    SIGNER_PORT=3001

WORKDIR /app

# Runtime libraries Prisma engines link against on Alpine.
RUN apk add --no-cache openssl libc6-compat tini

# Run as non-root.
RUN addgroup -S app && adduser -S app -G app

# Copy compiled output, deps, schema, and yarn metadata.
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json yarn.lock .yarnrc.yml ./
COPY --chown=app:app prisma ./prisma

USER app

EXPOSE 3001

# Liveness via the signer server's /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${SIGNER_PORT}/health" || exit 1

# tini reaps zombies and forwards SIGTERM cleanly. Migrate before starting.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/bot.js"]
