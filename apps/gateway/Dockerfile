FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN apk add --no-cache libc6-compat

FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/gateway ./apps/gateway
COPY packages ./packages

# Build packages and app
RUN pnpm --filter @travelplatform/shared-types build
RUN pnpm --filter @travelplatform/shared-utils build
RUN pnpm --filter @travelplatform/gateway build

# Deploy the app with all its dependencies
RUN pnpm --filter @travelplatform/gateway deploy --prod /deploy

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy the deployed app
COPY --from=builder /deploy ./

EXPOSE 4000

CMD ["node", "dist/index.js"]
