import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external", "@requires"])

  type Query {
    payment(id: ID!): Payment
    paymentByBooking(bookingId: ID!): Payment
    payments(filter: PaymentFilter): PaymentConnection!
    paymentMethods: [PaymentMethod!]!
    paymentMethod(code: String!): PaymentMethod
    refund(id: ID!): Refund
    refunds(paymentId: ID!): [Refund!]!
  }

  type Mutation {
    createPayment(input: CreatePaymentInput!): Payment!
    processPayment(paymentId: ID!, input: ProcessPaymentInput!): PaymentResult!
    cancelPayment(paymentId: ID!, reason: String): Payment!
    requestRefund(paymentId: ID!, input: RefundInput!): Refund!
    approveRefund(refundId: ID!): Refund!
    rejectRefund(refundId: ID!, reason: String!): Refund!
    processRefund(refundId: ID!): Refund!
    createPaymentMethod(input: CreatePaymentMethodInput!): PaymentMethod!
    updatePaymentMethod(code: String!, input: UpdatePaymentMethodInput!): PaymentMethod!
    handleWebhook(provider: String!, payload: JSON!): WebhookResult!
  }

  type Payment @key(fields: "id") {
    id: ID!
    bookingId: ID!
    customerId: ID!
    amount: Float!
    currency: String!
    status: PaymentStatus!
    paymentMethod: String!
    gatewayRef: String
    gatewayResponse: JSON
    expiresAt: DateTime!
    paidAt: DateTime
    transactions: [Transaction!]!
    refunds: [Refund!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Transaction @key(fields: "id") {
    id: ID!
    paymentId: ID!
    type: TransactionType!
    amount: Float!
    status: TransactionStatus!
    gatewayRef: String
    gatewayResponse: JSON
    processedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Refund @key(fields: "id") {
    id: ID!
    paymentId: ID!
    amount: Float!
    reason: String!
    status: RefundStatus!
    gatewayRef: String
    gatewayResponse: JSON
    requestedBy: ID!
    approvedBy: ID
    processedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type PaymentMethod {
    code: String!
    name: String!
    type: String!
    provider: String!
    isActive: Boolean!
    config: JSON
    displayOrder: Int!
  }

  type PaymentResult {
    payment: Payment!
    redirectUrl: String
    qrCode: String
    vaNumber: String
    expiresAt: DateTime!
  }

  type WebhookResult {
    success: Boolean!
    paymentId: ID
    message: String
  }

  type PaymentConnection {
    nodes: [Payment!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type PageInfo @shareable {
    hasNextPage: Boolean! @shareable
    hasPreviousPage: Boolean! @shareable
    startCursor: String @shareable
    endCursor: String @shareable
  }

  # Extend Booking from booking-service
  type Booking @key(fields: "id", resolvable: false) {
    id: ID! @external
  }

  enum PaymentStatus {
    PENDING
    PROCESSING
    PAID
    FAILED
    EXPIRED
    REFUNDED
    PARTIALLY_REFUNDED
  }

  enum TransactionType {
    CHARGE
    REFUND
    CHARGEBACK
  }

  enum TransactionStatus {
    PENDING
    SUCCESS
    FAILED
  }

  enum RefundStatus {
    PENDING
    APPROVED
    PROCESSING
    COMPLETED
    REJECTED
  }

  input CreatePaymentInput {
    bookingId: ID!
    amount: Float!
    currency: String
    paymentMethod: String!
  }

  input ProcessPaymentInput {
    cardToken: String
    bankCode: String
    ewalletType: String
    phoneNumber: String
  }

  input RefundInput {
    amount: Float!
    reason: String!
  }

  input PaymentFilter {
    customerId: ID
    status: PaymentStatus
    fromDate: DateTime
    toDate: DateTime
    first: Int
    after: String
  }

  input CreatePaymentMethodInput {
    code: String!
    name: String!
    type: String!
    provider: String!
    config: JSON
    displayOrder: Int
  }

  input UpdatePaymentMethodInput {
    name: String
    isActive: Boolean
    config: JSON
    displayOrder: Int
  }

  scalar DateTime
  scalar JSON
`;
