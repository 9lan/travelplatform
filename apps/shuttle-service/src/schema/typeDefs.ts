import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  type Query {
    routes(filter: RouteFilter): [Route!]!
    route(id: ID!): Route
    schedules(filter: ScheduleFilter!): [Schedule!]!
    schedule(id: ID!): Schedule
    counters(cityId: ID): [Counter!]!
    counter(id: ID!): Counter
    cities: [City!]!
    city(id: ID!): City
    vehicles: [Vehicle!]!
    vehicle(id: ID!): Vehicle
  }

  type Mutation {
    createCity(input: CreateCityInput!): City!
    createCounter(input: CreateCounterInput!): Counter!
    createRoute(input: CreateRouteInput!): Route!
    createVehicle(input: CreateVehicleInput!): Vehicle!
    createSchedule(input: CreateScheduleInput!): Schedule!
    updateScheduleStatus(id: ID!, status: ScheduleStatus!): Schedule!
    assignDriver(scheduleId: ID!, driverName: String!, vehiclePlate: String!): Schedule!
  }

  type City @key(fields: "id") {
    id: ID!
    name: String!
    province: String!
    counters: [Counter!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Counter @key(fields: "id") {
    id: ID!
    code: String!
    name: String!
    city: City!
    address: String!
    latitude: Float!
    longitude: Float!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Route @key(fields: "id") {
    id: ID!
    code: String!
    origin: Counter!
    destination: Counter!
    distance: Float
    estimatedDuration: Int!
    isActive: Boolean!
    schedules(filter: ScheduleFilter): [Schedule!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Vehicle @key(fields: "id") {
    id: ID!
    code: String!
    name: String!
    type: VehicleType!
    capacity: Int!
    amenities: [String!]!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Schedule @key(fields: "id") {
    id: ID!
    code: String!
    route: Route!
    vehicle: Vehicle!
    departureTime: DateTime!
    arrivalTime: DateTime!
    driverName: String
    vehiclePlate: String
    status: ScheduleStatus!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  enum VehicleType {
    HIACE
    MINIBUS
    BUS
  }

  enum ScheduleStatus {
    SCHEDULED
    BOARDING
    DEPARTED
    ARRIVED
    CANCELLED
  }

  input RouteFilter {
    originCityId: ID
    destinationCityId: ID
    isActive: Boolean
  }

  input ScheduleFilter {
    routeId: ID
    originId: ID
    destinationId: ID
    departureDate: Date
    status: ScheduleStatus
  }

  input CreateCityInput {
    name: String!
    province: String!
  }

  input CreateCounterInput {
    code: String!
    name: String!
    cityId: ID!
    address: String!
    latitude: Float!
    longitude: Float!
  }

  input CreateRouteInput {
    code: String!
    originId: ID!
    destinationId: ID!
    distance: Float
    estimatedDuration: Int!
  }

  input CreateVehicleInput {
    code: String!
    name: String!
    type: VehicleType!
    capacity: Int!
    amenities: [String!]
  }

  input CreateScheduleInput {
    routeId: ID!
    vehicleId: ID!
    departureTime: DateTime!
    arrivalTime: DateTime!
  }

  scalar DateTime
  scalar Date
`;
