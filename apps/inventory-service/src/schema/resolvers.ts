import { GraphQLScalarType, Kind } from 'graphql';
import { prisma } from '../prisma.js';

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime scalar type',
  serialize(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    throw new Error('DateTime must be a Date object');
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    throw new Error('DateTime must be a string or number');
  },
  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
      return new Date(ast.kind === Kind.STRING ? ast.value : parseInt(ast.value, 10));
    }
    throw new Error('DateTime must be a string or number');
  },
});

const DecimalScalar = new GraphQLScalarType({
  name: 'Decimal',
  description: 'Decimal scalar type',
  serialize(value: unknown): string {
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'toString' in value) return value.toString();
    throw new Error('Decimal must be a number or string');
  },
  parseValue(value: unknown): number {
    if (typeof value === 'string') return parseFloat(value);
    if (typeof value === 'number') return value;
    throw new Error('Decimal must be a string or number');
  },
  parseLiteral(ast): number {
    if (ast.kind === Kind.STRING || ast.kind === Kind.FLOAT || ast.kind === Kind.INT) {
      return parseFloat(ast.value);
    }
    throw new Error('Decimal must be a string or number');
  },
});

export const resolvers = {
  DateTime: DateTimeScalar,
  Decimal: DecimalScalar,

  Query: {
    inventoryPool: async (_: unknown, { tourId, date }: { tourId: string; date: Date }) => {
      return prisma.inventoryPool.findUnique({
        where: { tourId_date: { tourId, date } },
      });
    },

    inventoryAvailability: async (
      _: unknown,
      { tourId, startDate, endDate }: { tourId: string; startDate: Date; endDate: Date }
    ) => {
      return prisma.inventoryPool.findMany({
        where: {
          tourId,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'asc' },
      });
    },
  },

  Mutation: {
    createInventoryHold: async (
      _: unknown,
      { input }: { input: { tourId: string; date: Date; quantity: number; durationMinutes?: number } }
    ) => {
      const { tourId, date, quantity, durationMinutes = 15 } = input;
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

      const pool = await prisma.inventoryPool.findUnique({
        where: { tourId_date: { tourId, date } },
      });

      if (!pool || pool.availableQty < quantity) {
        throw new Error('Insufficient inventory');
      }

      const [hold] = await prisma.$transaction([
        prisma.inventoryHold.create({
          data: { poolId: pool.id, quantity, expiresAt },
        }),
        prisma.inventoryPool.update({
          where: { id: pool.id },
          data: {
            availableQty: { decrement: quantity },
            holdQty: { increment: quantity },
          },
        }),
      ]);

      return hold;
    },

    releaseHold: async (_: unknown, { holdId }: { holdId: string }) => {
      const hold = await prisma.inventoryHold.findUnique({
        where: { id: holdId },
      });

      if (!hold || hold.status !== 'ACTIVE') return false;

      await prisma.$transaction([
        prisma.inventoryHold.update({
          where: { id: holdId },
          data: { status: 'RELEASED' },
        }),
        prisma.inventoryPool.update({
          where: { id: hold.poolId },
          data: {
            availableQty: { increment: hold.quantity },
            holdQty: { decrement: hold.quantity },
          },
        }),
      ]);

      return true;
    },

    convertHoldToBooking: async (
      _: unknown,
      { holdId, bookingId }: { holdId: string; bookingId: string }
    ) => {
      const hold = await prisma.inventoryHold.findUnique({
        where: { id: holdId },
      });

      if (!hold || hold.status !== 'ACTIVE') {
        throw new Error('Hold not found or not active');
      }

      const [updatedHold] = await prisma.$transaction([
        prisma.inventoryHold.update({
          where: { id: holdId },
          data: { status: 'CONVERTED', bookingId },
        }),
        prisma.inventoryPool.update({
          where: { id: hold.poolId },
          data: {
            holdQty: { decrement: hold.quantity },
            soldQty: { increment: hold.quantity },
          },
        }),
      ]);

      return updatedHold;
    },
  },

  InventoryPool: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.inventoryPool.findUnique({ where: { id: reference.id } });
    },
  },

  InventoryHold: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.inventoryHold.findUnique({ where: { id: reference.id } });
    },
  },
};
