import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external", "@requires"])

  type Query {
    voucher(id: ID!): Voucher
    voucherByCode(code: String!): Voucher
    vouchers(filter: VoucherFilter): [Voucher!]!
    validateVoucher(code: String!, input: ValidateVoucherInput!): VoucherValidation!
    campaign(id: ID!): Campaign
    campaigns(filter: CampaignFilter): [Campaign!]!
    customerCashback(customerId: ID!): CashbackBalance
    cashbackTransactions(customerId: ID!, filter: CashbackTransactionFilter): [CashbackTransaction!]!
  }

  type Mutation {
    createVoucher(input: CreateVoucherInput!): Voucher!
    updateVoucher(id: ID!, input: UpdateVoucherInput!): Voucher!
    deactivateVoucher(id: ID!): Voucher!
    applyVoucher(code: String!, bookingId: ID!): VoucherApplication!
    createCampaign(input: CreateCampaignInput!): Campaign!
    updateCampaign(id: ID!, input: UpdateCampaignInput!): Campaign!
    awardCashback(input: AwardCashbackInput!): CashbackTransaction!
    redeemCashback(customerId: ID!, amount: Float!, bookingId: ID!): CashbackRedemption!
    releasePendingCashback(transactionId: ID!): CashbackTransaction!
    expireCashback(transactionId: ID!): CashbackTransaction!
  }

  type Voucher @key(fields: "id") {
    id: ID!
    code: String!
    campaign: Campaign
    type: VoucherType!
    value: Float!
    maxDiscount: Float
    minPurchase: Float
    usageLimit: Int
    usageCount: Int!
    perUserLimit: Int!
    routeIds: [ID!]!
    isActive: Boolean!
    validFrom: DateTime!
    validTo: DateTime!
    usages: [VoucherUsage!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Campaign @key(fields: "id") {
    id: ID!
    name: String!
    description: String
    type: CampaignType!
    budget: Float
    spent: Float!
    isActive: Boolean!
    startDate: DateTime!
    endDate: DateTime!
    vouchers: [Voucher!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type VoucherUsage {
    id: ID!
    voucherId: ID!
    customerId: ID!
    bookingId: ID!
    discount: Float!
    usedAt: DateTime!
  }

  type CashbackBalance @key(fields: "id") {
    id: ID!
    customerId: ID!
    balance: Float!
    pendingBalance: Float!
    totalEarned: Float!
    totalRedeemed: Float!
    transactions: [CashbackTransaction!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type CashbackTransaction @key(fields: "id") {
    id: ID!
    type: CashbackType!
    amount: Float!
    bookingId: ID
    description: String
    status: CashbackStatus!
    releaseAt: DateTime
    processedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type VoucherValidation {
    isValid: Boolean!
    voucher: Voucher
    discount: Float
    message: String
    errors: [String!]
  }

  type VoucherApplication {
    success: Boolean!
    voucher: Voucher!
    discount: Float!
    message: String
  }

  type CashbackRedemption {
    success: Boolean!
    transaction: CashbackTransaction!
    newBalance: Float!
    message: String
  }

  # Extend Booking from booking-service
  type Booking @key(fields: "id", resolvable: false) {
    id: ID! @external
  }

  enum VoucherType {
    PERCENTAGE
    FIXED
    FREE_UPGRADE
  }

  enum CampaignType {
    SEASONAL
    REFERRAL
    LOYALTY
    PARTNERSHIP
    PROMOTIONAL
  }

  enum CashbackType {
    EARNED
    REDEEMED
    EXPIRED
    ADJUSTED
  }

  enum CashbackStatus {
    PENDING
    RELEASED
    REDEEMED
    EXPIRED
    CANCELLED
  }

  input CreateVoucherInput {
    code: String!
    campaignId: ID
    type: VoucherType!
    value: Float!
    maxDiscount: Float
    minPurchase: Float
    usageLimit: Int
    perUserLimit: Int
    routeIds: [ID!]
    validFrom: DateTime!
    validTo: DateTime!
  }

  input UpdateVoucherInput {
    value: Float
    maxDiscount: Float
    minPurchase: Float
    usageLimit: Int
    perUserLimit: Int
    routeIds: [ID!]
    isActive: Boolean
    validFrom: DateTime
    validTo: DateTime
  }

  input ValidateVoucherInput {
    customerId: ID!
    routeId: ID!
    amount: Float!
  }

  input VoucherFilter {
    campaignId: ID
    type: VoucherType
    isActive: Boolean
    validNow: Boolean
  }

  input CreateCampaignInput {
    name: String!
    description: String
    type: CampaignType!
    budget: Float
    startDate: DateTime!
    endDate: DateTime!
  }

  input UpdateCampaignInput {
    name: String
    description: String
    budget: Float
    isActive: Boolean
    startDate: DateTime
    endDate: DateTime
  }

  input CampaignFilter {
    type: CampaignType
    isActive: Boolean
    activeNow: Boolean
  }

  input AwardCashbackInput {
    customerId: ID!
    amount: Float!
    bookingId: ID
    description: String
    releaseAfterDays: Int
  }

  input CashbackTransactionFilter {
    type: CashbackType
    status: CashbackStatus
    fromDate: DateTime
    toDate: DateTime
  }

  scalar DateTime
`;
