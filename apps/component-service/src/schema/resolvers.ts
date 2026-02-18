import type { Prisma } from '../generated/prisma';
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

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON scalar type',
  serialize(value: unknown): unknown { return value; },
  parseValue(value: unknown): unknown { return value; },
  parseLiteral(ast): unknown {
    if (ast.kind === Kind.STRING) return JSON.parse(ast.value);
    return null;
  },
});

function generateComponentCode(type: string): string {
  const prefix = type.substring(0, 3).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export const resolvers = {
  DateTime: DateTimeScalar,
  Decimal: DecimalScalar,
  JSON: JSONScalar,

  Query: {
    component: async (_: unknown, { id }: { id: string }) => {
      return prisma.component.findUnique({
        where: { id },
        include: { pricing: true },
      });
    },

    componentByCode: async (_: unknown, { code }: { code: string }) => {
      return prisma.component.findUnique({
        where: { code },
        include: { pricing: true },
      });
    },

    components: async (
      _: unknown,
      { type, status, vendorId }: { type?: string; status?: string; vendorId?: string }
    ) => {
      return prisma.component.findMany({
        where: {
          ...(type && { type: type as Prisma.EnumComponentTypeFilter }),
          ...(status && { status: status as Prisma.EnumComponentStatusFilter }),
          ...(vendorId && { vendorId }),
        },
        include: { pricing: true },
        orderBy: { name: 'asc' },
      });
    },

    searchComponents: async (
      _: unknown,
      { query, type, location }: { query?: string; type?: string; location?: string }
    ) => {
      const where: Prisma.ComponentWhereInput = { status: 'ACTIVE' };

      if (query) {
        where.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ];
      }

      if (type) where.type = type as Prisma.EnumComponentTypeFilter;
      if (location) where.location = { contains: location, mode: 'insensitive' };

      return prisma.component.findMany({
        where,
        include: { pricing: true },
        take: 50,
        orderBy: { name: 'asc' },
      });
    },
  },

  Mutation: {
    createComponent: async (_: unknown, { input }: { input: any }) => {
      const code = generateComponentCode(input.type);
      return prisma.component.create({
        data: {
          ...input,
          code,
          type: input.type as Prisma.ComponentCreateInput['type'],
          availabilityType: input.availabilityType as Prisma.ComponentCreateInput['availabilityType'] ?? 'DAILY_QUOTA',
          amenities: input.amenities ?? [],
        },
        include: { pricing: true },
      });
    },

    updateComponent: async (_: unknown, { id, input }: { id: string; input: any }) => {
      const data: Prisma.ComponentUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.shortDescription !== undefined) data.shortDescription = input.shortDescription;
      if (input.location !== undefined) data.location = input.location;
      if (input.latitude !== undefined) data.latitude = input.latitude;
      if (input.longitude !== undefined) data.longitude = input.longitude;
      if (input.duration !== undefined) data.duration = input.duration;
      if (input.basePrice !== undefined) data.basePrice = input.basePrice;
      if (input.maxCapacity !== undefined) data.maxCapacity = input.maxCapacity;
      if (input.minPax !== undefined) data.minPax = input.minPax;
      if (input.maxPax !== undefined) data.maxPax = input.maxPax;
      if (input.availabilityType !== undefined) data.availabilityType = input.availabilityType;
      if (input.amenities !== undefined) data.amenities = input.amenities;
      if (input.status !== undefined) data.status = input.status;

      return prisma.component.update({
        where: { id },
        data,
        include: { pricing: true },
      });
    },

    publishComponent: async (_: unknown, { id }: { id: string }) => {
      return prisma.component.update({
        where: { id },
        data: { status: 'ACTIVE' },
        include: { pricing: true },
      });
    },

    archiveComponent: async (_: unknown, { id }: { id: string }) => {
      return prisma.component.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        include: { pricing: true },
      });
    },

    addComponentPricing: async (_: unknown, { componentId, input }: { componentId: string; input: any }) => {
      return prisma.componentPricing.create({
        data: {
          componentId,
          ...input,
          daysOfWeek: input.daysOfWeek ?? [],
        },
      });
    },

    updateComponentPricing: async (_: unknown, { pricingId, input }: { pricingId: string; input: any }) => {
      return prisma.componentPricing.update({
        where: { id: pricingId },
        data: input,
      });
    },

    removeComponentPricing: async (_: unknown, { pricingId }: { pricingId: string }) => {
      await prisma.componentPricing.delete({ where: { id: pricingId } });
      return true;
    },
  },

  Component: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.component.findUnique({
        where: { id: reference.id },
        include: { pricing: true },
      });
    },

    images: (component: { images?: unknown }) => {
      if (Array.isArray(component.images)) return component.images;
      return [];
    },
  },
};
