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
    seats: (_: unknown, { scheduleId }: { scheduleId: string }) =>
      prisma.seat.findMany({
        where: { scheduleId },
        orderBy: { seatNumber: 'asc' },
      }),

    seat: (_: unknown, { id }: { id: string }) =>
      prisma.seat.findUnique({ where: { id } }),

    seatLayout: (_: unknown, { vehicleId }: { vehicleId: string }) =>
      prisma.seatLayout.findUnique({ where: { vehicleId } }),

    seatLayouts: () =>
      prisma.seatLayout.findMany({ orderBy: { name: 'asc' } }),

    seatLock: (_: unknown, { id }: { id: string }) =>
      prisma.seatLock.findUnique({ where: { id } }),

    seatLockBySession: (_: unknown, { sessionId }: { sessionId: string }) =>
      prisma.seatLock.findFirst({
        where: { sessionId, status: 'ACTIVE' },
      }),
  },

  Mutation: {
    createSeatLayout: (_: unknown, { input }: { input: { vehicleId: string; name: string; rows: number; columns: number; layout: unknown } }) =>
      prisma.seatLayout.create({ data: input }),

    updateSeatLayout: (_: unknown, { id, input }: { id: string; input: { name?: string; rows?: number; columns?: number; layout?: unknown } }) =>
      prisma.seatLayout.update({
        where: { id },
        data: input,
      }),

    initializeSeats: async (_: unknown, { scheduleId, vehicleId }: { scheduleId: string; vehicleId: string }) => {
      const layout = await prisma.seatLayout.findUnique({ where: { vehicleId } });
      if (!layout) {
        throw new Error(`Seat layout not found for vehicle ${vehicleId}`);
      }

      const existingSeats = await prisma.seat.findMany({ where: { scheduleId } });
      if (existingSeats.length > 0) {
        return existingSeats;
      }

      // Generate seats based on layout
      const layoutData = layout.layout as { seats: Array<{ number: string; type: string }> };
      const seats = layoutData.seats.map((seatConfig) => ({
        scheduleId,
        layoutId: layout.id,
        seatNumber: seatConfig.number,
        seatType: (seatConfig.type as 'REGULAR' | 'PREMIUM' | 'VIP') || 'REGULAR',
        status: 'AVAILABLE' as const,
      }));

      await prisma.seat.createMany({ data: seats });
      return prisma.seat.findMany({ where: { scheduleId }, orderBy: { seatNumber: 'asc' } });
    },

    lockSeats: async (_: unknown, { input }: { input: { scheduleId: string; seatIds: string[]; customerId?: string; sessionId: string; durationMinutes?: number } }) => {
      const { scheduleId, seatIds, customerId, sessionId, durationMinutes = 15 } = input;

      // Check if seats are available
      const seats = await prisma.seat.findMany({
        where: { id: { in: seatIds }, scheduleId },
      });

      if (seats.length !== seatIds.length) {
        throw new Error('Some seats not found');
      }

      const unavailableSeats = seats.filter(s => s.status !== 'AVAILABLE');
      if (unavailableSeats.length > 0) {
        throw new Error(`Seats ${unavailableSeats.map(s => s.seatNumber).join(', ')} are not available`);
      }

      // Create lock and update seat status
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

      const [seatLock] = await prisma.$transaction([
        prisma.seatLock.create({
          data: {
            scheduleId,
            seatIds,
            customerId,
            sessionId,
            expiresAt,
          },
        }),
        prisma.seat.updateMany({
          where: { id: { in: seatIds } },
          data: { status: 'LOCKED' },
        }),
      ]);

      return seatLock;
    },

    unlockSeats: async (_: unknown, { lockId }: { lockId: string }) => {
      const lock = await prisma.seatLock.findUnique({ where: { id: lockId } });
      if (!lock || lock.status !== 'ACTIVE') {
        return false;
      }

      await prisma.$transaction([
        prisma.seatLock.update({
          where: { id: lockId },
          data: { status: 'RELEASED' },
        }),
        prisma.seat.updateMany({
          where: { id: { in: lock.seatIds } },
          data: { status: 'AVAILABLE' },
        }),
      ]);

      return true;
    },

    confirmSeats: async (_: unknown, { lockId, bookingId }: { lockId: string; bookingId: string }) => {
      const lock = await prisma.seatLock.findUnique({ where: { id: lockId } });
      if (!lock || lock.status !== 'ACTIVE') {
        throw new Error('Invalid or expired seat lock');
      }

      await prisma.$transaction([
        prisma.seatLock.update({
          where: { id: lockId },
          data: { status: 'CONFIRMED' },
        }),
        prisma.seat.updateMany({
          where: { id: { in: lock.seatIds } },
          data: { status: 'BOOKED', bookingId },
        }),
      ]);

      return prisma.seat.findMany({
        where: { id: { in: lock.seatIds } },
      });
    },

    releaseExpiredLocks: async () => {
      const expiredLocks = await prisma.seatLock.findMany({
        where: {
          status: 'ACTIVE',
          expiresAt: { lt: new Date() },
        },
      });

      let releasedCount = 0;
      for (const lock of expiredLocks) {
        await prisma.$transaction([
          prisma.seatLock.update({
            where: { id: lock.id },
            data: { status: 'EXPIRED' },
          }),
          prisma.seat.updateMany({
            where: { id: { in: lock.seatIds } },
            data: { status: 'AVAILABLE' },
          }),
        ]);
        releasedCount++;
      }

      return releasedCount;
    },
  },

  Seat: {
    __resolveReference: (ref: { id: string }) =>
      prisma.seat.findUnique({ where: { id: ref.id } }),
    layout: (parent: { layoutId: string }) =>
      prisma.seatLayout.findUnique({ where: { id: parent.layoutId } }),
  },

  SeatLayout: {
    __resolveReference: (ref: { id: string }) =>
      prisma.seatLayout.findUnique({ where: { id: ref.id } }),
  },

  SeatLock: {
    __resolveReference: (ref: { id: string }) =>
      prisma.seatLock.findUnique({ where: { id: ref.id } }),
  },
};
