# TravelPlatform

A shuttle booking platform built with GraphQL Federation architecture.

## Architecture

- **Gateway** (`:4000`) - Apollo Gateway with JWT auth, rate limiting, query complexity analysis
- **Shuttle Service** (`:4001`) - Routes, schedules, vehicles, counters
- **Seat Service** (`:4002`) - Seat inventory, layouts, locking
- **Pricing Service** (`:4003`) - Dynamic pricing, fare calculation
- **Booking Service** (`:4004`) - Orders, travelers, booking lifecycle
- **Payment Service** (`:4005`) - Transactions, refunds, gateway integration
- **Promo Service** (`:4006`) - Vouchers, cashback, campaigns
- **Notification Service** (`:4007`) - Push, email, SMS notifications

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20 LTS |
| Language | TypeScript 5.x |
| GraphQL | Apollo Server 4 + Apollo Federation 2 |
| ORM | Prisma 5.x |
| Database | PostgreSQL 16 (per-service) |
| Cache/Queue | Redis 7 + BullMQ |
| Monorepo | Turborepo + pnpm |

## Project Structure

```
travelplatform/
├── apps/
│   ├── gateway/              # Apollo Gateway
│   ├── shuttle-service/      # Routes, schedules, vehicles
│   ├── seat-service/         # Seat inventory
│   ├── pricing-service/      # Fare calculation
│   ├── booking-service/      # Orders, travelers
│   ├── payment-service/      # Transactions
│   ├── promo-service/        # Vouchers, cashback
│   └── notification-service/ # Notifications
├── packages/
│   ├── shared-types/         # Shared TypeScript types
│   ├── shared-utils/         # Common utilities
│   ├── eslint-config/        # Shared ESLint config
│   └── tsconfig/             # Shared TypeScript config
└── infrastructure/
    └── docker-compose.yml    # Local development
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repo-url>
   cd travelplatform
   corepack enable
   pnpm install
   ```

2. **Start infrastructure (PostgreSQL + Redis)**
   ```bash
   cd infrastructure
   docker-compose up -d
   ```

3. **Configure environment variables**
   ```bash
   # Copy .env.example to .env for each service
   for service in gateway shuttle-service seat-service pricing-service booking-service payment-service promo-service notification-service; do
     cp apps/$service/.env.example apps/$service/.env
   done
   ```

4. **Generate Prisma clients and run migrations**
   ```bash
   # Generate Prisma clients
   pnpm --filter "*-service" db:generate

   # Push schema to databases
   pnpm --filter "*-service" db:push
   ```

5. **Start all services**
   ```bash
   pnpm dev
   ```

6. **Access GraphQL Playground**
   - Gateway: http://localhost:4000/graphql

## Development

### Commands

```bash
# Install dependencies
pnpm install

# Start all services in dev mode
pnpm dev

# Build all packages
pnpm build

# Run type checking
pnpm typecheck

# Run linting
pnpm lint

# Format code
pnpm format
```

### Database Commands

```bash
# Generate Prisma client (all services)
pnpm --filter "*-service" db:generate

# Push schema changes (all services)
pnpm --filter "*-service" db:push

# Run migrations (all services)
pnpm --filter "*-service" db:migrate

# Open Prisma Studio for a specific service
pnpm --filter @travelplatform/shuttle-service db:studio
```

### Running Individual Services

```bash
# Run specific service
pnpm --filter @travelplatform/shuttle-service dev

# Run gateway only
pnpm --filter @travelplatform/gateway dev
```

## Service Ports

| Service | Port | Database Port |
|---------|------|---------------|
| Gateway | 4000 | - |
| Shuttle | 4001 | 5432 |
| Seat | 4002 | 5433 |
| Pricing | 4003 | 5434 |
| Booking | 4004 | 5435 |
| Payment | 4005 | 5436 |
| Promo | 4006 | 5437 |
| Notification | 4007 | 5438 |
| Redis | 6379 | - |

## API Reference

- [Tiketux Integration](./docs/api/Tiketux%20V2.postman_collection.json)

## Documentation

- [Backend Architecture Design](./docs/plans/2026-02-15-backend-architecture-design.md)

## License

Private
