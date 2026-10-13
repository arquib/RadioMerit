# syntax=docker/dockerfile:1
FROM node:24-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# All dependencies (dev included: needed to build and to run migrations)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client and build the standalone Next.js server
FROM deps AS builder
COPY . .
RUN npx prisma generate && npm run build

# One-off container that applies pending migrations, then exits. It only needs the Prisma CLI
# and dotenv (prisma.config.ts), installed at the versions pinned in package-lock.json.
FROM base AS migrator
COPY package-lock.json ./
RUN npm install --no-save --no-package-lock $(node -p "const p = require('./package-lock.json').packages; \
      ['prisma', 'dotenv'].map((n) => n + '@' + p['node_modules/' + n].version).join(' ')") \
 && rm package-lock.json && npm cache clean --force
COPY prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# Minimal production image
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
