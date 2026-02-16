# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

```bash
# Development
pnpm install                                      # Install all dependencies
pnpm dev                                          # Start all services (requires Docker infra)
pnpm --filter @travelplatform/gateway dev         # Start single service
pnpm --filter @travelplatform/shuttle-service dev # Start specific service

# Database (run Docker first: cd infrastructure && docker-compose up -d)
pnpm --filter "*-service" db:generate             # Generate Prisma clients
pnpm --filter "*-service" db:push                 # Push schema to databases
pnpm --filter @travelplatform/shuttle-service db:studio  # Open Prisma GUI

# Code Quality
pnpm lint                                         # ESLint all packages
pnpm typecheck                                    # TypeScript type checking
pnpm format                                       # Prettier formatting
pnpm build                                        # Build all packages
```

## Architecture

GraphQL Federation platform with 8 microservices orchestrated via Apollo Gateway. Each service owns specific domain entities with independent PostgreSQL databases.

```
Gateway (:4000) → JWT auth, rate limiting, supergraph composition
    │
    ├── Shuttle (:4001/5432) → Routes, schedules, vehicles, counters
    ├── Seat    (:4002/5433) → Seat inventory, layouts, locking
    ├── Pricing (:4003/5434) → Dynamic pricing, fare calculation
    ├── Booking (:4004/5435) → Orders, travelers, booking lifecycle
    ├── Payment (:4005/5436) → Transactions, refunds, gateways
    ├── Promo   (:4006/5437) → Vouchers, cashback, campaigns
    └── Notif   (:4007/5438) → Push, email, SMS notifications
```

Redis (:6379) handles caching and BullMQ job queues (seat locks, booking expiration, cashback release, notifications).

## Project Structure

```
apps/
├── gateway/              # Apollo Gateway - entry point
└── *-service/            # Federation subgraphs
    ├── src/
    │   ├── index.ts      # Express + Apollo Server setup
    │   ├── schema.ts     # GraphQL schema (SDL)
    │   ├── resolvers.ts  # Query/mutation resolvers
    │   └── providers/    # External API integrations (Tiketux, etc.)
    └── prisma/
        └── schema.prisma # Database schema

packages/
├── shared-types/         # TypeScript type definitions
├── shared-utils/         # Common utilities
├── eslint-config/        # ESLint rules
└── tsconfig/             # TypeScript configs
```

## Federation Model

Services extend each other's types via Federation v2:

| Entity | Owner | Extended By |
|--------|-------|-------------|
| Schedule | Shuttle | Seat, Pricing, Booking |
| Seat | Seat | Booking |
| Booking | Booking | Payment, Notification |

Gateway forwards auth context via headers: `x-user-id`, `x-user-role`, `x-user-email`

## Provider Pattern

External API integrations use the provider adapter pattern in `apps/shuttle-service/src/providers/`:

```
providers/
├── types.ts         # IShuttleProvider interface
├── registry.ts      # ProviderRegistry (factory)
└── tiketux/         # Tiketux implementation
    ├── client.ts    # OAuth + HTTP client
    ├── provider.ts  # IShuttleProvider impl
    └── types.ts     # API response types
```

Add new providers by implementing `IShuttleProvider` and registering in `registry.ts`.

## Environment Setup

Each service needs `.env` from `.env.example`:
```bash
for service in gateway shuttle-service seat-service pricing-service \
               booking-service payment-service promo-service notification-service; do
  cp apps/$service/.env.example apps/$service/.env
done
```

Key variables:
- Services: `PORT`, `DATABASE_URL`, `REDIS_URL`
- Gateway: `JWT_SECRET`, service URLs for federation endpoints
- Tiketux: `TIKETUX_BASE_URL`, `TIKETUX_CLIENT_ID`, `TIKETUX_CLIENT_SECRET`

## Booking Flow

1. Search Routes → Shuttle Service
2. Get Schedules → Shuttle + Pricing (federated)
3. Lock Seats → Seat Service (15 min hold via BullMQ)
4. Create Booking → Booking Service
5. Process Payment → Payment Service
6. Confirm Seats → Seat Service
7. Send Notification → Notification Service (async)
8. Award Cashback → Promo Service (7-day hold)

## Code Style

- TypeScript strict mode enabled
- Prefer `import type` for type-only imports
- Import ordering: builtin → external → internal → parent/sibling
- Unused variables: prefix with `_` if intentional
- Line width: 100 chars, 2-space indent, semicolons required
