FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/shuttle-service/package.json ./apps/shuttle-service/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/shuttle-service/node_modules ./apps/shuttle-service/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter @travelplatform/shared-types build
RUN pnpm --filter @travelplatform/shared-utils build
RUN pnpm --filter @travelplatform/shuttle-service exec prisma generate
RUN pnpm --filter @travelplatform/shuttle-service build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/shuttle-service/dist ./dist
COPY --from=builder /app/apps/shuttle-service/prisma ./prisma
COPY --from=builder /app/apps/shuttle-service/node_modules ./node_modules
COPY --from=builder /app/apps/shuttle-service/package.json ./

EXPOSE 4001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
