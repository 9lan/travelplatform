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
    notification: (_: unknown, { id }: { id: string }) =>
      prisma.notification.findUnique({
        where: { id },
        include: { template: true },
      }),

    notifications: async (_: unknown, { filter }: { filter: { customerId: string; channel?: string; type?: string; status?: string; unreadOnly?: boolean; first?: number; after?: string } }) => {
      const where: Prisma.NotificationWhereInput = {
        customerId: filter.customerId,
      };

      if (filter.channel) where.channel = filter.channel as Prisma.EnumNotificationChannelFilter;
      if (filter.type) where.type = filter.type as Prisma.EnumNotificationTypeFilter;
      if (filter.status) where.status = filter.status as Prisma.EnumNotificationStatusFilter;
      if (filter.unreadOnly) where.readAt = null;

      const take = filter.first ?? 20;
      const cursor = filter.after ? { id: filter.after } : undefined;

      const [notifications, totalCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          include: { template: true },
          take: take + 1,
          cursor,
          skip: cursor ? 1 : 0,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.count({ where }),
      ]);

      const hasNextPage = notifications.length > take;
      const nodes = hasNextPage ? notifications.slice(0, -1) : notifications;

      return {
        nodes,
        totalCount,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!filter.after,
          startCursor: nodes[0]?.id ?? null,
          endCursor: nodes[nodes.length - 1]?.id ?? null,
        },
      };
    },

    unreadCount: (_: unknown, { customerId }: { customerId: string }) =>
      prisma.notification.count({
        where: { customerId, readAt: null },
      }),

    notificationTemplate: (_: unknown, { id }: { id: string }) =>
      prisma.notificationTemplate.findUnique({ where: { id } }),

    notificationTemplateByCode: (_: unknown, { code }: { code: string }) =>
      prisma.notificationTemplate.findUnique({ where: { code } }),

    notificationTemplates: (_: unknown, { filter }: { filter?: { channel?: string; type?: string; isActive?: boolean } }) => {
      const where: Prisma.NotificationTemplateWhereInput = {};

      if (filter?.channel) where.channel = filter.channel as Prisma.EnumNotificationChannelFilter;
      if (filter?.type) where.type = filter.type as Prisma.EnumNotificationTypeFilter;
      if (filter?.isActive !== undefined) where.isActive = filter.isActive;

      return prisma.notificationTemplate.findMany({
        where,
        orderBy: { name: 'asc' },
      });
    },

    deviceTokens: (_: unknown, { customerId }: { customerId: string }) =>
      prisma.deviceToken.findMany({
        where: { customerId, isActive: true },
        orderBy: { lastUsedAt: 'desc' },
      }),

    bulkNotificationJob: (_: unknown, { id }: { id: string }) =>
      prisma.bulkNotificationJob.findUnique({ where: { id } }),

    bulkNotificationJobs: (_: unknown, { filter }: { filter?: { status?: string; fromDate?: Date; toDate?: Date } }) => {
      const where: Prisma.BulkNotificationJobWhereInput = {};

      if (filter?.status) where.status = filter.status as Prisma.EnumBulkJobStatusFilter;

      if (filter?.fromDate || filter?.toDate) {
        where.createdAt = {};
        if (filter.fromDate) where.createdAt.gte = filter.fromDate;
        if (filter.toDate) where.createdAt.lte = filter.toDate;
      }

      return prisma.bulkNotificationJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    },
  },

  Mutation: {
    sendNotification: async (_: unknown, { input }: { input: { customerId: string; templateCode?: string; channel: string; type: string; title?: string; body?: string; data?: unknown } }) => {
      let title = input.title;
      let body = input.body;
      let templateId: string | undefined;

      if (input.templateCode) {
        const template = await prisma.notificationTemplate.findUnique({
          where: { code: input.templateCode },
        });

        if (template) {
          templateId = template.id;
          title = title ?? template.title;
          body = body ?? template.body;
        }
      }

      if (!title || !body) {
        throw new Error('Title and body are required');
      }

      const notification = await prisma.notification.create({
        data: {
          customerId: input.customerId,
          templateId,
          channel: input.channel as 'PUSH' | 'EMAIL' | 'SMS' | 'IN_APP' | 'WHATSAPP',
          type: input.type as 'BOOKING_CONFIRMATION' | 'BOOKING_REMINDER' | 'BOOKING_CANCELLED' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_REMINDER' | 'DEPARTURE_REMINDER' | 'TRIP_COMPLETED' | 'PROMO' | 'SYSTEM',
          title,
          body,
          data: input.data ?? undefined,
          status: 'PENDING',
        },
        include: { template: true },
      });

      // TODO: Queue notification for delivery via BullMQ
      // For now, mark as sent immediately
      return prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() },
        include: { template: true },
      });
    },

    sendBulkNotification: async (_: unknown, { input }: { input: { name: string; templateId: string; channel: string; filters?: unknown; scheduledAt?: Date } }, context: ServiceContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return prisma.bulkNotificationJob.create({
        data: {
          name: input.name,
          templateId: input.templateId,
          channel: input.channel as 'PUSH' | 'EMAIL' | 'SMS' | 'IN_APP' | 'WHATSAPP',
          filters: input.filters ?? undefined,
          status: input.scheduledAt ? 'SCHEDULED' : 'PENDING',
          scheduledAt: input.scheduledAt,
          createdBy: context.user.id,
        },
      });
    },

    markAsRead: async (_: unknown, { notificationIds }: { notificationIds: string[] }) => {
      await prisma.notification.updateMany({
        where: { id: { in: notificationIds } },
        data: { readAt: new Date(), status: 'READ' },
      });

      return prisma.notification.findMany({
        where: { id: { in: notificationIds } },
        include: { template: true },
      });
    },

    markAllAsRead: async (_: unknown, { customerId }: { customerId: string }) => {
      const result = await prisma.notification.updateMany({
        where: { customerId, readAt: null },
        data: { readAt: new Date(), status: 'READ' },
      });

      return result.count;
    },

    deleteNotification: async (_: unknown, { id }: { id: string }) => {
      await prisma.notification.delete({ where: { id } });
      return true;
    },

    registerDevice: async (_: unknown, { input }: { input: { customerId: string; token: string; platform: string; deviceInfo?: unknown } }) => {
      // Upsert to handle token updates
      return prisma.deviceToken.upsert({
        where: { token: input.token },
        create: {
          customerId: input.customerId,
          token: input.token,
          platform: input.platform as 'IOS' | 'ANDROID' | 'WEB',
          deviceInfo: input.deviceInfo ?? undefined,
          lastUsedAt: new Date(),
        },
        update: {
          customerId: input.customerId,
          platform: input.platform as 'IOS' | 'ANDROID' | 'WEB',
          deviceInfo: input.deviceInfo ?? undefined,
          isActive: true,
          lastUsedAt: new Date(),
        },
      });
    },

    unregisterDevice: async (_: unknown, { token }: { token: string }) => {
      await prisma.deviceToken.update({
        where: { token },
        data: { isActive: false },
      });
      return true;
    },

    createNotificationTemplate: (_: unknown, { input }: { input: { code: string; name: string; channel: string; type: string; subject?: string; title: string; body: string } }) =>
      prisma.notificationTemplate.create({
        data: {
          ...input,
          channel: input.channel as 'PUSH' | 'EMAIL' | 'SMS' | 'IN_APP' | 'WHATSAPP',
          type: input.type as 'BOOKING_CONFIRMATION' | 'BOOKING_REMINDER' | 'BOOKING_CANCELLED' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_REMINDER' | 'DEPARTURE_REMINDER' | 'TRIP_COMPLETED' | 'PROMO' | 'SYSTEM',
        },
      }),

    updateNotificationTemplate: (_: unknown, { id, input }: { id: string; input: { name?: string; subject?: string; title?: string; body?: string; isActive?: boolean } }) =>
      prisma.notificationTemplate.update({
        where: { id },
        data: input,
      }),

    deleteNotificationTemplate: async (_: unknown, { id }: { id: string }) => {
      await prisma.notificationTemplate.delete({ where: { id } });
      return true;
    },

    cancelBulkJob: (_: unknown, { id }: { id: string }) =>
      prisma.bulkNotificationJob.update({
        where: { id },
        data: { status: 'CANCELLED' },
      }),
  },

  Notification: {
    __resolveReference: (ref: { id: string }) =>
      prisma.notification.findUnique({
        where: { id: ref.id },
        include: { template: true },
      }),
    template: (parent: { templateId?: string | null }) =>
      parent.templateId ? prisma.notificationTemplate.findUnique({ where: { id: parent.templateId } }) : null,
  },

  NotificationTemplate: {
    __resolveReference: (ref: { id: string }) =>
      prisma.notificationTemplate.findUnique({ where: { id: ref.id } }),
  },

  DeviceToken: {
    __resolveReference: (ref: { id: string }) =>
      prisma.deviceToken.findUnique({ where: { id: ref.id } }),
  },

  BulkNotificationJob: {
    __resolveReference: (ref: { id: string }) =>
      prisma.bulkNotificationJob.findUnique({ where: { id: ref.id } }),
  },
};
