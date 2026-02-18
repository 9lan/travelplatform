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

function generateVendorCode(): string {
  return `VND-${Date.now().toString(36).toUpperCase()}`;
}

export const resolvers = {
  DateTime: DateTimeScalar,
  Decimal: DecimalScalar,
  JSON: JSONScalar,

  Query: {
    vendor: async (_: unknown, { id }: { id: string }) => {
      return prisma.vendor.findUnique({
        where: { id },
        include: { users: true, products: true },
      });
    },

    vendorByCode: async (_: unknown, { code }: { code: string }) => {
      return prisma.vendor.findUnique({
        where: { code },
        include: { users: true, products: true },
      });
    },

    vendors: async (_: unknown, { type, status }: { type?: string; status?: string }) => {
      return prisma.vendor.findMany({
        where: {
          ...(type && { type: type as any }),
          ...(status && { status: status as any }),
        },
        include: { users: true, products: true },
        orderBy: { name: 'asc' },
      });
    },

    myVendor: async () => {
      // TODO: Get vendor by current user context
      return null;
    },
  },

  Mutation: {
    createVendor: async (_: unknown, { input }: { input: any }) => {
      return prisma.vendor.create({
        data: {
          ...input,
          code: generateVendorCode(),
          type: input.type as any,
        },
        include: { users: true, products: true },
      });
    },

    updateVendor: async (_: unknown, { id, input }: { id: string; input: any }) => {
      return prisma.vendor.update({
        where: { id },
        data: input,
        include: { users: true, products: true },
      });
    },

    verifyVendor: async (_: unknown, { id }: { id: string }) => {
      return prisma.vendor.update({
        where: { id },
        data: { status: 'ACTIVE', verifiedAt: new Date() },
        include: { users: true, products: true },
      });
    },

    suspendVendor: async (_: unknown, { id }: { id: string }) => {
      return prisma.vendor.update({
        where: { id },
        data: { status: 'SUSPENDED' },
        include: { users: true, products: true },
      });
    },

    addVendorUser: async (
      _: unknown,
      { vendorId, userId, email, name, role }: any
    ) => {
      return prisma.vendorUser.create({
        data: { vendorId, userId, email, name, role: role as any },
      });
    },

    removeVendorUser: async (_: unknown, { vendorId, userId }: any) => {
      await prisma.vendorUser.delete({
        where: { vendorId_userId: { vendorId, userId } },
      });
      return true;
    },

    linkProduct: async (_: unknown, { vendorId, productType, productId }: any) => {
      return prisma.vendorProduct.create({
        data: { vendorId, productType, productId },
      });
    },

    unlinkProduct: async (_: unknown, { vendorId, productType, productId }: any) => {
      await prisma.vendorProduct.delete({
        where: { vendorId_productType_productId: { vendorId, productType, productId } },
      });
      return true;
    },
  },

  Vendor: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.vendor.findUnique({
        where: { id: reference.id },
        include: { users: true, products: true },
      });
    },
  },
};
