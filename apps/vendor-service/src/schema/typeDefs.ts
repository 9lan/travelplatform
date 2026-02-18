import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  scalar DateTime
  scalar Decimal
  scalar JSON

  enum VendorType {
    OPERATOR
    HOTEL
    ACTIVITY
    GUIDE
    RESTAURANT
    TRANSPORT
  }

  enum VendorStatus {
    PENDING
    ACTIVE
    SUSPENDED
    TERMINATED
  }

  enum UserRole {
    OWNER
    ADMIN
    STAFF
  }

  type Vendor @key(fields: "id") {
    id: ID!
    code: String!
    name: String!
    type: VendorType!
    status: VendorStatus!
    email: String!
    phone: String
    website: String
    description: String
    address: String
    city: String
    country: String
    logoUrl: String
    commissionRate: Decimal!
    createdAt: DateTime!
    users: [VendorUser!]!
    products: [VendorProduct!]!
  }

  type VendorUser {
    id: ID!
    vendorId: ID!
    userId: ID!
    email: String!
    name: String!
    role: UserRole!
    isActive: Boolean!
  }

  type VendorProduct {
    id: ID!
    vendorId: ID!
    productType: String!
    productId: ID!
    isActive: Boolean!
  }

  type Query {
    vendor(id: ID!): Vendor
    vendorByCode(code: String!): Vendor
    vendors(type: VendorType, status: VendorStatus): [Vendor!]!
    myVendor: Vendor
  }

  input CreateVendorInput {
    name: String!
    type: VendorType!
    email: String!
    phone: String
    website: String
    description: String
    address: String
    city: String
    country: String
    commissionRate: Decimal!
  }

  input UpdateVendorInput {
    name: String
    email: String
    phone: String
    website: String
    description: String
    address: String
    city: String
    country: String
    commissionRate: Decimal
  }

  type Mutation {
    createVendor(input: CreateVendorInput!): Vendor!
    updateVendor(id: ID!, input: UpdateVendorInput!): Vendor!
    verifyVendor(id: ID!): Vendor!
    suspendVendor(id: ID!): Vendor!
    addVendorUser(vendorId: ID!, userId: ID!, email: String!, name: String!, role: UserRole!): VendorUser!
    removeVendorUser(vendorId: ID!, userId: ID!): Boolean!
    linkProduct(vendorId: ID!, productType: String!, productId: ID!): VendorProduct!
    unlinkProduct(vendorId: ID!, productType: String!, productId: ID!): Boolean!
  }
`;
