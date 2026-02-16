import { type Prisma } from '../generated/prisma';
import { GraphQLScalarType, Kind } from 'graphql';

import { generateScheduleCode, NotFoundError } from '@travelplatform/shared-utils';

import { prisma } from '../prisma.js';
import { getProviderRegistry, type ProviderCode } from '../providers/index.js';

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

const DateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date scalar type (YYYY-MM-DD)',
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0] ?? '';
    }
    if (typeof value === 'string') {
      return value.split('T')[0] ?? '';
    }
    throw new Error('Date must be a Date object or string');
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string') {
      return new Date(value);
    }
    throw new Error('Date must be a string');
  },
  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    throw new Error('Date must be a string');
  },
});

// Helper to format date as YYYY-MM-DD
function formatDateString(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

export const resolvers = {
  DateTime: DateTimeScalar,
  Date: DateScalar,

  Query: {
    // ─────────────────────────────────────────────
    // Internal Data Queries
    // ─────────────────────────────────────────────

    cities: () => prisma.city.findMany({ orderBy: { name: 'asc' } }),

    city: (_: unknown, { id }: { id: string }) => prisma.city.findUnique({ where: { id } }),

    counters: (_: unknown, { cityId }: { cityId?: string }) =>
      prisma.counter.findMany({
        where: { ...(cityId && { cityId }), isActive: true },
        orderBy: { name: 'asc' },
      }),

    counter: (_: unknown, { id }: { id: string }) => prisma.counter.findUnique({ where: { id } }),

    routes: (_: unknown, { filter }: { filter?: { originCityId?: string; destinationCityId?: string; isActive?: boolean } }) => {
      const where: Prisma.RouteWhereInput = {};
      if (filter?.originCityId) {
        where.origin = { cityId: filter.originCityId };
      }
      if (filter?.destinationCityId) {
        where.destination = { cityId: filter.destinationCityId };
      }
      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }
      return prisma.route.findMany({ where, orderBy: { code: 'asc' } });
    },

    route: (_: unknown, { id }: { id: string }) => prisma.route.findUnique({ where: { id } }),

    vehicles: () => prisma.vehicle.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),

    vehicle: (_: unknown, { id }: { id: string }) => prisma.vehicle.findUnique({ where: { id } }),

    schedules: (_: unknown, { filter }: { filter: { routeId?: string; originId?: string; destinationId?: string; departureDate?: Date; status?: string } }) => {
      const where: Prisma.ScheduleWhereInput = {};

      if (filter.routeId) {
        where.routeId = filter.routeId;
      }

      if (filter.originId) {
        where.route = { ...where.route as Prisma.RouteWhereInput, originId: filter.originId };
      }

      if (filter.destinationId) {
        where.route = { ...where.route as Prisma.RouteWhereInput, destinationId: filter.destinationId };
      }

      if (filter.departureDate) {
        const startOfDay = new Date(filter.departureDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filter.departureDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.departureTime = { gte: startOfDay, lte: endOfDay };
      }

      if (filter.status) {
        where.status = filter.status as Prisma.EnumScheduleStatusFilter;
      }

      return prisma.schedule.findMany({
        where,
        orderBy: { departureTime: 'asc' },
      });
    },

    schedule: (_: unknown, { id }: { id: string }) => prisma.schedule.findUnique({ where: { id } }),

    // ─────────────────────────────────────────────
    // Provider-based Queries (External APIs)
    // ─────────────────────────────────────────────

    enabledProviders: async () => {
      const registry = getProviderRegistry();
      const providerCodes = registry.getEnabledProviderCodes();
      const healthResults = await registry.healthCheckAll();

      return providerCodes.map((code) => {
        const provider = registry.getProvider(code);
        return {
          code,
          name: provider?.name ?? code,
          isHealthy: healthResults.get(code) ?? false,
        };
      });
    },

    providerCities: async (_: unknown, { providerCode }: { providerCode?: ProviderCode }) => {
      const registry = getProviderRegistry();

      if (providerCode) {
        const provider = registry.getProvider(providerCode);
        if (!provider) {
          throw new NotFoundError('Provider', providerCode);
        }
        return provider.getCities();
      }

      // Get from all providers
      return registry.getAllCities();
    },

    providerOriginOutlets: async (_: unknown, { providerCode, cityId }: { providerCode: ProviderCode; cityId?: string }) => {
      const registry = getProviderRegistry();
      return registry.getOriginOutlets(providerCode, cityId);
    },

    providerDestinationOutlets: async (_: unknown, { providerCode, originOutletId }: { providerCode: ProviderCode; originOutletId: string }) => {
      const registry = getProviderRegistry();
      return registry.getDestinationOutlets(providerCode, originOutletId);
    },

    providerSchedules: async (
      _: unknown,
      { input }: { input: { providerCode?: ProviderCode; originOutletId: string; destinationOutletId: string; departureDate: Date; passengers?: number } }
    ) => {
      const registry = getProviderRegistry();
      const params = {
        originOutletId: input.originOutletId,
        destinationOutletId: input.destinationOutletId,
        departureDate: formatDateString(input.departureDate),
        passengers: input.passengers ?? 1,
      };

      if (input.providerCode) {
        const provider = registry.getProvider(input.providerCode);
        if (!provider) {
          throw new NotFoundError('Provider', input.providerCode);
        }
        console.log("🚀 ~ params:", params);
        return provider.searchSchedules(params);
      }

      // Search from all providers
      return registry.searchSchedulesFromAll(params);
    },

    providerSeatLayout: async (
      _: unknown,
      { input }: { input: { providerCode: ProviderCode; scheduleId: string; departureDate: Date; originOutletId: string; destinationOutletId: string } }
    ) => {
      const registry = getProviderRegistry();
      return registry.getSeatLayout(
        input.providerCode,
        input.scheduleId,
        formatDateString(input.departureDate),
        input.originOutletId,
        input.destinationOutletId
      );
    },
  },

  Mutation: {
    createCity: (_: unknown, { input }: { input: { name: string; province: string } }) =>
      prisma.city.create({ data: input }),

    createCounter: (_: unknown, { input }: { input: { code: string; name: string; cityId: string; address: string; latitude: number; longitude: number } }) =>
      prisma.counter.create({ data: input }),

    createRoute: (_: unknown, { input }: { input: { code: string; originId: string; destinationId: string; distance?: number; estimatedDuration: number } }) =>
      prisma.route.create({ data: input }),

    createVehicle: (_: unknown, { input }: { input: { code: string; name: string; type: string; capacity: number; amenities?: string[] } }) =>
      prisma.vehicle.create({
        data: {
          ...input,
          type: input.type as 'HIACE' | 'MINIBUS' | 'BUS',
          amenities: input.amenities ?? [],
        },
      }),

    createSchedule: async (_: unknown, { input }: { input: { routeId: string; vehicleId: string; departureTime: Date; arrivalTime: Date } }) => {
      const count = await prisma.schedule.count({
        where: {
          departureTime: {
            gte: new Date(new Date(input.departureTime).setHours(0, 0, 0, 0)),
            lt: new Date(new Date(input.departureTime).setHours(24, 0, 0, 0)),
          },
        },
      });

      const code = generateScheduleCode(new Date(input.departureTime), count + 1);

      return prisma.schedule.create({
        data: {
          ...input,
          code,
        },
      });
    },

    updateScheduleStatus: async (_: unknown, { id, status }: { id: string; status: string }) => {
      const schedule = await prisma.schedule.findUnique({ where: { id } });
      if (!schedule) {
        throw new NotFoundError('Schedule', id);
      }

      return prisma.schedule.update({
        where: { id },
        data: { status: status as 'SCHEDULED' | 'BOARDING' | 'DEPARTED' | 'ARRIVED' | 'CANCELLED' },
      });
    },

    assignDriver: async (_: unknown, { scheduleId, driverName, vehiclePlate }: { scheduleId: string; driverName: string; vehiclePlate: string }) => {
      const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
      if (!schedule) {
        throw new NotFoundError('Schedule', scheduleId);
      }

      return prisma.schedule.update({
        where: { id: scheduleId },
        data: { driverName, vehiclePlate },
      });
    },
  },

  // ─────────────────────────────────────────────
  // Type Resolvers with Federation References
  // ─────────────────────────────────────────────

  City: {
    __resolveReference: (ref: { id: string }) => prisma.city.findUnique({ where: { id: ref.id } }),
    counters: (parent: { id: string }) =>
      prisma.counter.findMany({ where: { cityId: parent.id, isActive: true } }),
  },

  Counter: {
    __resolveReference: (ref: { id: string }) => prisma.counter.findUnique({ where: { id: ref.id } }),
    city: (parent: { cityId: string }) => prisma.city.findUnique({ where: { id: parent.cityId } }),
  },

  Route: {
    __resolveReference: (ref: { id: string }) => prisma.route.findUnique({ where: { id: ref.id } }),
    origin: (parent: { originId: string }) => prisma.counter.findUnique({ where: { id: parent.originId } }),
    destination: (parent: { destinationId: string }) => prisma.counter.findUnique({ where: { id: parent.destinationId } }),
    schedules: (parent: { id: string }, { filter }: { filter?: { departureDate?: Date; status?: string } }) => {
      const where: Prisma.ScheduleWhereInput = { routeId: parent.id };
      if (filter?.departureDate) {
        const startOfDay = new Date(filter.departureDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filter.departureDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.departureTime = { gte: startOfDay, lte: endOfDay };
      }
      if (filter?.status) {
        where.status = filter.status as Prisma.EnumScheduleStatusFilter;
      }
      return prisma.schedule.findMany({ where, orderBy: { departureTime: 'asc' } });
    },
  },

  Vehicle: {
    __resolveReference: (ref: { id: string }) => prisma.vehicle.findUnique({ where: { id: ref.id } }),
  },

  Schedule: {
    __resolveReference: (ref: { id: string }) => prisma.schedule.findUnique({ where: { id: ref.id } }),
    route: (parent: { routeId: string }) => prisma.route.findUnique({ where: { id: parent.routeId } }),
    vehicle: (parent: { vehicleId: string }) => prisma.vehicle.findUnique({ where: { id: parent.vehicleId } }),
  },
};
