FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/gateway/node_modules ./apps/gateway/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter @travelplatform/shared-types build
RUN pnpm --filter @travelplatform/shared-utils build
RUN pnpm --filter @travelplatform/gateway build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/gateway/dist ./dist
COPY --from=builder /app/apps/gateway/node_modules ./node_modules
COPY --from=builder /app/apps/gateway/package.json ./

EXPOSE 4000

CMD ["node", "dist/index.js"]
