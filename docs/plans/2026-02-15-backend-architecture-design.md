# TravelPlatform Backend Architecture Design

**Date:** 2026-02-15
**Status:** Approved
**Reference:** daytrans-district (REST microservices)

---

## Overview

TravelPlatform is a shuttle booking platform built with GraphQL Federation architecture. The backend consists of 7 microservices composed into a unified graph via Apollo Gateway.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20 LTS |
| Language | TypeScript 5.x |
| GraphQL | Apollo Server 4 + Apollo Federation 2 |
| Gateway | Apollo Gateway |
| ORM | Prisma 5.x |
| Database | PostgreSQL 16 (per-service) |
| Cache/Queue | Redis 7 + BullMQ |
| Monorepo | Turborepo + pnpm |
| Container | Docker + Kubernetes |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Apps                               │
│         (Mobile App, Web App, Driver App, Admin CMS)            │
└─────────────────────────┬───────────────────────────────────────┘
                          │ GraphQL (fragments)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Apollo Gateway (:4000)                        │
│        ┌──────────────────────────────────────────┐             │
│        │  • JWT Validation & User Context          │             │
│        │  • Rate Limiting (Redis)                  │             │
│        │  • Query Complexity Analysis              │             │
│        │  • Supergraph Composition                 │             │
│        └──────────────────────────────────────────┘             │
└─────────────────────────┬───────────────────────────────────────┘
                          │ Federation v2
        ┌─────────┬───────┼───────┬─────────┬─────────┐
        ▼         ▼       ▼       ▼         ▼         ▼
   ┌────────┐ ┌──────┐ ┌───────┐ ┌───────┐ ┌─────┐ ┌──────┐
   │Shuttle │ │ Seat │ │Pricing│ │Booking│ │Promo│ │Notif │
   │ :4001  │ │:4002 │ │ :4003 │ │ :4004 │ │:4006│ │:4007 │
   └───┬────┘ └──┬───┘ └───┬───┘ └───┬───┘ └──┬──┘ └──┬───┘
       │         │         │         │        │       │
       ▼         ▼         ▼         ▼        ▼       ▼
   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐ ┌──────┐ ┌──────┐
   │ PG   │  │ PG   │  │ PG   │  │ PG   │ │ PG   │ │ PG   │
   └──────┘  └──────┘  └──────┘  └──────┘ └──────┘ └──────┘
                          │
                    ┌─────┴─────┐
                    │   Redis   │ (Cache + BullMQ)
                    └───────────┘
```

## Project Structure

```
travelplatform/
├── apps/
│   ├── gateway/                 # Apollo Gateway
│   ├── shuttle-service/         # Routes, schedules, vehicles
│   ├── seat-service/            # Seat inventory, layouts
│   ├── pricing-service/         # Fare calculation, rules
│   ├── booking-service/         # Orders, travelers
│   ├── payment-service/         # Transactions, refunds
│   ├── promo-service/           # Vouchers, cashback
│   └── notification-service/    # Push, email, SMS
│
├── packages/
│   ├── shared-types/            # Shared TypeScript types
│   ├── shared-utils/            # Common utilities
│   ├── eslint-config/           # Shared ESLint config
│   └── tsconfig/                # Shared TypeScript config
│
├── infrastructure/
│   ├── docker-compose.yml       # Local development
│   └── k8s/                     # Kubernetes manifests
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Services

### 1. Gateway (:4000)

Entry point for all GraphQL requests.

**Responsibilities:**
- JWT validation and user context extraction
- Rate limiting (Redis-based)
- Query complexity analysis
- Schema composition via Federation v2
- Request logging and tracing

**Key Features:**
- Forwards user context (`x-user-id`, `x-user-role`) to subgraphs
- Anonymous rate limit: 100 req/min
- Authenticated rate limit: 500 req/min
- Max query complexity: 1000

---

### 2. Shuttle Service (:4001)

Core domain service for shuttle operations.

**Entities Owned:**
- `Route` - Origin/destination pairs with distance and duration
- `Schedule` - Departure times, vehicle assignments
- `Vehicle` - Fleet with capacity and amenities
- `Counter` - Pickup/dropoff terminals
- `City` - Geographic locations

**Key Queries:**
```graphql
routes(filter: RouteFilter): [Route!]!
schedules(filter: ScheduleFilter!): [Schedule!]!
counters(cityId: ID): [Counter!]!
```

**Key Mutations:**
```graphql
createSchedule(input: CreateScheduleInput!): Schedule!
updateScheduleStatus(id: ID!, status: ScheduleStatus!): Schedule!
assignDriver(scheduleId: ID!, driverName: String!, vehiclePlate: String!): Schedule!
```

---

### 3. Seat Service (:4002)

Manages seat inventory and availability.

**Entities Owned:**
- `Seat` - Individual seats with status
- `SeatLayout` - Vehicle seat configurations
- `SeatLock` - Temporary holds during booking

**Key Queries:**
```graphql
seats(scheduleId: ID!): [Seat!]!
seatLayout(vehicleId: ID!): SeatLayout
```

**Key Mutations:**
```graphql
lockSeats(input: LockSeatsInput!): SeatLock!
unlockSeats(lockId: ID!): Boolean!
confirmSeats(lockId: ID!, bookingId: ID!): [Seat!]!
```

**Async Jobs (BullMQ):**
- Seat lock expiration (15 min default)

---

### 4. Pricing Service (:4003)

Dynamic pricing and fare calculation.

**Entities Owned:**
- `Price` - Base prices per schedule
- `PriceRule` - Surge, discounts, seat type premiums
- `SeatTypePrice` - Additional charges for premium seats

**Key Queries:**
```graphql
price(scheduleId: ID!, seatType: SeatType): Price!
calculateFare(input: CalculateFareInput!): FareBreakdown!
```

**Key Mutations:**
```graphql
createPriceRule(input: CreatePriceRuleInput!): PriceRule!
updatePriceRule(id: ID!, input: UpdatePriceRuleInput!): PriceRule!
```

**Pricing Rules Support:**
- Surge pricing (occupancy-based, time-based)
- Day-of-week pricing
- Advance purchase discounts
- Seat type premiums

---

### 5. Booking Service (:4004)

Order management and booking lifecycle.

**Entities Owned:**
- `Booking` - Orders with status and pricing snapshot
- `Traveler` - Passenger information

**Key Queries:**
```graphql
booking(id: ID!): Booking
bookingByCode(code: String!): Booking
myBookings(filter: MyBookingFilter): [Booking!]!
```

**Key Mutations:**
```graphql
createBooking(input: CreateBookingInput!): Booking!
cancelBooking(id: ID!, reason: String): Booking!
rescheduleBooking(id: ID!, newScheduleId: ID!, newSeatIds: [ID!]!): Booking!
```

**Booking Statuses:**
- `PENDING` - Awaiting payment
- `CONFIRMED` - Payment successful
- `COMPLETED` - Trip finished
- `CANCELLED` - User/system cancelled
- `EXPIRED` - Payment timeout

**Async Jobs (BullMQ):**
- Booking expiration (30 min payment window)

---

### 6. Payment Service (:4005)

Payment processing and gateway integration.

**Entities Owned:**
- `Payment` - Payment records
- `Transaction` - Individual charges/refunds
- `Refund` - Refund requests
- `PaymentMethod` - Available payment options

**Key Queries:**
```graphql
payment(id: ID!): Payment
paymentByBooking(bookingId: ID!): Payment
paymentMethods: [PaymentMethod!]!
```

**Key Mutations:**
```graphql
createPayment(input: CreatePaymentInput!): Payment!
processPayment(paymentId: ID!, input: ProcessPaymentInput!): PaymentResult!
requestRefund(paymentId: ID!, input: RefundInput!): Refund!
```

**Supported Methods:**
- Credit Card
- Bank Transfer
- Virtual Account
- E-Wallet (GoPay, OVO, etc.)
- QRIS

**Gateway Integration:**
- Midtrans (primary)
- Extensible to Xendit, DOKU

---

### 7. Promo Service (:4006)

Promotions, vouchers, and loyalty.

**Entities Owned:**
- `Voucher` - Discount codes
- `Campaign` - Promotional campaigns
- `CashbackBalance` - Customer loyalty points
- `CashbackTransaction` - Points history

**Key Queries:**
```graphql
validateVoucher(code: String!, input: ValidateVoucherInput!): VoucherValidation!
customerCashback(customerId: ID!): CashbackBalance!
```

**Key Mutations:**
```graphql
createVoucher(input: CreateVoucherInput!): Voucher!
applyVoucher(code: String!, bookingId: ID!): VoucherApplication!
redeemCashback(customerId: ID!, amount: Float!, bookingId: ID!): CashbackRedemption!
```

**Voucher Types:**
- Percentage discount
- Flat discount
- Free seat upgrade

**Async Jobs (BullMQ):**
- Cashback release (7 days after trip completion)

---

### 8. Notification Service (:4007)

Multi-channel notifications.

**Entities Owned:**
- `Notification` - Sent notifications
- `NotificationTemplate` - Message templates
- `DeviceToken` - Push notification tokens

**Key Queries:**
```graphql
notifications(filter: NotificationFilter!): NotificationConnection!
unreadCount(customerId: ID!): Int!
```

**Key Mutations:**
```graphql
sendNotification(input: SendNotificationInput!): Notification!
markAsRead(notificationIds: [ID!]!): [Notification!]!
registerDevice(input: RegisterDeviceInput!): DeviceToken!
```

**Channels:**
- Push (Firebase Cloud Messaging)
- Email (SMTP/SES)
- SMS
- In-App
- WhatsApp

**Async Jobs (BullMQ):**
- Notification delivery (all channels)
- Bulk notification processing

---

## Entity Ownership & Federation

| Entity | Owner | Extended By |
|--------|-------|-------------|
| `Route` | Shuttle | Pricing |
| `Schedule` | Shuttle | Seat, Pricing, Booking |
| `Vehicle` | Shuttle | Seat |
| `Counter` | Shuttle | - |
| `Seat` | Seat | Booking |
| `Price` | Pricing | Booking |
| `Booking` | Booking | Payment, Notification |
| `Payment` | Payment | Booking |
| `Voucher` | Promo | Booking |
| `Notification` | Notification | - |

---

## Booking Flow

```
1. Search Routes      → Shuttle Service
2. Get Schedules      → Shuttle Service + Pricing (federated)
3. Check Seats        → Seat Service
4. Lock Seats         → Seat Service (15 min hold)
5. Apply Voucher      → Promo Service (optional)
6. Create Booking     → Booking Service
7. Process Payment    → Payment Service → Midtrans
8. Confirm Seats      → Seat Service
9. Send Notification  → Notification Service (async)
10. Award Cashback    → Promo Service (async, 7-day hold)
```

---

## Authentication

- JWT tokens validated at Gateway
- User context forwarded via headers:
  - `x-user-id`
  - `x-user-role`
  - `x-user-email`
- Subgraphs trust gateway (no re-validation)
- Public queries allowed (schedules, routes, prices)
- Protected mutations require valid JWT

---

## Async Processing (BullMQ)

| Queue | Service | Purpose |
|-------|---------|---------|
| `seat-lock-expiration` | Seat | Release held seats after timeout |
| `booking-expiration` | Booking | Expire unpaid bookings |
| `cashback-release` | Promo | Release pending cashback |
| `notifications` | Notification | Deliver push/email/SMS |

---

## Local Development

```bash
# Start all services
cd infrastructure
docker-compose up -d

# Run migrations
pnpm --filter shuttle-service exec prisma migrate dev
pnpm --filter seat-service exec prisma migrate dev
# ... repeat for all services

# Start gateway
pnpm --filter gateway dev
```

**Ports:**
- Gateway: 4000
- Shuttle: 4001
- Seat: 4002
- Pricing: 4003
- Booking: 4004
- Payment: 4005
- Promo: 4006
- Notification: 4007
- PostgreSQL: 5432-5438
- Redis: 6379

---

## Deployment

- **Container Registry:** GitHub Container Registry (ghcr.io)
- **Orchestration:** Kubernetes
- **Ingress:** nginx-ingress + cert-manager
- **Secrets:** Kubernetes Secrets (HashiCorp Vault for production)

---

## Next Steps

1. Initialize Turborepo monorepo structure
2. Implement Gateway with auth and rate limiting
3. Implement Shuttle Service (core domain)
4. Implement Seat Service
5. Implement Pricing Service
6. Implement Booking Service
7. Implement Payment Service (Midtrans integration)
8. Implement Promo Service
9. Implement Notification Service
10. Integration testing with full flow
11. CI/CD pipeline setup
12. Kubernetes deployment
