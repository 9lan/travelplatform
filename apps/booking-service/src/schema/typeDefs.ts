import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external", "@requires"])

  type Query {
    booking(id: ID!): Booking
    bookingByCode(code: String!): Booking
    myBookings(filter: MyBookingFilter): [Booking!]!
    bookings(filter: BookingFilter): BookingConnection!
    traveler(id: ID!): Traveler
  }

  type Mutation {
    createBooking(input: CreateBookingInput!): Booking!
    cancelBooking(id: ID!, reason: String): Booking!
    rescheduleBooking(id: ID!, newScheduleId: ID!, newSeatIds: [ID!]!): Booking!
    confirmBooking(id: ID!, paymentId: ID!): Booking!
    expireBooking(id: ID!): Booking!
    updateTraveler(id: ID!, input: UpdateTravelerInput!): Traveler!
  }

  type Booking @key(fields: "id") {
    id: ID!
    code: String!
    customerId: ID!
    scheduleId: ID!
    status: BookingStatus!
    totalAmount: Float!
    discountAmount: Float!
    finalAmount: Float!
    currency: String!
    voucherId: ID
    seatLockId: ID
    paymentId: ID
    notes: String
    expiresAt: DateTime!
    confirmedAt: DateTime
    cancelledAt: DateTime
    cancelReason: String
    travelers: [Traveler!]!
    seatIds: [ID!]!
    priceSnapshot: JSON!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Traveler @key(fields: "id") {
    id: ID!
    bookingId: ID!
    seatId: ID!
    name: String!
    idType: IdType
    idNumber: String
    phone: String
    email: String
    isPrimary: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type BookingConnection {
    nodes: [Booking!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  # Extend Schedule from shuttle-service
  type Schedule @key(fields: "id", resolvable: false) {
    id: ID! @external
  }

  # Extend Seat from seat-service
  type Seat @key(fields: "id", resolvable: false) {
    id: ID! @external
  }

  # Extend SeatLock from seat-service
  type SeatLock @key(fields: "id", resolvable: false) {
    id: ID! @external
  }

  enum BookingStatus {
    PENDING
    CONFIRMED
    COMPLETED
    CANCELLED
    EXPIRED
    REFUNDED
  }

  enum IdType {
    KTP
    SIM
    PASSPORT
    OTHER
  }

  input CreateBookingInput {
    scheduleId: ID!
    seatLockId: ID!
    seatIds: [ID!]!
    voucherId: ID
    travelers: [CreateTravelerInput!]!
    notes: String
  }

  input CreateTravelerInput {
    seatId: ID!
    name: String!
    idType: IdType
    idNumber: String
    phone: String
    email: String
    isPrimary: Boolean
  }

  input UpdateTravelerInput {
    name: String
    idType: IdType
    idNumber: String
    phone: String
    email: String
  }

  input MyBookingFilter {
    status: BookingStatus
    fromDate: DateTime
    toDate: DateTime
  }

  input BookingFilter {
    customerId: ID
    scheduleId: ID
    status: BookingStatus
    fromDate: DateTime
    toDate: DateTime
    first: Int
    after: String
  }

  scalar DateTime
  scalar JSON
`;
