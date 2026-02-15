import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external", "@requires"])

  type Query {
    price(scheduleId: ID!, seatType: SeatType): Price
    prices(routeId: ID): [Price!]!
    calculateFare(input: CalculateFareInput!): FareBreakdown!
    priceRules(filter: PriceRuleFilter): [PriceRule!]!
    priceRule(id: ID!): PriceRule
    seatTypePrices(routeId: ID): [SeatTypePrice!]!
  }

  type Mutation {
    createPrice(input: CreatePriceInput!): Price!
    updatePrice(id: ID!, input: UpdatePriceInput!): Price!
    createPriceRule(input: CreatePriceRuleInput!): PriceRule!
    updatePriceRule(id: ID!, input: UpdatePriceRuleInput!): PriceRule!
    deletePriceRule(id: ID!): Boolean!
    createSeatTypePrice(input: CreateSeatTypePriceInput!): SeatTypePrice!
    updateSeatTypePrice(id: ID!, input: UpdateSeatTypePriceInput!): SeatTypePrice!
  }

  type Price @key(fields: "id") {
    id: ID!
    scheduleId: ID!
    routeId: ID!
    basePrice: Float!
    currency: String!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type PriceRule @key(fields: "id") {
    id: ID!
    name: String!
    description: String
    ruleType: PriceRuleType!
    routeId: ID
    conditions: JSON!
    adjustment: Float!
    adjustmentType: AdjustmentType!
    priority: Int!
    isActive: Boolean!
    validFrom: DateTime
    validTo: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SeatTypePrice @key(fields: "id") {
    id: ID!
    routeId: ID
    seatType: String!
    multiplier: Float!
    fixedExtra: Float!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type FareBreakdown {
    basePrice: Float!
    seatTypeAdjustment: Float!
    ruleAdjustments: [RuleAdjustment!]!
    subtotal: Float!
    totalPrice: Float!
    currency: String!
  }

  type RuleAdjustment {
    ruleName: String!
    ruleType: PriceRuleType!
    adjustment: Float!
  }

  # Extend Schedule from shuttle-service
  type Schedule @key(fields: "id", resolvable: false) {
    id: ID! @external
  }

  # Extend Route from shuttle-service
  type Route @key(fields: "id", resolvable: false) {
    id: ID! @external
  }

  enum PriceRuleType {
    SURGE
    TIME_BASED
    DAY_OF_WEEK
    ADVANCE_BOOKING
    HOLIDAY
    PROMOTIONAL
  }

  enum AdjustmentType {
    PERCENTAGE
    FIXED
  }

  enum SeatType {
    REGULAR
    PREMIUM
    VIP
  }

  input CalculateFareInput {
    scheduleId: ID!
    seatType: SeatType
    seatCount: Int!
    bookingDate: DateTime
  }

  input CreatePriceInput {
    scheduleId: ID!
    routeId: ID!
    basePrice: Float!
    currency: String
  }

  input UpdatePriceInput {
    basePrice: Float
    currency: String
    isActive: Boolean
  }

  input CreatePriceRuleInput {
    name: String!
    description: String
    ruleType: PriceRuleType!
    routeId: ID
    conditions: JSON!
    adjustment: Float!
    adjustmentType: AdjustmentType!
    priority: Int
    validFrom: DateTime
    validTo: DateTime
  }

  input UpdatePriceRuleInput {
    name: String
    description: String
    conditions: JSON
    adjustment: Float
    adjustmentType: AdjustmentType
    priority: Int
    isActive: Boolean
    validFrom: DateTime
    validTo: DateTime
  }

  input PriceRuleFilter {
    ruleType: PriceRuleType
    routeId: ID
    isActive: Boolean
  }

  input CreateSeatTypePriceInput {
    routeId: ID
    seatType: String!
    multiplier: Float
    fixedExtra: Float
  }

  input UpdateSeatTypePriceInput {
    multiplier: Float
    fixedExtra: Float
    isActive: Boolean
  }

  scalar DateTime
  scalar JSON
`;
