import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  scalar DateTime
  scalar Decimal
  scalar JSON

  enum CompanySize {
    SME
    ENTERPRISE
    GOVERNMENT
  }

  enum RFQStatus {
    SUBMITTED
    IN_PROGRESS
    QUOTED
    ACCEPTED
    REJECTED
    EXPIRED
  }

  enum QuotationStatus {
    DRAFT
    SENT
    REVISED
    ACCEPTED
    REJECTED
  }

  enum ApprovalStatus {
    PENDING
    APPROVED
    REJECTED
  }

  type Company @key(fields: "id") {
    id: ID!
    code: String!
    name: String!
    size: CompanySize!
    industry: String
    email: String!
    phone: String
    website: String
    address: String
    city: String
    country: String
    taxId: String
    creditLimit: Decimal
    paymentTerms: Int!
    isActive: Boolean!
    contacts: [CompanyContact!]!
    rfqs: [RFQ!]!
    createdAt: DateTime!
  }

  type CompanyContact {
    id: ID!
    companyId: ID!
    userId: ID
    name: String!
    email: String!
    phone: String
    title: String
    isPrimary: Boolean!
  }

  type RFQ @key(fields: "id") {
    id: ID!
    code: String!
    company: Company!
    title: String!
    description: String
    eventType: String
    paxCount: Int!
    startDate: DateTime!
    endDate: DateTime!
    destinations: [String!]!
    budget: Decimal
    currency: String!
    requirements: JSON
    status: RFQStatus!
    submittedAt: DateTime!
    expiresAt: DateTime
    quotations: [Quotation!]!
  }

  type Quotation @key(fields: "id") {
    id: ID!
    code: String!
    rfq: RFQ!
    version: Int!
    title: String!
    description: String
    totalAmount: Decimal!
    currency: String!
    lineItems: JSON!
    terms: String
    validUntil: DateTime!
    status: QuotationStatus!
    sentAt: DateTime
    respondedAt: DateTime
    approvals: [QuotationApproval!]!
  }

  type QuotationApproval {
    id: ID!
    quotationId: ID!
    approverId: ID!
    approverName: String!
    level: Int!
    status: ApprovalStatus!
    comments: String
    decidedAt: DateTime
  }

  type Query {
    company(id: ID!): Company
    companyByCode(code: String!): Company
    companies(size: CompanySize, isActive: Boolean): [Company!]!
    rfq(id: ID!): RFQ
    rfqByCode(code: String!): RFQ
    rfqs(companyId: ID, status: RFQStatus): [RFQ!]!
    quotation(id: ID!): Quotation
    quotations(rfqId: ID!, status: QuotationStatus): [Quotation!]!
  }

  input CreateCompanyInput {
    name: String!
    size: CompanySize!
    industry: String
    email: String!
    phone: String
    website: String
    address: String
    city: String
    country: String
    taxId: String
    creditLimit: Decimal
    paymentTerms: Int
  }

  input CreateRFQInput {
    companyId: ID!
    contactId: ID
    title: String!
    description: String
    eventType: String
    paxCount: Int!
    startDate: DateTime!
    endDate: DateTime!
    destinations: [String!]!
    budget: Decimal
    currency: String
    requirements: JSON
  }

  input CreateQuotationInput {
    rfqId: ID!
    title: String!
    description: String
    totalAmount: Decimal!
    currency: String
    lineItems: JSON!
    terms: String
    validUntil: DateTime!
  }

  type Mutation {
    createCompany(input: CreateCompanyInput!): Company!
    updateCompany(id: ID!, input: CreateCompanyInput!): Company!
    addCompanyContact(companyId: ID!, name: String!, email: String!, phone: String, title: String, isPrimary: Boolean): CompanyContact!
    removeCompanyContact(contactId: ID!): Boolean!
    createRFQ(input: CreateRFQInput!): RFQ!
    updateRFQStatus(id: ID!, status: RFQStatus!): RFQ!
    createQuotation(input: CreateQuotationInput!): Quotation!
    sendQuotation(id: ID!): Quotation!
    reviseQuotation(id: ID!, input: CreateQuotationInput!): Quotation!
    acceptQuotation(id: ID!): Quotation!
    rejectQuotation(id: ID!, reason: String): Quotation!
    requestApproval(quotationId: ID!, approverId: ID!, approverName: String!, level: Int): QuotationApproval!
    approveQuotation(approvalId: ID!, comments: String): QuotationApproval!
    rejectApproval(approvalId: ID!, comments: String!): QuotationApproval!
  }
`;
