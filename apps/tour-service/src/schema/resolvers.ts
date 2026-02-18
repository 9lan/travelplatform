import type { Prisma } from '../generated/prisma';
import { GraphQLScalarType, Kind } from 'graphql';
import { GraphQLError } from 'graphql';

import { encodeCursor, decodeCursor } from '@travelplatform/shared-utils';

import { prisma } from '../prisma.js';

// ─────────────────────────────────────────────
// Custom Scalars
// ─────────────────────────────────────────────

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime scalar type',
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    throw new Error('DateTime must be a Date object');
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    throw new Error('DateTime must be a string or number');
  },
  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
      return new Date(ast.kind === Kind.STRING ? ast.value : parseInt(ast.value, 10));
    }
    throw new Error('DateTime must be a string or number');
  },
});

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON scalar type',
  serialize(value: unknown): unknown {
    return value;
  },
  parseValue(value: unknown): unknown {
    return value;
  },
  parseLiteral(ast): unknown {
    if (ast.kind === Kind.STRING) {
      return JSON.parse(ast.value);
    }
    if (ast.kind === Kind.OBJECT) {
      return ast;
    }
    return null;
  },
});

const DecimalScalar = new GraphQLScalarType({
  name: 'Decimal',
  description: 'Decimal scalar type for precise monetary values',
  serialize(value: unknown): string {
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object' && 'toString' in value) {
      return value.toString();
    }
    throw new Error('Decimal must be a number, string, or Prisma Decimal');
  },
  parseValue(value: unknown): number {
    if (typeof value === 'string') {
      return parseFloat(value);
    }
    if (typeof value === 'number') {
      return value;
    }
    throw new Error('Decimal must be a string or number');
  },
  parseLiteral(ast): number {
    if (ast.kind === Kind.STRING || ast.kind === Kind.FLOAT || ast.kind === Kind.INT) {
      return parseFloat(ast.kind === Kind.STRING ? ast.value : ast.value);
    }
    throw new Error('Decimal must be a string or number');
  },
});

// ─────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}

function generateTourCode(): string {
  return `TOUR-${Date.now().toString(36).toUpperCase()}`;
}

type SortDirection = 'asc' | 'desc';

function getOrderBy(
  sortBy: string,
  sortOrder: string
): Prisma.TourOrderByWithRelationInput {
  const order: SortDirection = sortOrder === 'ASC' ? 'asc' : 'desc';

  switch (sortBy) {
    case 'PRICE_LOW':
      return { basePrice: 'asc' };
    case 'PRICE_HIGH':
      return { basePrice: 'desc' };
    case 'DURATION':
      return { durationDays: order };
    case 'RATING':
    case 'POPULARITY':
    case 'RELEVANCE':
    default:
      return { createdAt: 'desc' };
  }
}

// ─────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────

interface TourSearchInput {
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

interface CreateDestinationInput {
  name: string;
  slug: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
}

interface CreateCategoryInput {
  name: string;
  slug: string;
  icon?: string;
  parentId?: string;
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
  images?: unknown[];
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
  images?: unknown[];
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

// ─────────────────────────────────────────────
// Resolvers
// ─────────────────────────────────────────────

export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
  Decimal: DecimalScalar,

  Query: {
    // ─────────────────────────────────────────────
    // Tour Discovery
    // ─────────────────────────────────────────────

    searchTours: async (_: unknown, { input }: { input: TourSearchInput }) => {
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

      const where: Prisma.TourWhereInput = {
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

      if (priceRange?.min !== undefined || priceRange?.max !== undefined) {
        where.basePrice = {};
        if (priceRange.min !== undefined) where.basePrice.gte = priceRange.min;
        if (priceRange.max !== undefined) where.basePrice.lte = priceRange.max;
      }

      if (difficulty?.length) {
        where.difficulty = { in: difficulty as Prisma.EnumDifficultyFilter['in'] };
      }

      if (sources?.length) {
        where.source = { in: sources as Prisma.EnumTourSourceFilter['in'] };
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

      const take = Math.min(first, 50);
      const cursor = after ? { id: decodeCursor(after) } : undefined;
      const orderBy = getOrderBy(sortBy, sortOrder);

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
            itinerary: {
              include: { items: { orderBy: { sequence: 'asc' } } },
              orderBy: { dayNumber: 'asc' },
            },
          },
        }),
        prisma.tour.count({ where }),
      ]);

      const hasNextPage = tours.length > take;
      const resultTours = tours.slice(0, take);
      const edges = resultTours.map((tour) => ({
        cursor: encodeCursor(tour.id),
        node: tour,
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!cursor,
          startCursor: edges[0]?.cursor ?? null,
          endCursor: edges[edges.length - 1]?.cursor ?? null,
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
      const where: Prisma.TourWhereInput = { status: 'ACTIVE' };
      if (destinationId) where.destinationId = destinationId;

      return prisma.tour.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          destination: true,
          categories: { include: { category: true } },
          themes: true,
        },
      });
    },

    // ─────────────────────────────────────────────
    // Destinations
    // ─────────────────────────────────────────────

    destinations: async (
      _: unknown,
      { first = 20, after }: { first?: number; after?: string }
    ) => {
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
      const resultDestinations = destinations.slice(0, take);
      const edges = resultDestinations.map((dest) => ({
        cursor: encodeCursor(dest.id),
        node: dest,
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!cursor,
          startCursor: edges[0]?.cursor ?? null,
          endCursor: edges[edges.length - 1]?.cursor ?? null,
        },
        totalCount,
      };
    },

    destinationById: async (_: unknown, { id }: { id: string }) => {
      return prisma.destination.findUnique({ where: { id } });
    },

    destinationBySlug: async (_: unknown, { slug }: { slug: string }) => {
      return prisma.destination.findUnique({ where: { slug } });
    },

    // ─────────────────────────────────────────────
    // Categories
    // ─────────────────────────────────────────────

    categories: async () => {
      return prisma.category.findMany({
        where: { parentId: null },
        include: { children: true, parent: true },
        orderBy: { name: 'asc' },
      });
    },

    categoryById: async (_: unknown, { id }: { id: string }) => {
      return prisma.category.findUnique({
        where: { id },
        include: { children: true, parent: true },
      });
    },

    // ─────────────────────────────────────────────
    // Popular
    // ─────────────────────────────────────────────

    popularDestinations: async (_: unknown, { limit = 10 }: { limit?: number }) => {
      return prisma.destination.findMany({
        where: { isActive: true },
        take: limit,
        orderBy: {
          tours: { _count: 'desc' },
        },
      });
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
    // ─────────────────────────────────────────────
    // Destination Management
    // ─────────────────────────────────────────────

    createDestination: async (
      _: unknown,
      { input }: { input: CreateDestinationInput }
    ) => {
      return prisma.destination.create({
        data: input,
      });
    },

    updateDestination: async (
      _: unknown,
      { id, input }: { id: string; input: CreateDestinationInput }
    ) => {
      return prisma.destination.update({
        where: { id },
        data: input,
      });
    },

    deleteDestination: async (_: unknown, { id }: { id: string }) => {
      await prisma.destination.delete({ where: { id } });
      return true;
    },

    // ─────────────────────────────────────────────
    // Category Management
    // ─────────────────────────────────────────────

    createCategory: async (
      _: unknown,
      { input }: { input: CreateCategoryInput }
    ) => {
      return prisma.category.create({
        data: input,
        include: { children: true, parent: true },
      });
    },

    updateCategory: async (
      _: unknown,
      { id, input }: { id: string; input: CreateCategoryInput }
    ) => {
      return prisma.category.update({
        where: { id },
        data: input,
        include: { children: true, parent: true },
      });
    },

    deleteCategory: async (_: unknown, { id }: { id: string }) => {
      await prisma.category.delete({ where: { id } });
      return true;
    },

    // ─────────────────────────────────────────────
    // Tour Management
    // ─────────────────────────────────────────────

    createTour: async (_: unknown, { input }: { input: CreateTourInput }) => {
      const { categoryIds, themes, images, ...tourData } = input;

      const code = generateTourCode();
      const slug = generateSlug(input.name);

      const tour = await prisma.tour.create({
        data: {
          ...tourData,
          code,
          slug,
          type: tourData.type as Prisma.TourCreateInput['type'],
          source: tourData.source as Prisma.TourCreateInput['source'],
          difficulty: (tourData.difficulty as Prisma.TourCreateInput['difficulty']) ?? 'EASY',
          minPax: tourData.minPax ?? 1,
          images: (images ?? []) as Prisma.InputJsonValue,
          highlights: tourData.highlights ?? [],
          inclusions: tourData.inclusions ?? [],
          exclusions: tourData.exclusions ?? [],
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
          itinerary: {
            include: { items: { orderBy: { sequence: 'asc' } } },
            orderBy: { dayNumber: 'asc' },
          },
        },
      });

      return tour;
    },

    updateTour: async (
      _: unknown,
      { id, input }: { id: string; input: UpdateTourInput }
    ) => {
      const { categoryIds, themes, images, ...updateData } = input;

      // Handle category updates
      if (categoryIds !== undefined) {
        await prisma.tourCategory.deleteMany({ where: { tourId: id } });
        if (categoryIds.length > 0) {
          await prisma.tourCategory.createMany({
            data: categoryIds.map((categoryId) => ({ tourId: id, categoryId })),
          });
        }
      }

      // Handle theme updates
      if (themes !== undefined) {
        await prisma.tourTheme.deleteMany({ where: { tourId: id } });
        if (themes.length > 0) {
          await prisma.tourTheme.createMany({
            data: themes.map((theme) => ({ tourId: id, theme })),
          });
        }
      }

      const data: Prisma.TourUpdateInput = {};
      if (updateData.name !== undefined) data.name = updateData.name;
      if (updateData.description !== undefined) data.description = updateData.description;
      if (updateData.difficulty !== undefined)
        data.difficulty = updateData.difficulty as Prisma.TourUpdateInput['difficulty'];
      if (updateData.minPax !== undefined) data.minPax = updateData.minPax;
      if (updateData.maxPax !== undefined) data.maxPax = updateData.maxPax;
      if (updateData.basePrice !== undefined) data.basePrice = updateData.basePrice;
      if (updateData.highlights !== undefined) data.highlights = updateData.highlights;
      if (updateData.inclusions !== undefined) data.inclusions = updateData.inclusions;
      if (updateData.exclusions !== undefined) data.exclusions = updateData.exclusions;
      if (images !== undefined) data.images = images as Prisma.InputJsonValue;
      if (updateData.status !== undefined)
        data.status = updateData.status as Prisma.TourUpdateInput['status'];

      return prisma.tour.update({
        where: { id },
        data,
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
          itinerary: {
            include: { items: { orderBy: { sequence: 'asc' } } },
            orderBy: { dayNumber: 'asc' },
          },
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
          itinerary: {
            include: { items: { orderBy: { sequence: 'asc' } } },
            orderBy: { dayNumber: 'asc' },
          },
        },
      });
    },

    deleteTour: async (_: unknown, { id }: { id: string }) => {
      await prisma.tour.delete({ where: { id } });
      return true;
    },

    // ─────────────────────────────────────────────
    // Itinerary Management
    // ─────────────────────────────────────────────

    addItineraryDay: async (
      _: unknown,
      { tourId, input }: { tourId: string; input: ItineraryDayInput }
    ) => {
      const itinerary = await prisma.itinerary.create({
        data: {
          tourId,
          dayNumber: input.dayNumber,
          title: input.title,
          description: input.description,
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
      {
        tourId,
        dayNumber,
        input,
      }: { tourId: string; dayNumber: number; input: ItineraryDayInput }
    ) => {
      const itinerary = await prisma.itinerary.update({
        where: {
          tourId_dayNumber: { tourId, dayNumber },
        },
        data: {
          title: input.title,
          description: input.description,
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

    removeItineraryDay: async (
      _: unknown,
      { tourId, dayNumber }: { tourId: string; dayNumber: number }
    ) => {
      await prisma.itinerary.delete({
        where: { tourId_dayNumber: { tourId, dayNumber } },
      });
      return true;
    },

    addItineraryItem: async (
      _: unknown,
      {
        tourId,
        dayNumber,
        input,
      }: { tourId: string; dayNumber: number; input: ItineraryItemInput }
    ) => {
      const itinerary = await prisma.itinerary.findUnique({
        where: { tourId_dayNumber: { tourId, dayNumber } },
        include: { items: true },
      });

      if (!itinerary) {
        throw new GraphQLError(`Itinerary day ${dayNumber} not found for tour ${tourId}`, {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const nextSequence = itinerary.items.length + 1;

      return prisma.itineraryItem.create({
        data: {
          itineraryId: itinerary.id,
          sequence: nextSequence,
          componentType: input.componentType as Prisma.ItineraryItemCreateInput['componentType'],
          componentId: input.componentId,
          startTime: input.startTime,
          endTime: input.endTime,
          isOptional: input.isOptional ?? false,
          priceOverride: input.priceOverride,
          notes: input.notes,
        },
      });
    },

    updateItineraryItem: async (
      _: unknown,
      { itemId, input }: { itemId: string; input: ItineraryItemInput }
    ) => {
      return prisma.itineraryItem.update({
        where: { id: itemId },
        data: {
          componentType: input.componentType as Prisma.ItineraryItemUpdateInput['componentType'],
          componentId: input.componentId,
          startTime: input.startTime,
          endTime: input.endTime,
          isOptional: input.isOptional,
          priceOverride: input.priceOverride,
          notes: input.notes,
        },
      });
    },

    removeItineraryItem: async (_: unknown, { itemId }: { itemId: string }) => {
      await prisma.itineraryItem.delete({
        where: { id: itemId },
      });
      return true;
    },

    reorderItineraryItems: async (
      _: unknown,
      {
        tourId,
        dayNumber,
        itemIds,
      }: { tourId: string; dayNumber: number; itemIds: string[] }
    ) => {
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

      if (!itinerary) {
        throw new GraphQLError(`Itinerary day ${dayNumber} not found for tour ${tourId}`, {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      return {
        dayNumber: itinerary.dayNumber,
        title: itinerary.title,
        description: itinerary.description,
        items: itinerary.items,
      };
    },
  },

  // ─────────────────────────────────────────────
  // Field Resolvers
  // ─────────────────────────────────────────────

  Tour: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.tour.findUnique({
        where: { id: reference.id },
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

    duration: (tour: { durationDays: number; durationNights: number }) => ({
      days: tour.durationDays,
      nights: tour.durationNights,
    }),

    priceFrom: (tour: { basePrice: unknown; currency: string }) => ({
      amount: tour.basePrice,
      currency: tour.currency,
    }),

    categories: (tour: { categories?: Array<{ category: unknown }> }) => {
      if (tour.categories) {
        return tour.categories.map((tc) => tc.category);
      }
      return [];
    },

    themes: (tour: { themes?: Array<{ theme: string }> }) => {
      if (tour.themes) {
        return tour.themes.map((tt) => tt.theme);
      }
      return [];
    },

    images: (tour: { images?: unknown }) => {
      if (Array.isArray(tour.images)) {
        return tour.images;
      }
      return [];
    },

    itinerary: (tour: {
      itinerary?: Array<{
        dayNumber: number;
        title: string;
        description: string | null;
        items: unknown[];
      }>;
    }) => {
      if (tour.itinerary) {
        return tour.itinerary.map((it) => ({
          dayNumber: it.dayNumber,
          title: it.title,
          description: it.description,
          items: it.items || [],
        }));
      }
      return [];
    },

    rating: async (tour: { id: string }) => {
      const metadata = await prisma.tourSearchMetadata.findUnique({
        where: { tourId: tour.id },
      });
      if (!metadata) return null;
      return {
        average: metadata.avgRating,
        count: metadata.reviewCount,
      };
    },

    bookingCount: async (tour: { id: string }) => {
      const metadata = await prisma.tourSearchMetadata.findUnique({
        where: { tourId: tour.id },
      });
      return metadata?.bookingCount ?? 0;
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

    parent: async (category: { parentId?: string | null }) => {
      if (!category.parentId) return null;
      return prisma.category.findUnique({ where: { id: category.parentId } });
    },

    children: async (category: { id: string }) => {
      return prisma.category.findMany({ where: { parentId: category.id } });
    },
  },
};
