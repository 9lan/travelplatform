# Tour Vertical Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Launch aggregated tours + basic direct supply with B2C booking flow

**Architecture:** 5 new GraphQL Federation services (Tour, Inventory, Vendor, Component, Corporate) following existing patterns. PostgreSQL per service, Redis for caching/queues, BullMQ for async jobs.

**Tech Stack:** Node.js, TypeScript, Apollo Server, Prisma, GraphQL Federation v2, Redis, BullMQ

---

## Phase 1 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1-2 | Service Scaffolding | 5 new services with basic structure |
| 3-4 | Database Schemas | Prisma schemas, migrations, generated clients |
| 5-6 | GraphQL Schemas | Federation types, resolvers, gateway integration |
| 7-8 | Tour Aggregation | Provider interface, first integration |
| 9-10 | Booking Flow | Two-phase booking, inventory holds |
| 11-12 | Vouchers & Polish | Voucher generation, notifications |

---

## Task 1: Scaffold Tour Service

**Files:**
- Create: `apps/tour-service/package.json`
- Create: `apps/tour-service/tsconfig.json`
- Create: `apps/tour-service/.env.example`
- Create: `apps/tour-service/Dockerfile`
- Create: `apps/tour-service/src/index.ts`
- Create: `apps/tour-service/src/prisma.ts`

**Step 1: Create package.json**

```json
{
  "name": "@travelplatform/tour-service",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch --env-file .env src/index.ts",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@apollo/server": "^4.11.0",
    "@apollo/subgraph": "^2.9.3",
    "@prisma/client": "^5.22.0",
    "bullmq": "^5.12.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "graphql": "^16.9.0",
    "graphql-tag": "^2.12.6",
    "ioredis": "^5.4.1",
    "@travelplatform/shared-types": "workspace:*",
    "@travelplatform/shared-utils": "workspace:*"
  },
  "devDependencies": {
    "@travelplatform/eslint-config": "workspace:*",
    "@travelplatform/tsconfig": "workspace:*",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.17.0",
    "prisma": "^5.22.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "@travelplatform/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create .env.example**

```env
NODE_ENV=development
PORT=4010
DATABASE_URL=postgresql://tour:tour_dev@localhost:5440/tour
REDIS_URL=redis://localhost:6379
```

**Step 4: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./
COPY packages ./packages
COPY apps/tour-service ./apps/tour-service

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @travelplatform/tour-service db:generate

# Build
RUN pnpm --filter @travelplatform/tour-service build

# Production image
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/tour-service/dist ./dist
COPY --from=builder /app/apps/tour-service/package.json ./
COPY --from=builder /app/apps/tour-service/node_modules ./node_modules
COPY --from=builder /app/apps/tour-service/prisma ./prisma

EXPOSE 4010

CMD ["node", "dist/index.js"]
```

**Step 5: Create src/index.ts**

```typescript
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import cors from 'cors';
import express from 'express';
import crypto from 'crypto';

import { prisma } from './prisma';
import { typeDefs } from './schema/typeDefs';
import { resolvers } from './schema/resolvers';

interface UserContext {
  id: string;
  email: string;
  role: string;
}

interface ServiceContext {
  user: UserContext | null;
  requestId: string;
}

function extractUserFromHeaders(req: express.Request): UserContext | null {
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;
  const userRole = req.headers['x-user-role'] as string;

  if (!userId) return null;

  return {
    id: userId,
    email: userEmail || '',
    role: userRole || 'user',
  };
}

async function main() {
  const app = express();
  const port = process.env.PORT || 4010;

  // Health check
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'healthy', service: 'tour-service' });
    } catch (error) {
      res.status(503).json({ status: 'unhealthy', error: String(error) });
    }
  });

  // Build schema
  const schema = buildSubgraphSchema({ typeDefs, resolvers });

  // Create Apollo Server
  const server = new ApolloServer<ServiceContext>({
    schema,
  });

  await server.start();

  // GraphQL endpoint
  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => ({
        user: extractUserFromHeaders(req),
        requestId: (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
      }),
    })
  );

  app.listen(port, () => {
    console.log(`🚀 Tour Service ready at http://localhost:${port}/graphql`);
  });
}

main().catch((error) => {
  console.error('Failed to start Tour Service:', error);
  process.exit(1);
});
```

**Step 6: Create src/prisma.ts**

```typescript
import { PrismaClient } from './generated/prisma';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
```

**Step 7: Commit**

```bash
git add apps/tour-service/
git commit -m "feat(tour): scaffold tour-service with basic structure"
```

---

## Task 2: Create Tour Service Prisma Schema

**Files:**
- Create: `apps/tour-service/prisma/schema.prisma`

**Step 1: Create Prisma schema**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

enum TourType {
  AGGREGATED
  CUSTOM
}

enum TourSource {
  INTERNAL
  KLOOK
  VIATOR
  LOCAL_OPERATOR
}

enum TourStatus {
  DRAFT
  ACTIVE
  SUSPENDED
  ARCHIVED
}

enum Difficulty {
  EASY
  MODERATE
  CHALLENGING
}

enum ComponentType {
  ACCOMMODATION
  TRANSPORT
  ACTIVITY
  MEAL
  GUIDE
}

// ─────────────────────────────────────────────
// DESTINATION & CATEGORY
// ─────────────────────────────────────────────

model Destination {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  country   String
  timezone  String
  latitude  Float
  longitude Float
  imageUrl  String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tours Tour[]

  @@index([country])
  @@index([isActive])
}

model Category {
  id        String   @id @default(cuid())
  name      String   @unique
  slug      String   @unique
  icon      String?
  parentId  String?
  parent    Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children  Category[] @relation("CategoryHierarchy")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tours TourCategory[]

  @@index([parentId])
}

// ─────────────────────────────────────────────
// TOUR
// ─────────────────────────────────────────────

model Tour {
  id            String      @id @default(cuid())
  code          String      @unique
  name          String
  slug          String      @unique
  description   String?
  type          TourType
  source        TourSource
  providerId    String?
  providerRef   String?     // External reference if aggregated
  destinationId String
  destination   Destination @relation(fields: [destinationId], references: [id])
  durationDays  Int
  durationNights Int
  difficulty    Difficulty  @default(EASY)
  minPax        Int         @default(1)
  maxPax        Int
  basePrice     Decimal     @db.Decimal(15, 2)
  currency      String      @default("IDR")
  highlights    String[]
  inclusions    String[]
  exclusions    String[]
  images        Json        @default("[]")
  metadata      Json        @default("{}")
  status        TourStatus  @default(DRAFT)
  publishedAt   DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  categories  TourCategory[]
  themes      TourTheme[]
  itinerary   Itinerary[]

  @@index([destinationId])
  @@index([status])
  @@index([type, source])
  @@index([providerId])
}

model TourCategory {
  id         String   @id @default(cuid())
  tourId     String
  tour       Tour     @relation(fields: [tourId], references: [id], onDelete: Cascade)
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id])
  createdAt  DateTime @default(now())

  @@unique([tourId, categoryId])
  @@index([categoryId])
}

model TourTheme {
  id        String   @id @default(cuid())
  tourId    String
  tour      Tour     @relation(fields: [tourId], references: [id], onDelete: Cascade)
  theme     String   // honeymoon, family, solo, adventure, etc.
  createdAt DateTime @default(now())

  @@unique([tourId, theme])
  @@index([theme])
}

// ─────────────────────────────────────────────
// ITINERARY
// ─────────────────────────────────────────────

model Itinerary {
  id          String   @id @default(cuid())
  tourId      String
  tour        Tour     @relation(fields: [tourId], references: [id], onDelete: Cascade)
  dayNumber   Int
  title       String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  items ItineraryItem[]

  @@unique([tourId, dayNumber])
  @@index([tourId])
}

model ItineraryItem {
  id            String        @id @default(cuid())
  itineraryId   String
  itinerary     Itinerary     @relation(fields: [itineraryId], references: [id], onDelete: Cascade)
  sequence      Int
  componentType ComponentType
  componentId   String        // Reference to Component service
  startTime     String?       // HH:mm format
  endTime       String?       // HH:mm format
  isOptional    Boolean       @default(false)
  priceOverride Decimal?      @db.Decimal(15, 2)
  notes         String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@unique([itineraryId, sequence])
  @@index([itineraryId])
  @@index([componentType, componentId])
}

// ─────────────────────────────────────────────
// SEARCH METADATA (for OpenSearch sync)
// ─────────────────────────────────────────────

model TourSearchMetadata {
  id              String   @id @default(cuid())
  tourId          String   @unique
  bookingCount    Int      @default(0)
  viewCount       Int      @default(0)
  avgRating       Float?
  reviewCount     Int      @default(0)
  popularityScore Float    @default(0)
  lastSyncedAt    DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([popularityScore])
}
```

**Step 2: Commit**

```bash
git add apps/tour-service/prisma/
git commit -m "feat(tour): add Prisma schema for tours, itineraries, destinations"
```

---

## Task 3: Create Tour Service GraphQL Schema

**Files:**
- Create: `apps/tour-service/src/schema/typeDefs.ts`
- Create: `apps/tour-service/src/schema/resolvers.ts`

**Step 1: Create typeDefs.ts**

```typescript
import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external"])

  scalar DateTime
  scalar JSON
  scalar Decimal

  # ─────────────────────────────────────────────
  # ENUMS
  # ─────────────────────────────────────────────

  enum TourType {
    AGGREGATED
    CUSTOM
  }

  enum TourSource {
    INTERNAL
    KLOOK
    VIATOR
    LOCAL_OPERATOR
  }

  enum TourStatus {
    DRAFT
    ACTIVE
    SUSPENDED
    ARCHIVED
  }

  enum Difficulty {
    EASY
    MODERATE
    CHALLENGING
  }

  enum ComponentType {
    ACCOMMODATION
    TRANSPORT
    ACTIVITY
    MEAL
    GUIDE
  }

  enum TourSortField {
    RELEVANCE
    PRICE_LOW
    PRICE_HIGH
    DURATION
    RATING
    POPULARITY
  }

  enum SortOrder {
    ASC
    DESC
  }

  # ─────────────────────────────────────────────
  # TYPES
  # ─────────────────────────────────────────────

  type Destination @key(fields: "id") {
    id: ID!
    name: String!
    slug: String!
    country: String!
    timezone: String!
    latitude: Float!
    longitude: Float!
    imageUrl: String
    isActive: Boolean!
  }

  type Category @key(fields: "id") {
    id: ID!
    name: String!
    slug: String!
    icon: String
    parent: Category
    children: [Category!]!
  }

  type Duration {
    days: Int!
    nights: Int!
  }

  type Money {
    amount: Decimal!
    currency: String!
  }

  type Rating {
    average: Float
    count: Int!
  }

  type Image {
    url: String!
    alt: String
  }

  type Tour @key(fields: "id") {
    id: ID!
    code: String!
    name: String!
    slug: String!
    description: String
    type: TourType!
    source: TourSource!
    destination: Destination!
    duration: Duration!
    difficulty: Difficulty!
    minPax: Int!
    maxPax: Int!
    priceFrom: Money!
    highlights: [String!]!
    inclusions: [String!]!
    exclusions: [String!]!
    images: [Image!]!
    categories: [Category!]!
    themes: [String!]!
    status: TourStatus!
    itinerary: [ItineraryDay!]!
    rating: Rating
    bookingCount: Int!
    publishedAt: DateTime
    createdAt: DateTime!
  }

  type ItineraryDay {
    dayNumber: Int!
    title: String!
    description: String
    items: [ItineraryItem!]!
  }

  type ItineraryItem {
    id: ID!
    sequence: Int!
    componentType: ComponentType!
    componentId: ID!
    startTime: String
    endTime: String
    isOptional: Boolean!
    priceOverride: Decimal
    notes: String
  }

  # ─────────────────────────────────────────────
  # PAGINATION
  # ─────────────────────────────────────────────

  type PageInfo @shareable {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type TourEdge {
    cursor: String!
    node: Tour!
  }

  type TourConnection {
    edges: [TourEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type DestinationConnection {
    edges: [DestinationEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type DestinationEdge {
    cursor: String!
    node: Destination!
  }

  # ─────────────────────────────────────────────
  # INPUTS
  # ─────────────────────────────────────────────

  input DateRangeInput {
    start: DateTime!
    end: DateTime!
  }

  input DurationRangeInput {
    minDays: Int
    maxDays: Int
  }

  input PriceRangeInput {
    min: Decimal
    max: Decimal
  }

  input PaxInput {
    adults: Int!
    children: Int
    infants: Int
  }

  input CoordinatesInput {
    latitude: Float!
    longitude: Float!
    radiusKm: Float
  }

  input TourSearchInput {
    query: String
    destinationId: ID
    coordinates: CoordinatesInput
    dateRange: DateRangeInput
    duration: DurationRangeInput
    pax: PaxInput
    categoryIds: [ID!]
    themes: [String!]
    priceRange: PriceRangeInput
    difficulty: [Difficulty!]
    sources: [TourSource!]
    first: Int
    after: String
    sortBy: TourSortField
    sortOrder: SortOrder
  }

  # ─────────────────────────────────────────────
  # QUERIES
  # ─────────────────────────────────────────────

  type Query {
    # Tour discovery
    searchTours(input: TourSearchInput!): TourConnection!
    tourById(id: ID!): Tour
    tourBySlug(slug: String!): Tour
    featuredTours(destinationId: ID, limit: Int): [Tour!]!

    # Destinations & Categories
    destinations(first: Int, after: String): DestinationConnection!
    destinationBySlug(slug: String!): Destination
    categories: [Category!]!

    # Popular
    popularDestinations(limit: Int): [Destination!]!
    popularThemes: [String!]!
  }

  # ─────────────────────────────────────────────
  # MUTATIONS
  # ─────────────────────────────────────────────

  input CreateTourInput {
    name: String!
    description: String
    type: TourType!
    source: TourSource!
    providerId: String
    providerRef: String
    destinationId: ID!
    durationDays: Int!
    durationNights: Int!
    difficulty: Difficulty
    minPax: Int
    maxPax: Int!
    basePrice: Decimal!
    currency: String
    highlights: [String!]
    inclusions: [String!]
    exclusions: [String!]
    images: [JSON!]
    categoryIds: [ID!]
    themes: [String!]
  }

  input UpdateTourInput {
    name: String
    description: String
    difficulty: Difficulty
    minPax: Int
    maxPax: Int
    basePrice: Decimal
    highlights: [String!]
    inclusions: [String!]
    exclusions: [String!]
    images: [JSON!]
    categoryIds: [ID!]
    themes: [String!]
    status: TourStatus
  }

  input ItineraryDayInput {
    dayNumber: Int!
    title: String!
    description: String
  }

  input ItineraryItemInput {
    componentType: ComponentType!
    componentId: ID!
    startTime: String
    endTime: String
    isOptional: Boolean
    priceOverride: Decimal
    notes: String
  }

  type Mutation {
    # Tour management (admin)
    createTour(input: CreateTourInput!): Tour!
    updateTour(id: ID!, input: UpdateTourInput!): Tour!
    publishTour(id: ID!): Tour!
    archiveTour(id: ID!): Tour!

    # Itinerary management
    addItineraryDay(tourId: ID!, input: ItineraryDayInput!): ItineraryDay!
    updateItineraryDay(tourId: ID!, dayNumber: Int!, input: ItineraryDayInput!): ItineraryDay!
    addItineraryItem(tourId: ID!, dayNumber: Int!, input: ItineraryItemInput!): ItineraryItem!
    removeItineraryItem(tourId: ID!, itemId: ID!): Boolean!
    reorderItineraryItems(tourId: ID!, dayNumber: Int!, itemIds: [ID!]!): ItineraryDay!
  }
`;
```

**Step 2: Create resolvers.ts (basic implementation)**

```typescript
import { prisma } from '../prisma';
import { encodeCursor, decodeCursor } from '@travelplatform/shared-utils';

export const resolvers = {
  Query: {
    searchTours: async (_: unknown, { input }: { input: SearchToursInput }) => {
      const {
        query,
        destinationId,
        duration,
        priceRange,
        difficulty,
        sources,
        categoryIds,
        themes,
        first = 20,
        after,
        sortBy = 'RELEVANCE',
        sortOrder = 'DESC',
      } = input;

      // Build where clause
      const where: any = {
        status: 'ACTIVE',
      };

      if (query) {
        where.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ];
      }

      if (destinationId) {
        where.destinationId = destinationId;
      }

      if (duration?.minDays || duration?.maxDays) {
        where.durationDays = {};
        if (duration.minDays) where.durationDays.gte = duration.minDays;
        if (duration.maxDays) where.durationDays.lte = duration.maxDays;
      }

      if (priceRange?.min || priceRange?.max) {
        where.basePrice = {};
        if (priceRange.min) where.basePrice.gte = priceRange.min;
        if (priceRange.max) where.basePrice.lte = priceRange.max;
      }

      if (difficulty?.length) {
        where.difficulty = { in: difficulty };
      }

      if (sources?.length) {
        where.source = { in: sources };
      }

      if (categoryIds?.length) {
        where.categories = {
          some: { categoryId: { in: categoryIds } },
        };
      }

      if (themes?.length) {
        where.themes = {
          some: { theme: { in: themes } },
        };
      }

      // Pagination
      const take = Math.min(first, 50);
      const cursor = after ? { id: decodeCursor(after) } : undefined;

      // Sorting
      const orderBy = getOrderBy(sortBy, sortOrder);

      // Execute query
      const [tours, totalCount] = await Promise.all([
        prisma.tour.findMany({
          where,
          take: take + 1,
          cursor,
          skip: cursor ? 1 : 0,
          orderBy,
          include: {
            destination: true,
            categories: { include: { category: true } },
            themes: true,
          },
        }),
        prisma.tour.count({ where }),
      ]);

      const hasNextPage = tours.length > take;
      const edges = tours.slice(0, take).map((tour) => ({
        cursor: encodeCursor(tour.id),
        node: tour,
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!cursor,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor,
        },
        totalCount,
      };
    },

    tourById: async (_: unknown, { id }: { id: string }) => {
      return prisma.tour.findUnique({
        where: { id },
        include: {
          destination: true,
          categories: { include: { category: true } },
          themes: true,
          itinerary: {
            include: { items: { orderBy: { sequence: 'asc' } } },
            orderBy: { dayNumber: 'asc' },
          },
        },
      });
    },

    tourBySlug: async (_: unknown, { slug }: { slug: string }) => {
      return prisma.tour.findUnique({
        where: { slug },
        include: {
          destination: true,
          categories: { include: { category: true } },
          themes: true,
          itinerary: {
            include: { items: { orderBy: { sequence: 'asc' } } },
            orderBy: { dayNumber: 'asc' },
          },
        },
      });
    },

    featuredTours: async (
      _: unknown,
      { destinationId, limit = 10 }: { destinationId?: string; limit?: number }
    ) => {
      const where: any = { status: 'ACTIVE' };
      if (destinationId) where.destinationId = destinationId;

      return prisma.tour.findMany({
        where,
        take: limit,
        orderBy: [{ metadata: { path: ['featured'], sort: 'desc' } }, { createdAt: 'desc' }],
        include: {
          destination: true,
          categories: { include: { category: true } },
          themes: true,
        },
      });
    },

    destinations: async (_: unknown, { first = 20, after }: { first?: number; after?: string }) => {
      const take = Math.min(first, 50);
      const cursor = after ? { id: decodeCursor(after) } : undefined;

      const [destinations, totalCount] = await Promise.all([
        prisma.destination.findMany({
          where: { isActive: true },
          take: take + 1,
          cursor,
          skip: cursor ? 1 : 0,
          orderBy: { name: 'asc' },
        }),
        prisma.destination.count({ where: { isActive: true } }),
      ]);

      const hasNextPage = destinations.length > take;
      const edges = destinations.slice(0, take).map((dest) => ({
        cursor: encodeCursor(dest.id),
        node: dest,
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!cursor,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor,
        },
        totalCount,
      };
    },

    destinationBySlug: async (_: unknown, { slug }: { slug: string }) => {
      return prisma.destination.findUnique({ where: { slug } });
    },

    categories: async () => {
      return prisma.category.findMany({
        where: { parentId: null },
        include: { children: true },
        orderBy: { name: 'asc' },
      });
    },

    popularDestinations: async (_: unknown, { limit = 10 }: { limit?: number }) => {
      // Get destinations with most active tours
      const destinations = await prisma.destination.findMany({
        where: { isActive: true },
        take: limit,
        orderBy: {
          tours: { _count: 'desc' },
        },
      });
      return destinations;
    },

    popularThemes: async () => {
      const themes = await prisma.tourTheme.groupBy({
        by: ['theme'],
        _count: { theme: true },
        orderBy: { _count: { theme: 'desc' } },
        take: 20,
      });
      return themes.map((t) => t.theme);
    },
  },

  Mutation: {
    createTour: async (_: unknown, { input }: { input: CreateTourInput }) => {
      const { categoryIds, themes, ...tourData } = input;

      // Generate unique code and slug
      const code = `TOUR-${Date.now().toString(36).toUpperCase()}`;
      const slug = generateSlug(input.name);

      const tour = await prisma.tour.create({
        data: {
          ...tourData,
          code,
          slug,
          images: tourData.images || [],
          highlights: tourData.highlights || [],
          inclusions: tourData.inclusions || [],
          exclusions: tourData.exclusions || [],
          categories: categoryIds?.length
            ? {
                create: categoryIds.map((categoryId) => ({ categoryId })),
              }
            : undefined,
          themes: themes?.length
            ? {
                create: themes.map((theme) => ({ theme })),
              }
            : undefined,
        },
        include: {
          destination: true,
          categories: { include: { category: true } },
          themes: true,
        },
      });

      return tour;
    },

    updateTour: async (_: unknown, { id, input }: { id: string; input: UpdateTourInput }) => {
      const { categoryIds, themes, ...updateData } = input;

      // Handle category updates
      if (categoryIds) {
        await prisma.tourCategory.deleteMany({ where: { tourId: id } });
        await prisma.tourCategory.createMany({
          data: categoryIds.map((categoryId) => ({ tourId: id, categoryId })),
        });
      }

      // Handle theme updates
      if (themes) {
        await prisma.tourTheme.deleteMany({ where: { tourId: id } });
        await prisma.tourTheme.createMany({
          data: themes.map((theme) => ({ tourId: id, theme })),
        });
      }

      return prisma.tour.update({
        where: { id },
        data: updateData,
        include: {
          destination: true,
          categories: { include: { category: true } },
          themes: true,
        },
      });
    },

    publishTour: async (_: unknown, { id }: { id: string }) => {
      return prisma.tour.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          publishedAt: new Date(),
        },
        include: {
          destination: true,
          categories: { include: { category: true } },
          themes: true,
        },
      });
    },

    archiveTour: async (_: unknown, { id }: { id: string }) => {
      return prisma.tour.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        include: {
          destination: true,
          categories: { include: { category: true } },
          themes: true,
        },
      });
    },

    addItineraryDay: async (
      _: unknown,
      { tourId, input }: { tourId: string; input: ItineraryDayInput }
    ) => {
      const itinerary = await prisma.itinerary.create({
        data: {
          tourId,
          ...input,
        },
        include: {
          items: { orderBy: { sequence: 'asc' } },
        },
      });

      return {
        dayNumber: itinerary.dayNumber,
        title: itinerary.title,
        description: itinerary.description,
        items: itinerary.items,
      };
    },

    updateItineraryDay: async (
      _: unknown,
      { tourId, dayNumber, input }: { tourId: string; dayNumber: number; input: ItineraryDayInput }
    ) => {
      const itinerary = await prisma.itinerary.update({
        where: {
          tourId_dayNumber: { tourId, dayNumber },
        },
        data: input,
        include: {
          items: { orderBy: { sequence: 'asc' } },
        },
      });

      return {
        dayNumber: itinerary.dayNumber,
        title: itinerary.title,
        description: itinerary.description,
        items: itinerary.items,
      };
    },

    addItineraryItem: async (
      _: unknown,
      { tourId, dayNumber, input }: { tourId: string; dayNumber: number; input: ItineraryItemInput }
    ) => {
      // Get itinerary
      const itinerary = await prisma.itinerary.findUnique({
        where: { tourId_dayNumber: { tourId, dayNumber } },
        include: { items: true },
      });

      if (!itinerary) {
        throw new Error(`Itinerary day ${dayNumber} not found for tour ${tourId}`);
      }

      // Get next sequence number
      const nextSequence = itinerary.items.length + 1;

      return prisma.itineraryItem.create({
        data: {
          itineraryId: itinerary.id,
          sequence: nextSequence,
          ...input,
        },
      });
    },

    removeItineraryItem: async (_: unknown, { tourId, itemId }: { tourId: string; itemId: string }) => {
      await prisma.itineraryItem.delete({
        where: { id: itemId },
      });
      return true;
    },

    reorderItineraryItems: async (
      _: unknown,
      { tourId, dayNumber, itemIds }: { tourId: string; dayNumber: number; itemIds: string[] }
    ) => {
      // Update sequence for each item
      await Promise.all(
        itemIds.map((id, index) =>
          prisma.itineraryItem.update({
            where: { id },
            data: { sequence: index + 1 },
          })
        )
      );

      const itinerary = await prisma.itinerary.findUnique({
        where: { tourId_dayNumber: { tourId, dayNumber } },
        include: { items: { orderBy: { sequence: 'asc' } } },
      });

      return {
        dayNumber: itinerary!.dayNumber,
        title: itinerary!.title,
        description: itinerary!.description,
        items: itinerary!.items,
      };
    },
  },

  // Field resolvers
  Tour: {
    duration: (tour: any) => ({
      days: tour.durationDays,
      nights: tour.durationNights,
    }),

    priceFrom: (tour: any) => ({
      amount: tour.basePrice,
      currency: tour.currency,
    }),

    categories: (tour: any) => {
      if (tour.categories) {
        return tour.categories.map((tc: any) => tc.category);
      }
      return [];
    },

    themes: (tour: any) => {
      if (tour.themes) {
        return tour.themes.map((tt: any) => tt.theme);
      }
      return [];
    },

    itinerary: (tour: any) => {
      if (tour.itinerary) {
        return tour.itinerary.map((it: any) => ({
          dayNumber: it.dayNumber,
          title: it.title,
          description: it.description,
          items: it.items || [],
        }));
      }
      return [];
    },

    rating: async (tour: any) => {
      const metadata = await prisma.tourSearchMetadata.findUnique({
        where: { tourId: tour.id },
      });
      if (!metadata) return null;
      return {
        average: metadata.avgRating,
        count: metadata.reviewCount,
      };
    },

    bookingCount: async (tour: any) => {
      const metadata = await prisma.tourSearchMetadata.findUnique({
        where: { tourId: tour.id },
      });
      return metadata?.bookingCount || 0;
    },
  },

  Destination: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.destination.findUnique({ where: { id: reference.id } });
    },
  },

  Category: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.category.findUnique({
        where: { id: reference.id },
        include: { children: true, parent: true },
      });
    },
  },
};

// Helper functions
function getOrderBy(sortBy: string, sortOrder: string) {
  const order = sortOrder === 'ASC' ? 'asc' : 'desc';

  switch (sortBy) {
    case 'PRICE_LOW':
      return { basePrice: 'asc' as const };
    case 'PRICE_HIGH':
      return { basePrice: 'desc' as const };
    case 'DURATION':
      return { durationDays: order as 'asc' | 'desc' };
    case 'RATING':
      return { createdAt: 'desc' as const }; // TODO: Add rating sort
    case 'POPULARITY':
      return { createdAt: 'desc' as const }; // TODO: Add popularity sort
    default:
      return { createdAt: 'desc' as const };
  }
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}

// Type definitions for inputs
interface SearchToursInput {
  query?: string;
  destinationId?: string;
  duration?: { minDays?: number; maxDays?: number };
  priceRange?: { min?: number; max?: number };
  difficulty?: string[];
  sources?: string[];
  categoryIds?: string[];
  themes?: string[];
  first?: number;
  after?: string;
  sortBy?: string;
  sortOrder?: string;
}

interface CreateTourInput {
  name: string;
  description?: string;
  type: string;
  source: string;
  providerId?: string;
  providerRef?: string;
  destinationId: string;
  durationDays: number;
  durationNights: number;
  difficulty?: string;
  minPax?: number;
  maxPax: number;
  basePrice: number;
  currency?: string;
  highlights?: string[];
  inclusions?: string[];
  exclusions?: string[];
  images?: any[];
  categoryIds?: string[];
  themes?: string[];
}

interface UpdateTourInput {
  name?: string;
  description?: string;
  difficulty?: string;
  minPax?: number;
  maxPax?: number;
  basePrice?: number;
  highlights?: string[];
  inclusions?: string[];
  exclusions?: string[];
  images?: any[];
  categoryIds?: string[];
  themes?: string[];
  status?: string;
}

interface ItineraryDayInput {
  dayNumber: number;
  title: string;
  description?: string;
}

interface ItineraryItemInput {
  componentType: string;
  componentId: string;
  startTime?: string;
  endTime?: string;
  isOptional?: boolean;
  priceOverride?: number;
  notes?: string;
}
```

**Step 3: Commit**

```bash
git add apps/tour-service/src/schema/
git commit -m "feat(tour): add GraphQL typeDefs and resolvers"
```

---

## Task 4: Scaffold Remaining Services

Repeat similar structure for:
- `apps/inventory-service` (port 4011, db 5441)
- `apps/vendor-service` (port 4012, db 5442)
- `apps/component-service` (port 4013, db 5443)
- `apps/corporate-service` (port 4014, db 5444)

**Step 1: Create service directories with basic structure**

For each service, create:
- `package.json` (update name, port)
- `tsconfig.json`
- `.env.example`
- `Dockerfile`
- `src/index.ts`
- `src/prisma.ts`
- `prisma/schema.prisma` (service-specific)
- `src/schema/typeDefs.ts`
- `src/schema/resolvers.ts`

**Step 2: Commit each service**

```bash
git add apps/inventory-service/
git commit -m "feat(inventory): scaffold inventory-service"

git add apps/vendor-service/
git commit -m "feat(vendor): scaffold vendor-service"

git add apps/component-service/
git commit -m "feat(component): scaffold component-service"

git add apps/corporate-service/
git commit -m "feat(corporate): scaffold corporate-service"
```

---

## Task 5: Update Gateway Configuration

**Files:**
- Modify: `apps/gateway/.env.example`
- Modify: `apps/gateway/src/index.ts`

**Step 1: Add new service URLs to .env.example**

Add after existing service URLs:
```env
# Tour services
TOUR_SERVICE_URL=http://localhost:4010/graphql
INVENTORY_SERVICE_URL=http://localhost:4011/graphql
VENDOR_SERVICE_URL=http://localhost:4012/graphql
COMPONENT_SERVICE_URL=http://localhost:4013/graphql
CORPORATE_SERVICE_URL=http://localhost:4014/graphql
```

**Step 2: Update gateway supergraph configuration**

In `apps/gateway/src/index.ts`, add new subgraphs to the IntrospectAndCompose configuration:

```typescript
subgraphs: [
  // Existing services
  { name: 'shuttle', url: process.env.SHUTTLE_SERVICE_URL },
  { name: 'seat', url: process.env.SEAT_SERVICE_URL },
  { name: 'pricing', url: process.env.PRICING_SERVICE_URL },
  { name: 'booking', url: process.env.BOOKING_SERVICE_URL },
  { name: 'payment', url: process.env.PAYMENT_SERVICE_URL },
  { name: 'promo', url: process.env.PROMO_SERVICE_URL },
  { name: 'notification', url: process.env.NOTIFICATION_SERVICE_URL },
  // New tour services
  { name: 'tour', url: process.env.TOUR_SERVICE_URL },
  { name: 'inventory', url: process.env.INVENTORY_SERVICE_URL },
  { name: 'vendor', url: process.env.VENDOR_SERVICE_URL },
  { name: 'component', url: process.env.COMPONENT_SERVICE_URL },
  { name: 'corporate', url: process.env.CORPORATE_SERVICE_URL },
],
```

**Step 3: Commit**

```bash
git add apps/gateway/
git commit -m "feat(gateway): add tour vertical services to federation"
```

---

## Task 6: Update Docker Compose

**Files:**
- Modify: `infrastructure/docker-compose.yml`

**Step 1: Add new database services**

Add after existing database services:

```yaml
  tour-db:
    image: postgres:16-alpine
    container_name: tour-db
    environment:
      POSTGRES_USER: tour
      POSTGRES_PASSWORD: tour_dev
      POSTGRES_DB: tour
    ports:
      - "5440:5432"
    volumes:
      - tour-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tour"]
      interval: 5s
      timeout: 5s
      retries: 5

  inventory-db:
    image: postgres:16-alpine
    container_name: inventory-db
    environment:
      POSTGRES_USER: inventory
      POSTGRES_PASSWORD: inventory_dev
      POSTGRES_DB: inventory
    ports:
      - "5441:5432"
    volumes:
      - inventory-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U inventory"]
      interval: 5s
      timeout: 5s
      retries: 5

  vendor-db:
    image: postgres:16-alpine
    container_name: vendor-db
    environment:
      POSTGRES_USER: vendor
      POSTGRES_PASSWORD: vendor_dev
      POSTGRES_DB: vendor
    ports:
      - "5442:5432"
    volumes:
      - vendor-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vendor"]
      interval: 5s
      timeout: 5s
      retries: 5

  component-db:
    image: postgres:16-alpine
    container_name: component-db
    environment:
      POSTGRES_USER: component
      POSTGRES_PASSWORD: component_dev
      POSTGRES_DB: component
    ports:
      - "5443:5432"
    volumes:
      - component-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U component"]
      interval: 5s
      timeout: 5s
      retries: 5

  corporate-db:
    image: postgres:16-alpine
    container_name: corporate-db
    environment:
      POSTGRES_USER: corporate
      POSTGRES_PASSWORD: corporate_dev
      POSTGRES_DB: corporate
    ports:
      - "5444:5432"
    volumes:
      - corporate-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U corporate"]
      interval: 5s
      timeout: 5s
      retries: 5
```

**Step 2: Add volumes**

```yaml
volumes:
  # Existing volumes...
  tour-data:
  inventory-data:
  vendor-data:
  component-data:
  corporate-data:
```

**Step 3: Commit**

```bash
git add infrastructure/docker-compose.yml
git commit -m "infra: add database containers for tour vertical services"
```

---

## Task 7: Create Shared Types for Tour

**Files:**
- Modify: `packages/shared-types/src/index.ts`

**Step 1: Add tour-related enums and types**

```typescript
// Tour enums
export enum TourType {
  AGGREGATED = 'AGGREGATED',
  CUSTOM = 'CUSTOM',
}

export enum TourSource {
  INTERNAL = 'INTERNAL',
  KLOOK = 'KLOOK',
  VIATOR = 'VIATOR',
  LOCAL_OPERATOR = 'LOCAL_OPERATOR',
}

export enum TourStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export enum TourBookingStatus {
  DRAFT = 'DRAFT',
  PENDING_DEPOSIT = 'PENDING_DEPOSIT',
  CONFIRMING = 'CONFIRMING',
  CONFIRMATION_FAILED = 'CONFIRMATION_FAILED',
  PENDING_BALANCE = 'PENDING_BALANCE',
  BALANCE_OVERDUE = 'BALANCE_OVERDUE',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum ComponentType {
  ACCOMMODATION = 'ACCOMMODATION',
  TRANSPORT = 'TRANSPORT',
  ACTIVITY = 'ACTIVITY',
  MEAL = 'MEAL',
  GUIDE = 'GUIDE',
}

export enum AvailabilityType {
  TIMESLOT = 'TIMESLOT',
  DAILY_QUOTA = 'DAILY_QUOTA',
  ON_REQUEST = 'ON_REQUEST',
}

export enum InventoryType {
  ALLOTMENT = 'ALLOTMENT',
  ON_REQUEST = 'ON_REQUEST',
}

export enum Difficulty {
  EASY = 'EASY',
  MODERATE = 'MODERATE',
  CHALLENGING = 'CHALLENGING',
}

// Vendor enums
export enum VendorType {
  OPERATOR = 'OPERATOR',
  HOTEL = 'HOTEL',
  ACTIVITY = 'ACTIVITY',
  GUIDE = 'GUIDE',
  RESTAURANT = 'RESTAURANT',
}

export enum VendorStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TERMINATED = 'TERMINATED',
}

// Corporate enums
export enum CompanySize {
  SME = 'SME',
  ENTERPRISE = 'ENTERPRISE',
  GOVERNMENT = 'GOVERNMENT',
}

export enum RFQStatus {
  SUBMITTED = 'SUBMITTED',
  IN_PROGRESS = 'IN_PROGRESS',
  QUOTED = 'QUOTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum QuotationStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  REVISED = 'REVISED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
```

**Step 2: Commit**

```bash
git add packages/shared-types/
git commit -m "feat(shared-types): add tour vertical enums and types"
```

---

## Task 8: Verify Service Setup

**Step 1: Install dependencies**

```bash
pnpm install
```

**Step 2: Generate Prisma clients for all new services**

```bash
pnpm --filter @travelplatform/tour-service db:generate
pnpm --filter @travelplatform/inventory-service db:generate
pnpm --filter @travelplatform/vendor-service db:generate
pnpm --filter @travelplatform/component-service db:generate
pnpm --filter @travelplatform/corporate-service db:generate
```

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: All 17 tasks pass (12 existing + 5 new)

**Step 4: Start databases**

```bash
cd infrastructure && docker-compose up -d
```

**Step 5: Push schemas to databases**

```bash
pnpm --filter @travelplatform/tour-service db:push
pnpm --filter @travelplatform/inventory-service db:push
pnpm --filter @travelplatform/vendor-service db:push
pnpm --filter @travelplatform/component-service db:push
pnpm --filter @travelplatform/corporate-service db:push
```

**Step 6: Start tour service**

```bash
pnpm --filter @travelplatform/tour-service dev
```

Expected: "🚀 Tour Service ready at http://localhost:4010/graphql"

**Step 7: Commit verification**

```bash
git add .
git commit -m "chore: verify tour vertical services setup"
```

---

## Summary

This Phase 1 plan scaffolds the core infrastructure:

| Task | Description | Files |
|------|-------------|-------|
| 1 | Scaffold Tour Service | 6 files |
| 2 | Tour Prisma Schema | 1 file |
| 3 | Tour GraphQL Schema | 2 files |
| 4 | Scaffold 4 More Services | 24 files |
| 5 | Update Gateway | 2 files |
| 6 | Update Docker Compose | 1 file |
| 7 | Shared Types | 1 file |
| 8 | Verification | - |

**Next Phase:** Provider integration, booking flow, voucher generation

---

## Notes for Implementation

1. **Follow existing patterns** - Look at `shuttle-service` for reference
2. **TDD where practical** - Write tests for resolvers
3. **Commit frequently** - One logical change per commit
4. **Typecheck often** - Run `pnpm typecheck` after changes
5. **Reference the design doc** - `docs/plans/2026-02-17-tour-xperience-architecture-design.md`
