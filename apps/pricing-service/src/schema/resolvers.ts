import { type Prisma } from '@prisma/client';
import { GraphQLScalarType, Kind } from 'graphql';

import { prisma } from '../prisma.js';

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
    return null;
  },
});

export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,

  Query: {
    price: (_: unknown, { scheduleId }: { scheduleId: string; seatType?: string }) =>
      prisma.price.findUnique({ where: { scheduleId } }),

    prices: (_: unknown, { routeId }: { routeId?: string }) =>
      prisma.price.findMany({
        where: routeId ? { routeId, isActive: true } : { isActive: true },
        orderBy: { createdAt: 'desc' },
      }),

    calculateFare: async (_: unknown, { input }: { input: { scheduleId: string; seatType?: string; seatCount: number; bookingDate?: Date } }) => {
      const { scheduleId, seatType = 'REGULAR', seatCount, bookingDate } = input;

      const price = await prisma.price.findUnique({ where: { scheduleId } });
      if (!price) {
        throw new Error(`Price not found for schedule ${scheduleId}`);
      }

      let basePrice = price.basePrice;
      let seatTypeAdjustment = 0;

      // Get seat type pricing
      const seatTypePrice = await prisma.seatTypePrice.findFirst({
        where: {
          OR: [
            { routeId: price.routeId, seatType, isActive: true },
            { routeId: null, seatType, isActive: true },
          ],
        },
        orderBy: { routeId: 'desc' }, // Route-specific takes precedence
      });

      if (seatTypePrice) {
        seatTypeAdjustment = basePrice * (seatTypePrice.multiplier - 1) + seatTypePrice.fixedExtra;
      }

      // Get applicable price rules
      const now = bookingDate ?? new Date();
      const rules = await prisma.priceRule.findMany({
        where: {
          isActive: true,
          OR: [
            { routeId: price.routeId },
            { routeId: null },
          ],
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validTo: null }, { validTo: { gte: now } }] },
          ],
        },
        orderBy: { priority: 'desc' },
      });

      const ruleAdjustments: Array<{ ruleName: string; ruleType: string; adjustment: number }> = [];
      let priceAfterRules = basePrice + seatTypeAdjustment;

      for (const rule of rules) {
        let adjustment = 0;
        if (rule.adjustmentType === 'PERCENTAGE') {
          adjustment = priceAfterRules * (rule.adjustment / 100);
        } else {
          adjustment = rule.adjustment;
        }
        ruleAdjustments.push({
          ruleName: rule.name,
          ruleType: rule.ruleType,
          adjustment,
        });
        priceAfterRules += adjustment;
      }

      const totalPrice = Math.max(0, priceAfterRules) * seatCount;

      return {
        basePrice: basePrice * seatCount,
        seatTypeAdjustment: seatTypeAdjustment * seatCount,
        ruleAdjustments,
        subtotal: (basePrice + seatTypeAdjustment) * seatCount,
        totalPrice,
        currency: price.currency,
      };
    },

    priceRules: (_: unknown, { filter }: { filter?: { ruleType?: string; routeId?: string; isActive?: boolean } }) => {
      const where: Prisma.PriceRuleWhereInput = {};
      if (filter?.ruleType) where.ruleType = filter.ruleType as Prisma.EnumPriceRuleTypeFilter;
      if (filter?.routeId) where.routeId = filter.routeId;
      if (filter?.isActive !== undefined) where.isActive = filter.isActive;

      return prisma.priceRule.findMany({
        where,
        orderBy: { priority: 'desc' },
      });
    },

    priceRule: (_: unknown, { id }: { id: string }) =>
      prisma.priceRule.findUnique({ where: { id } }),

    seatTypePrices: (_: unknown, { routeId }: { routeId?: string }) =>
      prisma.seatTypePrice.findMany({
        where: routeId ? { routeId, isActive: true } : { isActive: true },
      }),
  },

  Mutation: {
    createPrice: (_: unknown, { input }: { input: { scheduleId: string; routeId: string; basePrice: number; currency?: string } }) =>
      prisma.price.create({
        data: {
          ...input,
          currency: input.currency ?? 'IDR',
        },
      }),

    updatePrice: (_: unknown, { id, input }: { id: string; input: { basePrice?: number; currency?: string; isActive?: boolean } }) =>
      prisma.price.update({
        where: { id },
        data: input,
      }),

    createPriceRule: (_: unknown, { input }: { input: { name: string; description?: string; ruleType: string; routeId?: string; conditions: unknown; adjustment: number; adjustmentType: string; priority?: number; validFrom?: Date; validTo?: Date } }) =>
      prisma.priceRule.create({
        data: {
          ...input,
          ruleType: input.ruleType as 'SURGE' | 'TIME_BASED' | 'DAY_OF_WEEK' | 'ADVANCE_BOOKING' | 'HOLIDAY' | 'PROMOTIONAL',
          adjustmentType: input.adjustmentType as 'PERCENTAGE' | 'FIXED',
          priority: input.priority ?? 0,
        },
      }),

    updatePriceRule: (_: unknown, { id, input }: { id: string; input: { name?: string; description?: string; conditions?: unknown; adjustment?: number; adjustmentType?: string; priority?: number; isActive?: boolean; validFrom?: Date; validTo?: Date } }) =>
      prisma.priceRule.update({
        where: { id },
        data: {
          ...input,
          adjustmentType: input.adjustmentType as 'PERCENTAGE' | 'FIXED' | undefined,
        },
      }),

    deletePriceRule: async (_: unknown, { id }: { id: string }) => {
      await prisma.priceRule.delete({ where: { id } });
      return true;
    },

    createSeatTypePrice: (_: unknown, { input }: { input: { routeId?: string; seatType: string; multiplier?: number; fixedExtra?: number } }) =>
      prisma.seatTypePrice.create({
        data: {
          ...input,
          multiplier: input.multiplier ?? 1.0,
          fixedExtra: input.fixedExtra ?? 0,
        },
      }),

    updateSeatTypePrice: (_: unknown, { id, input }: { id: string; input: { multiplier?: number; fixedExtra?: number; isActive?: boolean } }) =>
      prisma.seatTypePrice.update({
        where: { id },
        data: input,
      }),
  },

  Price: {
    __resolveReference: (ref: { id: string }) =>
      prisma.price.findUnique({ where: { id: ref.id } }),
  },

  PriceRule: {
    __resolveReference: (ref: { id: string }) =>
      prisma.priceRule.findUnique({ where: { id: ref.id } }),
  },

  SeatTypePrice: {
    __resolveReference: (ref: { id: string }) =>
      prisma.seatTypePrice.findUnique({ where: { id: ref.id } }),
  },
};
