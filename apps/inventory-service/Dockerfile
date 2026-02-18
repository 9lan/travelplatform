FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./
COPY packages ./packages
COPY apps/inventory-service ./apps/inventory-service

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @travelplatform/inventory-service db:generate

# Build
RUN pnpm --filter @travelplatform/inventory-service build

# Production image
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/inventory-service/dist ./dist
COPY --from=builder /app/apps/inventory-service/package.json ./
COPY --from=builder /app/apps/inventory-service/node_modules ./node_modules
COPY --from=builder /app/apps/inventory-service/prisma ./prisma

EXPOSE 4011

CMD ["node", "dist/index.js"]
