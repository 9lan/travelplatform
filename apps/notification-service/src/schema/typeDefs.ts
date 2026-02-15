import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external", "@requires"])

  type Query {
    notification(id: ID!): Notification
    notifications(filter: NotificationFilter!): NotificationConnection!
    unreadCount(customerId: ID!): Int!
    notificationTemplate(id: ID!): NotificationTemplate
    notificationTemplateByCode(code: String!): NotificationTemplate
    notificationTemplates(filter: NotificationTemplateFilter): [NotificationTemplate!]!
    deviceTokens(customerId: ID!): [DeviceToken!]!
    bulkNotificationJob(id: ID!): BulkNotificationJob
    bulkNotificationJobs(filter: BulkJobFilter): [BulkNotificationJob!]!
  }

  type Mutation {
    sendNotification(input: SendNotificationInput!): Notification!
    sendBulkNotification(input: SendBulkNotificationInput!): BulkNotificationJob!
    markAsRead(notificationIds: [ID!]!): [Notification!]!
    markAllAsRead(customerId: ID!): Int!
    deleteNotification(id: ID!): Boolean!
    registerDevice(input: RegisterDeviceInput!): DeviceToken!
    unregisterDevice(token: String!): Boolean!
    createNotificationTemplate(input: CreateNotificationTemplateInput!): NotificationTemplate!
    updateNotificationTemplate(id: ID!, input: UpdateNotificationTemplateInput!): NotificationTemplate!
    deleteNotificationTemplate(id: ID!): Boolean!
    cancelBulkJob(id: ID!): BulkNotificationJob!
  }

  type Notification @key(fields: "id") {
    id: ID!
    customerId: ID!
    template: NotificationTemplate
    channel: NotificationChannel!
    type: NotificationType!
    title: String!
    body: String!
    data: JSON
    status: NotificationStatus!
    sentAt: DateTime
    readAt: DateTime
    failedAt: DateTime
    failReason: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type NotificationTemplate @key(fields: "id") {
    id: ID!
    code: String!
    name: String!
    channel: NotificationChannel!
    type: NotificationType!
    subject: String
    title: String!
    body: String!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type DeviceToken @key(fields: "id") {
    id: ID!
    customerId: ID!
    token: String!
    platform: Platform!
    deviceInfo: JSON
    isActive: Boolean!
    lastUsedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type BulkNotificationJob @key(fields: "id") {
    id: ID!
    name: String!
    templateId: ID!
    channel: NotificationChannel!
    filters: JSON
    totalCount: Int!
    sentCount: Int!
    failedCount: Int!
    status: BulkJobStatus!
    scheduledAt: DateTime
    startedAt: DateTime
    completedAt: DateTime
    createdBy: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type NotificationConnection {
    nodes: [Notification!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type PageInfo @shareable {
    hasNextPage: Boolean! @shareable
    hasPreviousPage: Boolean! @shareable
    startCursor: String @shareable
    endCursor: String @shareable
  }

  enum NotificationChannel {
    PUSH
    EMAIL
    SMS
    IN_APP
    WHATSAPP
  }

  enum NotificationType {
    BOOKING_CONFIRMATION
    BOOKING_REMINDER
    BOOKING_CANCELLED
    PAYMENT_SUCCESS
    PAYMENT_FAILED
    PAYMENT_REMINDER
    DEPARTURE_REMINDER
    TRIP_COMPLETED
    PROMO
    SYSTEM
  }

  enum NotificationStatus {
    PENDING
    SENT
    DELIVERED
    READ
    FAILED
  }

  enum Platform {
    IOS
    ANDROID
    WEB
  }

  enum BulkJobStatus {
    PENDING
    SCHEDULED
    PROCESSING
    COMPLETED
    FAILED
    CANCELLED
  }

  input SendNotificationInput {
    customerId: ID!
    templateCode: String
    channel: NotificationChannel!
    type: NotificationType!
    title: String
    body: String
    data: JSON
  }

  input SendBulkNotificationInput {
    name: String!
    templateId: ID!
    channel: NotificationChannel!
    filters: JSON
    scheduledAt: DateTime
  }

  input RegisterDeviceInput {
    customerId: ID!
    token: String!
    platform: Platform!
    deviceInfo: JSON
  }

  input CreateNotificationTemplateInput {
    code: String!
    name: String!
    channel: NotificationChannel!
    type: NotificationType!
    subject: String
    title: String!
    body: String!
  }

  input UpdateNotificationTemplateInput {
    name: String
    subject: String
    title: String
    body: String
    isActive: Boolean
  }

  input NotificationFilter {
    customerId: ID!
    channel: NotificationChannel
    type: NotificationType
    status: NotificationStatus
    unreadOnly: Boolean
    first: Int
    after: String
  }

  input NotificationTemplateFilter {
    channel: NotificationChannel
    type: NotificationType
    isActive: Boolean
  }

  input BulkJobFilter {
    status: BulkJobStatus
    fromDate: DateTime
    toDate: DateTime
  }

  scalar DateTime
  scalar JSON
`;
