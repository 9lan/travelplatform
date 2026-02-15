import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external", "@requires"])

  type Query {
    seats(scheduleId: ID!): [Seat!]!
    seat(id: ID!): Seat
    seatLayout(vehicleId: ID!): SeatLayout
    seatLayouts: [SeatLayout!]!
    seatLock(id: ID!): SeatLock
    seatLockBySession(sessionId: String!): SeatLock
  }

  type Mutation {
    createSeatLayout(input: CreateSeatLayoutInput!): SeatLayout!
    updateSeatLayout(id: ID!, input: UpdateSeatLayoutInput!): SeatLayout!
    initializeSeats(scheduleId: ID!, vehicleId: ID!): [Seat!]!
    lockSeats(input: LockSeatsInput!): SeatLock!
    unlockSeats(lockId: ID!): Boolean!
    confirmSeats(lockId: ID!, bookingId: ID!): [Seat!]!
    releaseExpiredLocks: Int!
  }

  type Seat @key(fields: "id") {
    id: ID!
    scheduleId: ID!
    seatNumber: String!
    seatType: SeatType!
    status: SeatStatus!
    bookingId: ID
    layout: SeatLayout!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SeatLayout @key(fields: "id") {
    id: ID!
    vehicleId: ID!
    name: String!
    rows: Int!
    columns: Int!
    layout: JSON!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SeatLock @key(fields: "id") {
    id: ID!
    scheduleId: ID!
    seatIds: [ID!]!
    customerId: ID
    sessionId: String!
    status: SeatLockStatus!
    expiresAt: DateTime!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # Extend Schedule from shuttle-service
  type Schedule @key(fields: "id", resolvable: false) {
    id: ID! @external
  }

  # Extend Vehicle from shuttle-service
  type Vehicle @key(fields: "id", resolvable: false) {
    id: ID! @external
  }

  enum SeatType {
    REGULAR
    PREMIUM
    VIP
  }

  enum SeatStatus {
    AVAILABLE
    LOCKED
    BOOKED
    BLOCKED
  }

  enum SeatLockStatus {
    ACTIVE
    CONFIRMED
    EXPIRED
    RELEASED
  }

  input CreateSeatLayoutInput {
    vehicleId: ID!
    name: String!
    rows: Int!
    columns: Int!
    layout: JSON!
  }

  input UpdateSeatLayoutInput {
    name: String
    rows: Int
    columns: Int
    layout: JSON
  }

  input LockSeatsInput {
    scheduleId: ID!
    seatIds: [ID!]!
    customerId: ID
    sessionId: String!
    durationMinutes: Int
  }

  scalar DateTime
  scalar JSON
`;
