FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./
COPY packages ./packages
COPY apps/corporate-service ./apps/corporate-service

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @travelplatform/corporate-service db:generate

# Build
RUN pnpm --filter @travelplatform/corporate-service build

# Production image
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/corporate-service/dist ./dist
COPY --from=builder /app/apps/corporate-service/package.json ./
COPY --from=builder /app/apps/corporate-service/node_modules ./node_modules
COPY --from=builder /app/apps/corporate-service/prisma ./prisma

EXPOSE 4014

CMD ["node", "dist/index.js"]
