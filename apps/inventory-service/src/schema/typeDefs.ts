import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  scalar DateTime
  scalar Decimal

  enum InventoryType {
    ALLOTMENT
    ON_REQUEST
  }

  enum HoldStatus {
    ACTIVE
    RELEASED
    CONVERTED
    EXPIRED
  }

  type InventoryPool @key(fields: "id") {
    id: ID!
    tourId: ID!
    date: DateTime!
    inventoryType: InventoryType!
    totalQuantity: Int!
    availableQty: Int!
    holdQty: Int!
    soldQty: Int!
  }

  type InventoryHold @key(fields: "id") {
    id: ID!
    poolId: ID!
    bookingId: ID
    quantity: Int!
    status: HoldStatus!
    expiresAt: DateTime!
  }

  type Query {
    inventoryPool(tourId: ID!, date: DateTime!): InventoryPool
    inventoryAvailability(tourId: ID!, startDate: DateTime!, endDate: DateTime!): [InventoryPool!]!
  }

  input CreateHoldInput {
    tourId: ID!
    date: DateTime!
    quantity: Int!
    durationMinutes: Int
  }

  type Mutation {
    createInventoryHold(input: CreateHoldInput!): InventoryHold!
    releaseHold(holdId: ID!): Boolean!
    convertHoldToBooking(holdId: ID!, bookingId: ID!): InventoryHold!
  }
`;
