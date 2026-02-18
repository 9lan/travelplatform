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

function generateCode(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export const resolvers = {
  DateTime: DateTimeScalar,
  Decimal: DecimalScalar,
  JSON: JSONScalar,

  Query: {
    company: async (_: unknown, { id }: { id: string }) => {
      return prisma.company.findUnique({
        where: { id },
        include: { contacts: true, rfqs: { include: { quotations: true } } },
      });
    },

    companyByCode: async (_: unknown, { code }: { code: string }) => {
      return prisma.company.findUnique({
        where: { code },
        include: { contacts: true, rfqs: true },
      });
    },

    companies: async (_: unknown, { size, isActive }: { size?: string; isActive?: boolean }) => {
      return prisma.company.findMany({
        where: {
          ...(size && { size: size as any }),
          ...(isActive !== undefined && { isActive }),
        },
        include: { contacts: true },
        orderBy: { name: 'asc' },
      });
    },

    rfq: async (_: unknown, { id }: { id: string }) => {
      return prisma.rFQ.findUnique({
        where: { id },
        include: { company: true, quotations: { include: { approvals: true } } },
      });
    },

    rfqByCode: async (_: unknown, { code }: { code: string }) => {
      return prisma.rFQ.findUnique({
        where: { code },
        include: { company: true, quotations: true },
      });
    },

    rfqs: async (_: unknown, { companyId, status }: { companyId?: string; status?: string }) => {
      return prisma.rFQ.findMany({
        where: {
          ...(companyId && { companyId }),
          ...(status && { status: status as any }),
        },
        include: { company: true, quotations: true },
        orderBy: { submittedAt: 'desc' },
      });
    },

    quotation: async (_: unknown, { id }: { id: string }) => {
      return prisma.quotation.findUnique({
        where: { id },
        include: { rfq: { include: { company: true } }, approvals: true },
      });
    },

    quotations: async (_: unknown, { rfqId, status }: { rfqId: string; status?: string }) => {
      return prisma.quotation.findMany({
        where: {
          rfqId,
          ...(status && { status: status as any }),
        },
        include: { approvals: true },
        orderBy: { version: 'desc' },
      });
    },
  },

  Mutation: {
    createCompany: async (_: unknown, { input }: { input: any }) => {
      return prisma.company.create({
        data: {
          ...input,
          code: generateCode('CORP'),
          size: input.size as any,
        },
        include: { contacts: true, rfqs: true },
      });
    },

    updateCompany: async (_: unknown, { id, input }: { id: string; input: any }) => {
      return prisma.company.update({
        where: { id },
        data: { ...input, size: input.size as any },
        include: { contacts: true, rfqs: true },
      });
    },

    addCompanyContact: async (_: unknown, args: any) => {
      const { companyId, ...contactData } = args;
      return prisma.companyContact.create({
        data: { companyId, ...contactData },
      });
    },

    removeCompanyContact: async (_: unknown, { contactId }: { contactId: string }) => {
      await prisma.companyContact.delete({ where: { id: contactId } });
      return true;
    },

    createRFQ: async (_: unknown, { input }: { input: any }) => {
      return prisma.rFQ.create({
        data: {
          ...input,
          code: generateCode('RFQ'),
        },
        include: { company: true, quotations: true },
      });
    },

    updateRFQStatus: async (_: unknown, { id, status }: { id: string; status: string }) => {
      return prisma.rFQ.update({
        where: { id },
        data: { status: status as any },
        include: { company: true, quotations: true },
      });
    },

    createQuotation: async (_: unknown, { input }: { input: any }) => {
      const latestQuotation = await prisma.quotation.findFirst({
        where: { rfqId: input.rfqId },
        orderBy: { version: 'desc' },
      });

      return prisma.quotation.create({
        data: {
          ...input,
          code: generateCode('QUO'),
          version: (latestQuotation?.version ?? 0) + 1,
        },
        include: { rfq: true, approvals: true },
      });
    },

    sendQuotation: async (_: unknown, { id }: { id: string }) => {
      return prisma.quotation.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date() },
        include: { rfq: true, approvals: true },
      });
    },

    reviseQuotation: async (_: unknown, { id, input }: { id: string; input: any }) => {
      const original = await prisma.quotation.findUnique({ where: { id } });
      if (!original) throw new Error('Quotation not found');

      return prisma.quotation.create({
        data: {
          ...input,
          code: generateCode('QUO'),
          version: original.version + 1,
        },
        include: { rfq: true, approvals: true },
      });
    },

    acceptQuotation: async (_: unknown, { id }: { id: string }) => {
      const [quotation] = await prisma.$transaction([
        prisma.quotation.update({
          where: { id },
          data: { status: 'ACCEPTED', respondedAt: new Date() },
          include: { rfq: true, approvals: true },
        }),
        prisma.rFQ.updateMany({
          where: { quotations: { some: { id } } },
          data: { status: 'ACCEPTED' },
        }),
      ]);
      return quotation;
    },

    rejectQuotation: async (_: unknown, { id }: { id: string }) => {
      return prisma.quotation.update({
        where: { id },
        data: { status: 'REJECTED', respondedAt: new Date() },
        include: { rfq: true, approvals: true },
      });
    },

    requestApproval: async (_: unknown, args: any) => {
      const { quotationId, approverId, approverName, level = 1 } = args;
      return prisma.quotationApproval.create({
        data: { quotationId, approverId, approverName, level },
      });
    },

    approveQuotation: async (_: unknown, { approvalId, comments }: any) => {
      return prisma.quotationApproval.update({
        where: { id: approvalId },
        data: { status: 'APPROVED', comments, decidedAt: new Date() },
      });
    },

    rejectApproval: async (_: unknown, { approvalId, comments }: any) => {
      return prisma.quotationApproval.update({
        where: { id: approvalId },
        data: { status: 'REJECTED', comments, decidedAt: new Date() },
      });
    },
  },

  Company: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.company.findUnique({
        where: { id: reference.id },
        include: { contacts: true, rfqs: true },
      });
    },
  },

  RFQ: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.rFQ.findUnique({
        where: { id: reference.id },
        include: { company: true, quotations: true },
      });
    },
  },

  Quotation: {
    __resolveReference: async (reference: { id: string }) => {
      return prisma.quotation.findUnique({
        where: { id: reference.id },
        include: { rfq: true, approvals: true },
      });
    },
  },
};
