import { type Prisma } from '@prisma/client';
import { GraphQLScalarType, Kind } from 'graphql';

import { generateBookingCode } from '@travelplatform/shared-utils';

import { type ServiceContext } from '../index.js';
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
    booking: (_: unknown, { id }: { id: string }) =>
      prisma.booking.findUnique({
        where: { id },
        include: { travelers: true },
      }),

    bookingByCode: (_: unknown, { code }: { code: string }) =>
      prisma.booking.findUnique({
        where: { code },
        include: { travelers: true },
      }),

    myBookings: (_: unknown, { filter }: { filter?: { status?: string; fromDate?: Date; toDate?: Date } }, context: ServiceContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const where: Prisma.BookingWhereInput = {
        customerId: context.user.id,
      };

      if (filter?.status) {
        where.status = filter.status as Prisma.EnumBookingStatusFilter;
      }

      if (filter?.fromDate || filter?.toDate) {
        where.createdAt = {};
        if (filter.fromDate) where.createdAt.gte = filter.fromDate;
        if (filter.toDate) where.createdAt.lte = filter.toDate;
      }

      return prisma.booking.findMany({
        where,
        include: { travelers: true },
        orderBy: { createdAt: 'desc' },
      });
    },

    bookings: async (_: unknown, { filter }: { filter?: { customerId?: string; scheduleId?: string; status?: string; fromDate?: Date; toDate?: Date; first?: number; after?: string } }) => {
      const where: Prisma.BookingWhereInput = {};

      if (filter?.customerId) where.customerId = filter.customerId;
      if (filter?.scheduleId) where.scheduleId = filter.scheduleId;
      if (filter?.status) where.status = filter.status as Prisma.EnumBookingStatusFilter;

      if (filter?.fromDate || filter?.toDate) {
        where.createdAt = {};
        if (filter.fromDate) where.createdAt.gte = filter.fromDate;
        if (filter.toDate) where.createdAt.lte = filter.toDate;
      }

      const take = filter?.first ?? 20;
      const cursor = filter?.after ? { id: filter.after } : undefined;

      const [bookings, totalCount] = await Promise.all([
        prisma.booking.findMany({
          where,
          include: { travelers: true },
          take: take + 1,
          cursor,
          skip: cursor ? 1 : 0,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.booking.count({ where }),
      ]);

      const hasNextPage = bookings.length > take;
      const nodes = hasNextPage ? bookings.slice(0, -1) : bookings;

      return {
        nodes,
        totalCount,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!filter?.after,
          startCursor: nodes[0]?.id ?? null,
          endCursor: nodes[nodes.length - 1]?.id ?? null,
        },
      };
    },

    traveler: (_: unknown, { id }: { id: string }) =>
      prisma.traveler.findUnique({ where: { id } }),
  },

  Mutation: {
    createBooking: async (_: unknown, { input }: { input: { scheduleId: string; seatLockId: string; seatIds: string[]; voucherId?: string; travelers: Array<{ seatId: string; name: string; idType?: string; idNumber?: string; phone?: string; email?: string; isPrimary?: boolean }>; notes?: string } }, context: ServiceContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const code = generateBookingCode();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      // TODO: Call pricing-service to get actual price
      const totalAmount = 100000 * input.seatIds.length;
      const discountAmount = 0;
      const finalAmount = totalAmount - discountAmount;

      const booking = await prisma.booking.create({
        data: {
          code,
          customerId: context.user.id,
          scheduleId: input.scheduleId,
          seatLockId: input.seatLockId,
          seatIds: input.seatIds,
          voucherId: input.voucherId,
          totalAmount,
          discountAmount,
          finalAmount,
          notes: input.notes,
          expiresAt,
          priceSnapshot: {
            basePrice: totalAmount,
            seatCount: input.seatIds.length,
          },
          travelers: {
            create: input.travelers.map((t) => ({
              ...t,
              idType: t.idType as 'KTP' | 'SIM' | 'PASSPORT' | 'OTHER' | undefined,
              isPrimary: t.isPrimary ?? false,
            })),
          },
        },
        include: { travelers: true },
      });

      return booking;
    },

    cancelBooking: async (_: unknown, { id, reason }: { id: string; reason?: string }) => {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) {
        throw new Error('Booking not found');
      }

      if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
        throw new Error(`Cannot cancel booking with status ${booking.status}`);
      }

      return prisma.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason,
        },
        include: { travelers: true },
      });
    },

    rescheduleBooking: async (_: unknown, { id, newScheduleId, newSeatIds }: { id: string; newScheduleId: string; newSeatIds: string[] }) => {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== 'CONFIRMED') {
        throw new Error('Only confirmed bookings can be rescheduled');
      }

      return prisma.booking.update({
        where: { id },
        data: {
          scheduleId: newScheduleId,
          seatIds: newSeatIds,
        },
        include: { travelers: true },
      });
    },

    confirmBooking: async (_: unknown, { id, paymentId }: { id: string; paymentId: string }) => {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== 'PENDING') {
        throw new Error(`Cannot confirm booking with status ${booking.status}`);
      }

      return prisma.booking.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          paymentId,
          confirmedAt: new Date(),
        },
        include: { travelers: true },
      });
    },

    expireBooking: async (_: unknown, { id }: { id: string }) => {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== 'PENDING') {
        throw new Error(`Cannot expire booking with status ${booking.status}`);
      }

      return prisma.booking.update({
        where: { id },
        data: { status: 'EXPIRED' },
        include: { travelers: true },
      });
    },

    updateTraveler: (_: unknown, { id, input }: { id: string; input: { name?: string; idType?: string; idNumber?: string; phone?: string; email?: string } }) =>
      prisma.traveler.update({
        where: { id },
        data: {
          ...input,
          idType: input.idType as 'KTP' | 'SIM' | 'PASSPORT' | 'OTHER' | undefined,
        },
      }),
  },

  Booking: {
    __resolveReference: (ref: { id: string }) =>
      prisma.booking.findUnique({
        where: { id: ref.id },
        include: { travelers: true },
      }),
    travelers: (parent: { id: string }) =>
      prisma.traveler.findMany({ where: { bookingId: parent.id } }),
  },

  Traveler: {
    __resolveReference: (ref: { id: string }) =>
      prisma.traveler.findUnique({ where: { id: ref.id } }),
  },
};
