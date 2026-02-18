import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  scalar DateTime
  scalar Decimal
  scalar JSON

  enum ComponentType {
    ACCOMMODATION
    TRANSPORT
    ACTIVITY
    MEAL
    GUIDE
  }

  enum ComponentStatus {
    DRAFT
    ACTIVE
    SUSPENDED
    ARCHIVED
  }

  enum AvailabilityType {
    TIMESLOT
    DAILY_QUOTA
    ON_REQUEST
  }

  type Component @key(fields: "id") {
    id: ID!
    code: String!
    name: String!
    type: ComponentType!
    status: ComponentStatus!
    vendorId: ID
    description: String
    shortDescription: String
    location: String
    latitude: Float
    longitude: Float
    duration: Int
    basePrice: Decimal!
    currency: String!
    maxCapacity: Int
    minPax: Int!
    maxPax: Int
    availabilityType: AvailabilityType!
    images: [JSON!]!
    amenities: [String!]!
    pricing: [ComponentPricing!]!
    createdAt: DateTime!
  }

  type ComponentPricing {
    id: ID!
    name: String!
    priceAmount: Decimal!
    currency: String!
    minPax: Int!
    maxPax: Int
    validFrom: DateTime
    validTo: DateTime
    daysOfWeek: [Int!]
    isDefault: Boolean!
  }

  type Query {
    component(id: ID!): Component
    componentByCode(code: String!): Component
    components(type: ComponentType, status: ComponentStatus, vendorId: ID): [Component!]!
    searchComponents(query: String, type: ComponentType, location: String): [Component!]!
  }

  input CreateComponentInput {
    name: String!
    type: ComponentType!
    vendorId: ID
    description: String
    shortDescription: String
    location: String
    latitude: Float
    longitude: Float
    duration: Int
    basePrice: Decimal!
    currency: String
    maxCapacity: Int
    minPax: Int
    maxPax: Int
    availabilityType: AvailabilityType
    amenities: [String!]
  }

  input UpdateComponentInput {
    name: String
    description: String
    shortDescription: String
    location: String
    latitude: Float
    longitude: Float
    duration: Int
    basePrice: Decimal
    maxCapacity: Int
    minPax: Int
    maxPax: Int
    availabilityType: AvailabilityType
    amenities: [String!]
    status: ComponentStatus
  }

  input ComponentPricingInput {
    name: String!
    priceAmount: Decimal!
    currency: String
    minPax: Int
    maxPax: Int
    validFrom: DateTime
    validTo: DateTime
    daysOfWeek: [Int!]
    isDefault: Boolean
  }

  type Mutation {
    createComponent(input: CreateComponentInput!): Component!
    updateComponent(id: ID!, input: UpdateComponentInput!): Component!
    publishComponent(id: ID!): Component!
    archiveComponent(id: ID!): Component!
    addComponentPricing(componentId: ID!, input: ComponentPricingInput!): ComponentPricing!
    updateComponentPricing(pricingId: ID!, input: ComponentPricingInput!): ComponentPricing!
    removeComponentPricing(pricingId: ID!): Boolean!
  }
`;
