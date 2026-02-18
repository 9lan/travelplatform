import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external"])

  scalar DateTime
  scalar JSON
  scalar Decimal

  # ─────────────────────────────────────────────
  # ENUMS
  # ─────────────────────────────────────────────

  enum TourType {
    AGGREGATED
    CUSTOM
  }

  enum TourSource {
    INTERNAL
    KLOOK
    VIATOR
    LOCAL_OPERATOR
  }

  enum TourStatus {
    DRAFT
    ACTIVE
    SUSPENDED
    ARCHIVED
  }

  enum Difficulty {
    EASY
    MODERATE
    CHALLENGING
  }

  enum ComponentType {
    ACCOMMODATION
    TRANSPORT
    ACTIVITY
    MEAL
    GUIDE
  }

  enum TourSortField {
    RELEVANCE
    PRICE_LOW
    PRICE_HIGH
    DURATION
    RATING
    POPULARITY
  }

  enum SortOrder {
    ASC
    DESC
  }

  # ─────────────────────────────────────────────
  # TYPES
  # ─────────────────────────────────────────────

  type Destination @key(fields: "id") {
    id: ID!
    name: String!
    slug: String!
    country: String!
    timezone: String!
    latitude: Float!
    longitude: Float!
    imageUrl: String
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Category @key(fields: "id") {
    id: ID!
    name: String!
    slug: String!
    icon: String
    parent: Category
    children: [Category!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Duration {
    days: Int!
    nights: Int!
  }

  type Money {
    amount: Decimal!
    currency: String!
  }

  type Rating {
    average: Float
    count: Int!
  }

  type Image {
    url: String!
    alt: String
  }

  type Tour @key(fields: "id") {
    id: ID!
    code: String!
    name: String!
    slug: String!
    description: String
    type: TourType!
    source: TourSource!
    destination: Destination!
    duration: Duration!
    difficulty: Difficulty!
    minPax: Int!
    maxPax: Int!
    priceFrom: Money!
    highlights: [String!]!
    inclusions: [String!]!
    exclusions: [String!]!
    images: [Image!]!
    categories: [Category!]!
    themes: [String!]!
    status: TourStatus!
    itinerary: [ItineraryDay!]!
    rating: Rating
    bookingCount: Int!
    publishedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ItineraryDay {
    dayNumber: Int!
    title: String!
    description: String
    items: [ItineraryItem!]!
  }

  type ItineraryItem {
    id: ID!
    sequence: Int!
    componentType: ComponentType!
    componentId: ID!
    startTime: String
    endTime: String
    isOptional: Boolean!
    priceOverride: Decimal
    notes: String
  }

  # ─────────────────────────────────────────────
  # PAGINATION
  # ─────────────────────────────────────────────

  type PageInfo @shareable {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type TourEdge {
    cursor: String!
    node: Tour!
  }

  type TourConnection {
    edges: [TourEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type DestinationEdge {
    cursor: String!
    node: Destination!
  }

  type DestinationConnection {
    edges: [DestinationEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  # ─────────────────────────────────────────────
  # INPUTS
  # ─────────────────────────────────────────────

  input DateRangeInput {
    start: DateTime!
    end: DateTime!
  }

  input DurationRangeInput {
    minDays: Int
    maxDays: Int
  }

  input PriceRangeInput {
    min: Decimal
    max: Decimal
  }

  input PaxInput {
    adults: Int!
    children: Int
    infants: Int
  }

  input CoordinatesInput {
    latitude: Float!
    longitude: Float!
    radiusKm: Float
  }

  input TourSearchInput {
    query: String
    destinationId: ID
    coordinates: CoordinatesInput
    dateRange: DateRangeInput
    duration: DurationRangeInput
    pax: PaxInput
    categoryIds: [ID!]
    themes: [String!]
    priceRange: PriceRangeInput
    difficulty: [Difficulty!]
    sources: [TourSource!]
    first: Int
    after: String
    sortBy: TourSortField
    sortOrder: SortOrder
  }

  input CreateDestinationInput {
    name: String!
    slug: String!
    country: String!
    timezone: String!
    latitude: Float!
    longitude: Float!
    imageUrl: String
  }

  input CreateCategoryInput {
    name: String!
    slug: String!
    icon: String
    parentId: ID
  }

  input CreateTourInput {
    name: String!
    description: String
    type: TourType!
    source: TourSource!
    providerId: String
    providerRef: String
    destinationId: ID!
    durationDays: Int!
    durationNights: Int!
    difficulty: Difficulty
    minPax: Int
    maxPax: Int!
    basePrice: Decimal!
    currency: String
    highlights: [String!]
    inclusions: [String!]
    exclusions: [String!]
    images: [JSON!]
    categoryIds: [ID!]
    themes: [String!]
  }

  input UpdateTourInput {
    name: String
    description: String
    difficulty: Difficulty
    minPax: Int
    maxPax: Int
    basePrice: Decimal
    highlights: [String!]
    inclusions: [String!]
    exclusions: [String!]
    images: [JSON!]
    categoryIds: [ID!]
    themes: [String!]
    status: TourStatus
  }

  input ItineraryDayInput {
    dayNumber: Int!
    title: String!
    description: String
  }

  input ItineraryItemInput {
    componentType: ComponentType!
    componentId: ID!
    startTime: String
    endTime: String
    isOptional: Boolean
    priceOverride: Decimal
    notes: String
  }

  # ─────────────────────────────────────────────
  # QUERIES
  # ─────────────────────────────────────────────

  type Query {
    # Tour discovery
    searchTours(input: TourSearchInput!): TourConnection!
    tourById(id: ID!): Tour
    tourBySlug(slug: String!): Tour
    featuredTours(destinationId: ID, limit: Int): [Tour!]!

    # Destinations & Categories
    destinations(first: Int, after: String): DestinationConnection!
    destinationById(id: ID!): Destination
    destinationBySlug(slug: String!): Destination
    categories: [Category!]!
    categoryById(id: ID!): Category

    # Popular
    popularDestinations(limit: Int): [Destination!]!
    popularThemes: [String!]!
  }

  # ─────────────────────────────────────────────
  # MUTATIONS
  # ─────────────────────────────────────────────

  type Mutation {
    # Destination management (admin)
    createDestination(input: CreateDestinationInput!): Destination!
    updateDestination(id: ID!, input: CreateDestinationInput!): Destination!
    deleteDestination(id: ID!): Boolean!

    # Category management (admin)
    createCategory(input: CreateCategoryInput!): Category!
    updateCategory(id: ID!, input: CreateCategoryInput!): Category!
    deleteCategory(id: ID!): Boolean!

    # Tour management (admin)
    createTour(input: CreateTourInput!): Tour!
    updateTour(id: ID!, input: UpdateTourInput!): Tour!
    publishTour(id: ID!): Tour!
    archiveTour(id: ID!): Tour!
    deleteTour(id: ID!): Boolean!

    # Itinerary management
    addItineraryDay(tourId: ID!, input: ItineraryDayInput!): ItineraryDay!
    updateItineraryDay(tourId: ID!, dayNumber: Int!, input: ItineraryDayInput!): ItineraryDay!
    removeItineraryDay(tourId: ID!, dayNumber: Int!): Boolean!
    addItineraryItem(tourId: ID!, dayNumber: Int!, input: ItineraryItemInput!): ItineraryItem!
    updateItineraryItem(itemId: ID!, input: ItineraryItemInput!): ItineraryItem!
    removeItineraryItem(itemId: ID!): Boolean!
    reorderItineraryItems(tourId: ID!, dayNumber: Int!, itemIds: [ID!]!): ItineraryDay!
  }
`;
