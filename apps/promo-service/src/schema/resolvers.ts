import { type Prisma } from '@prisma/client';
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

export const resolvers = {
  DateTime: DateTimeScalar,

  Query: {
    voucher: (_: unknown, { id }: { id: string }) =>
      prisma.voucher.findUnique({
        where: { id },
        include: { campaign: true, usages: true },
      }),

    voucherByCode: (_: unknown, { code }: { code: string }) =>
      prisma.voucher.findUnique({
        where: { code },
        include: { campaign: true, usages: true },
      }),

    vouchers: (_: unknown, { filter }: { filter?: { campaignId?: string; type?: string; isActive?: boolean; validNow?: boolean } }) => {
      const where: Prisma.VoucherWhereInput = {};
      const now = new Date();

      if (filter?.campaignId) where.campaignId = filter.campaignId;
      if (filter?.type) where.type = filter.type as Prisma.EnumVoucherTypeFilter;
      if (filter?.isActive !== undefined) where.isActive = filter.isActive;
      if (filter?.validNow) {
        where.validFrom = { lte: now };
        where.validTo = { gte: now };
      }

      return prisma.voucher.findMany({
        where,
        include: { campaign: true },
        orderBy: { createdAt: 'desc' },
      });
    },

    validateVoucher: async (_: unknown, { code, input }: { code: string; input: { customerId: string; routeId: string; amount: number } }) => {
      const voucher = await prisma.voucher.findUnique({
        where: { code },
        include: { usages: true },
      });

      const errors: string[] = [];

      if (!voucher) {
        return { isValid: false, message: 'Voucher not found', errors: ['VOUCHER_NOT_FOUND'] };
      }

      if (!voucher.isActive) {
        errors.push('VOUCHER_INACTIVE');
      }

      const now = new Date();
      if (voucher.validFrom > now || voucher.validTo < now) {
        errors.push('VOUCHER_EXPIRED');
      }

      if (voucher.usageLimit && voucher.usageCount >= voucher.usageLimit) {
        errors.push('USAGE_LIMIT_REACHED');
      }

      const userUsageCount = voucher.usages.filter(u => u.customerId === input.customerId).length;
      if (userUsageCount >= voucher.perUserLimit) {
        errors.push('USER_LIMIT_REACHED');
      }

      if (voucher.routeIds.length > 0 && !voucher.routeIds.includes(input.routeId)) {
        errors.push('ROUTE_NOT_ELIGIBLE');
      }

      if (voucher.minPurchase && input.amount < voucher.minPurchase) {
        errors.push('MIN_PURCHASE_NOT_MET');
      }

      if (errors.length > 0) {
        return { isValid: false, voucher, errors, message: errors.join(', ') };
      }

      let discount = 0;
      if (voucher.type === 'PERCENTAGE') {
        discount = input.amount * (voucher.value / 100);
        if (voucher.maxDiscount && discount > voucher.maxDiscount) {
          discount = voucher.maxDiscount;
        }
      } else if (voucher.type === 'FIXED') {
        discount = voucher.value;
      }

      return { isValid: true, voucher, discount, message: 'Voucher is valid' };
    },

    campaign: (_: unknown, { id }: { id: string }) =>
      prisma.campaign.findUnique({
        where: { id },
        include: { vouchers: true },
      }),

    campaigns: (_: unknown, { filter }: { filter?: { type?: string; isActive?: boolean; activeNow?: boolean } }) => {
      const where: Prisma.CampaignWhereInput = {};
      const now = new Date();

      if (filter?.type) where.type = filter.type as Prisma.EnumCampaignTypeFilter;
      if (filter?.isActive !== undefined) where.isActive = filter.isActive;
      if (filter?.activeNow) {
        where.startDate = { lte: now };
        where.endDate = { gte: now };
      }

      return prisma.campaign.findMany({
        where,
        include: { vouchers: true },
        orderBy: { createdAt: 'desc' },
      });
    },

    customerCashback: (_: unknown, { customerId }: { customerId: string }) =>
      prisma.cashbackBalance.findUnique({
        where: { customerId },
        include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } },
      }),

    cashbackTransactions: (_: unknown, { customerId, filter }: { customerId: string; filter?: { type?: string; status?: string; fromDate?: Date; toDate?: Date } }) => {
      const where: Prisma.CashbackTransactionWhereInput = {
        cashbackBalance: { customerId },
      };

      if (filter?.type) where.type = filter.type as Prisma.EnumCashbackTypeFilter;
      if (filter?.status) where.status = filter.status as Prisma.EnumCashbackStatusFilter;

      if (filter?.fromDate || filter?.toDate) {
        where.createdAt = {};
        if (filter.fromDate) where.createdAt.gte = filter.fromDate;
        if (filter.toDate) where.createdAt.lte = filter.toDate;
      }

      return prisma.cashbackTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    },
  },

  Mutation: {
    createVoucher: (_: unknown, { input }: { input: { code: string; campaignId?: string; type: string; value: number; maxDiscount?: number; minPurchase?: number; usageLimit?: number; perUserLimit?: number; routeIds?: string[]; validFrom: Date; validTo: Date } }) =>
      prisma.voucher.create({
        data: {
          ...input,
          type: input.type as 'PERCENTAGE' | 'FIXED' | 'FREE_UPGRADE',
          routeIds: input.routeIds ?? [],
          perUserLimit: input.perUserLimit ?? 1,
        },
        include: { campaign: true },
      }),

    updateVoucher: (_: unknown, { id, input }: { id: string; input: { value?: number; maxDiscount?: number; minPurchase?: number; usageLimit?: number; perUserLimit?: number; routeIds?: string[]; isActive?: boolean; validFrom?: Date; validTo?: Date } }) =>
      prisma.voucher.update({
        where: { id },
        data: input,
        include: { campaign: true },
      }),

    deactivateVoucher: (_: unknown, { id }: { id: string }) =>
      prisma.voucher.update({
        where: { id },
        data: { isActive: false },
        include: { campaign: true },
      }),

    applyVoucher: async (_: unknown, { code, bookingId }: { code: string; bookingId: string }, context: ServiceContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const voucher = await prisma.voucher.findUnique({ where: { code } });
      if (!voucher || !voucher.isActive) {
        throw new Error('Invalid voucher');
      }

      // TODO: Get booking details and validate
      const discount = voucher.type === 'FIXED' ? voucher.value : 0;

      await prisma.$transaction([
        prisma.voucherUsage.create({
          data: {
            voucherId: voucher.id,
            customerId: context.user.id,
            bookingId,
            discount,
          },
        }),
        prisma.voucher.update({
          where: { id: voucher.id },
          data: { usageCount: { increment: 1 } },
        }),
      ]);

      return {
        success: true,
        voucher,
        discount,
        message: 'Voucher applied successfully',
      };
    },

    createCampaign: (_: unknown, { input }: { input: { name: string; description?: string; type: string; budget?: number; startDate: Date; endDate: Date } }) =>
      prisma.campaign.create({
        data: {
          ...input,
          type: input.type as 'SEASONAL' | 'REFERRAL' | 'LOYALTY' | 'PARTNERSHIP' | 'PROMOTIONAL',
        },
        include: { vouchers: true },
      }),

    updateCampaign: (_: unknown, { id, input }: { id: string; input: { name?: string; description?: string; budget?: number; isActive?: boolean; startDate?: Date; endDate?: Date } }) =>
      prisma.campaign.update({
        where: { id },
        data: input,
        include: { vouchers: true },
      }),

    awardCashback: async (_: unknown, { input }: { input: { customerId: string; amount: number; bookingId?: string; description?: string; releaseAfterDays?: number } }) => {
      const releaseAt = input.releaseAfterDays
        ? new Date(Date.now() + input.releaseAfterDays * 24 * 60 * 60 * 1000)
        : null;

      // Ensure cashback balance exists
      let balance = await prisma.cashbackBalance.findUnique({
        where: { customerId: input.customerId },
      });

      if (!balance) {
        balance = await prisma.cashbackBalance.create({
          data: { customerId: input.customerId },
        });
      }

      const transaction = await prisma.cashbackTransaction.create({
        data: {
          cashbackBalanceId: balance.id,
          type: 'EARNED',
          amount: input.amount,
          bookingId: input.bookingId,
          description: input.description,
          status: releaseAt ? 'PENDING' : 'RELEASED',
          releaseAt,
          processedAt: releaseAt ? null : new Date(),
        },
      });

      // Update balance
      await prisma.cashbackBalance.update({
        where: { id: balance.id },
        data: {
          totalEarned: { increment: input.amount },
          ...(releaseAt
            ? { pendingBalance: { increment: input.amount } }
            : { balance: { increment: input.amount } }
          ),
        },
      });

      return transaction;
    },

    redeemCashback: async (_: unknown, { customerId, amount, bookingId }: { customerId: string; amount: number; bookingId: string }) => {
      const balance = await prisma.cashbackBalance.findUnique({
        where: { customerId },
      });

      if (!balance || balance.balance < amount) {
        throw new Error('Insufficient cashback balance');
      }

      const transaction = await prisma.cashbackTransaction.create({
        data: {
          cashbackBalanceId: balance.id,
          type: 'REDEEMED',
          amount: -amount,
          bookingId,
          status: 'REDEEMED',
          processedAt: new Date(),
        },
      });

      const updatedBalance = await prisma.cashbackBalance.update({
        where: { id: balance.id },
        data: {
          balance: { decrement: amount },
          totalRedeemed: { increment: amount },
        },
      });

      return {
        success: true,
        transaction,
        newBalance: updatedBalance.balance,
        message: 'Cashback redeemed successfully',
      };
    },

    releasePendingCashback: async (_: unknown, { transactionId }: { transactionId: string }) => {
      const transaction = await prisma.cashbackTransaction.findUnique({
        where: { id: transactionId },
        include: { cashbackBalance: true },
      });

      if (!transaction || transaction.status !== 'PENDING') {
        throw new Error('Invalid transaction');
      }

      await prisma.$transaction([
        prisma.cashbackTransaction.update({
          where: { id: transactionId },
          data: { status: 'RELEASED', processedAt: new Date() },
        }),
        prisma.cashbackBalance.update({
          where: { id: transaction.cashbackBalanceId },
          data: {
            balance: { increment: transaction.amount },
            pendingBalance: { decrement: transaction.amount },
          },
        }),
      ]);

      return prisma.cashbackTransaction.findUnique({ where: { id: transactionId } });
    },

    expireCashback: async (_: unknown, { transactionId }: { transactionId: string }) => {
      const transaction = await prisma.cashbackTransaction.findUnique({
        where: { id: transactionId },
        include: { cashbackBalance: true },
      });

      if (!transaction || transaction.status !== 'PENDING') {
        throw new Error('Invalid transaction');
      }

      await prisma.$transaction([
        prisma.cashbackTransaction.update({
          where: { id: transactionId },
          data: { status: 'EXPIRED', processedAt: new Date() },
        }),
        prisma.cashbackBalance.update({
          where: { id: transaction.cashbackBalanceId },
          data: { pendingBalance: { decrement: transaction.amount } },
        }),
      ]);

      return prisma.cashbackTransaction.findUnique({ where: { id: transactionId } });
    },
  },

  Voucher: {
    __resolveReference: (ref: { id: string }) =>
      prisma.voucher.findUnique({
        where: { id: ref.id },
        include: { campaign: true, usages: true },
      }),
    campaign: (parent: { campaignId?: string | null }) =>
      parent.campaignId ? prisma.campaign.findUnique({ where: { id: parent.campaignId } }) : null,
    usages: (parent: { id: string }) =>
      prisma.voucherUsage.findMany({ where: { voucherId: parent.id } }),
  },

  Campaign: {
    __resolveReference: (ref: { id: string }) =>
      prisma.campaign.findUnique({
        where: { id: ref.id },
        include: { vouchers: true },
      }),
    vouchers: (parent: { id: string }) =>
      prisma.voucher.findMany({ where: { campaignId: parent.id } }),
  },

  CashbackBalance: {
    __resolveReference: (ref: { id: string }) =>
      prisma.cashbackBalance.findUnique({
        where: { id: ref.id },
        include: { transactions: true },
      }),
    transactions: (parent: { id: string }) =>
      prisma.cashbackTransaction.findMany({
        where: { cashbackBalanceId: parent.id },
        orderBy: { createdAt: 'desc' },
      }),
  },

  CashbackTransaction: {
    __resolveReference: (ref: { id: string }) =>
      prisma.cashbackTransaction.findUnique({ where: { id: ref.id } }),
  },
};
