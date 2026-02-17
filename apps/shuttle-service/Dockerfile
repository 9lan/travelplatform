FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN apk add --no-cache libc6-compat openssl

FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/shuttle-service/package.json ./apps/shuttle-service/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/shuttle-service ./apps/shuttle-service
COPY packages ./packages

# Build packages and app
RUN pnpm --filter @travelplatform/shared-types build
RUN pnpm --filter @travelplatform/shared-utils build
RUN pnpm --filter @travelplatform/shuttle-service exec prisma generate
RUN pnpm --filter @travelplatform/shuttle-service build

# Deploy the app with all its dependencies
RUN pnpm --filter @travelplatform/shuttle-service deploy --prod /deploy

# Copy prisma schema for migrations
RUN cp -r /app/apps/shuttle-service/prisma /deploy/prisma

# Copy generated Prisma client to dist
RUN mkdir -p /deploy/dist/generated && cp -r /app/apps/shuttle-service/src/generated/prisma /deploy/dist/generated/

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

# Copy the deployed app
COPY --from=builder /deploy ./

# Install prisma CLI for migrations
RUN npm install -g prisma@5

EXPOSE 4001

CMD ["sh", "-c", "prisma migrate deploy && node dist/index.js"]
