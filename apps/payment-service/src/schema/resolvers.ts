import { type Prisma } from '../generated/prisma';
import { GraphQLScalarType, Kind } from 'graphql';

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
    payment: (_: unknown, { id }: { id: string }) =>
      prisma.payment.findUnique({
        where: { id },
        include: { transactions: true, refunds: true },
      }),

    paymentByBooking: (_: unknown, { bookingId }: { bookingId: string }) =>
      prisma.payment.findUnique({
        where: { bookingId },
        include: { transactions: true, refunds: true },
      }),

    payments: async (_: unknown, { filter }: { filter?: { customerId?: string; status?: string; fromDate?: Date; toDate?: Date; first?: number; after?: string } }) => {
      const where: Prisma.PaymentWhereInput = {};

      if (filter?.customerId) where.customerId = filter.customerId;
      if (filter?.status) where.status = filter.status as Prisma.EnumPaymentStatusFilter;

      if (filter?.fromDate || filter?.toDate) {
        where.createdAt = {};
        if (filter.fromDate) where.createdAt.gte = filter.fromDate;
        if (filter.toDate) where.createdAt.lte = filter.toDate;
      }

      const take = filter?.first ?? 20;
      const cursor = filter?.after ? { id: filter.after } : undefined;

      const [payments, totalCount] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: { transactions: true, refunds: true },
          take: take + 1,
          cursor,
          skip: cursor ? 1 : 0,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.payment.count({ where }),
      ]);

      const hasNextPage = payments.length > take;
      const nodes = hasNextPage ? payments.slice(0, -1) : payments;

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

    paymentMethods: () =>
      prisma.paymentMethod.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      }),

    paymentMethod: (_: unknown, { code }: { code: string }) =>
      prisma.paymentMethod.findUnique({ where: { code } }),

    refund: (_: unknown, { id }: { id: string }) =>
      prisma.refund.findUnique({ where: { id } }),

    refunds: (_: unknown, { paymentId }: { paymentId: string }) =>
      prisma.refund.findMany({
        where: { paymentId },
        orderBy: { createdAt: 'desc' },
      }),
  },

  Mutation: {
    createPayment: async (_: unknown, { input }: { input: { bookingId: string; amount: number; currency?: string; paymentMethod: string } }, context: ServiceContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      const payment = await prisma.payment.create({
        data: {
          bookingId: input.bookingId,
          customerId: context.user.id,
          amount: input.amount,
          currency: input.currency ?? 'IDR',
          paymentMethod: input.paymentMethod,
          expiresAt,
        },
        include: { transactions: true, refunds: true },
      });

      return payment;
    },

    processPayment: async (_: unknown, { paymentId, input }: { paymentId: string; input: { cardToken?: string; bankCode?: string; ewalletType?: string; phoneNumber?: string } }) => {
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'PENDING') {
        throw new Error(`Cannot process payment with status ${payment.status}`);
      }

      // TODO: Integrate with actual payment gateway (Midtrans)
      // For now, simulate successful payment
      const gatewayRef = `TXN-${Date.now()}`;

      const [updatedPayment] = await prisma.$transaction([
        prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: 'PAID',
            gatewayRef,
            paidAt: new Date(),
            gatewayResponse: { ...input, processed: true },
          },
          include: { transactions: true, refunds: true },
        }),
        prisma.transaction.create({
          data: {
            paymentId,
            type: 'CHARGE',
            amount: payment.amount,
            status: 'SUCCESS',
            gatewayRef,
            processedAt: new Date(),
          },
        }),
      ]);

      return {
        payment: updatedPayment,
        redirectUrl: null,
        qrCode: null,
        vaNumber: null,
        expiresAt: payment.expiresAt,
      };
    },

    cancelPayment: async (_: unknown, { paymentId, reason }: { paymentId: string; reason?: string }) => {
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'PENDING') {
        throw new Error(`Cannot cancel payment with status ${payment.status}`);
      }

      return prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          gatewayResponse: { cancelled: true, reason },
        },
        include: { transactions: true, refunds: true },
      });
    },

    requestRefund: async (_: unknown, { paymentId, input }: { paymentId: string; input: { amount: number; reason: string } }, context: ServiceContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'PAID') {
        throw new Error('Can only refund paid payments');
      }

      return prisma.refund.create({
        data: {
          paymentId,
          amount: input.amount,
          reason: input.reason,
          requestedBy: context.user.id,
        },
      });
    },

    approveRefund: async (_: unknown, { refundId }: { refundId: string }, context: ServiceContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return prisma.refund.update({
        where: { id: refundId },
        data: {
          status: 'APPROVED',
          approvedBy: context.user.id,
        },
      });
    },

    rejectRefund: async (_: unknown, { refundId, reason }: { refundId: string; reason: string }) =>
      prisma.refund.update({
        where: { id: refundId },
        data: {
          status: 'REJECTED',
          gatewayResponse: { rejectionReason: reason },
        },
      }),

    processRefund: async (_: unknown, { refundId }: { refundId: string }) => {
      const refund = await prisma.refund.findUnique({
        where: { id: refundId },
        include: { payment: true },
      });

      if (!refund) {
        throw new Error('Refund not found');
      }

      if (refund.status !== 'APPROVED') {
        throw new Error('Refund must be approved first');
      }

      // TODO: Integrate with payment gateway for actual refund
      const gatewayRef = `REF-${Date.now()}`;

      const [updatedRefund] = await prisma.$transaction([
        prisma.refund.update({
          where: { id: refundId },
          data: {
            status: 'COMPLETED',
            gatewayRef,
            processedAt: new Date(),
          },
        }),
        prisma.transaction.create({
          data: {
            paymentId: refund.paymentId,
            type: 'REFUND',
            amount: refund.amount,
            status: 'SUCCESS',
            gatewayRef,
            processedAt: new Date(),
          },
        }),
        prisma.payment.update({
          where: { id: refund.paymentId },
          data: {
            status: refund.amount >= refund.payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
        }),
      ]);

      return updatedRefund;
    },

    createPaymentMethod: (_: unknown, { input }: { input: { code: string; name: string; type: string; provider: string; config?: Prisma.InputJsonValue; displayOrder?: number } }) =>
      prisma.paymentMethod.create({
        data: {
          ...input,
          displayOrder: input.displayOrder ?? 0,
        },
      }),

    updatePaymentMethod: (_: unknown, { code, input }: { code: string; input: { name?: string; isActive?: boolean; config?: Prisma.InputJsonValue; displayOrder?: number } }) =>
      prisma.paymentMethod.update({
        where: { code },
        data: input,
      }),

    // eslint-disable-next-line @typescript-eslint/require-await
    handleWebhook: async (_: unknown, { provider, payload }: { provider: string; payload: unknown }) => {
      // TODO: Implement webhook handling for different providers
      console.log(`Received webhook from ${provider}:`, payload);

      return {
        success: true,
        paymentId: null,
        message: 'Webhook received',
      };
    },
  },

  Payment: {
    __resolveReference: (ref: { id: string }) =>
      prisma.payment.findUnique({
        where: { id: ref.id },
        include: { transactions: true, refunds: true },
      }),
    transactions: (parent: { id: string }) =>
      prisma.transaction.findMany({ where: { paymentId: parent.id } }),
    refunds: (parent: { id: string }) =>
      prisma.refund.findMany({ where: { paymentId: parent.id } }),
  },

  Transaction: {
    __resolveReference: (ref: { id: string }) =>
      prisma.transaction.findUnique({ where: { id: ref.id } }),
  },

  Refund: {
    __resolveReference: (ref: { id: string }) =>
      prisma.refund.findUnique({ where: { id: ref.id } }),
  },
};
