// Common enums shared across services

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  NO_SHOW = 'NO_SHOW',
  EXPIRED = 'EXPIRED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  EXPIRED = 'EXPIRED',
}

export enum SeatStatus {
  AVAILABLE = 'AVAILABLE',
  LOCKED = 'LOCKED',
  BOOKED = 'BOOKED',
  BLOCKED = 'BLOCKED',
}

export enum SeatType {
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
  AISLE = 'AISLE',
  WINDOW = 'WINDOW',
  EMPTY = 'EMPTY',
}

export enum ScheduleStatus {
  SCHEDULED = 'SCHEDULED',
  BOARDING = 'BOARDING',
  DEPARTED = 'DEPARTED',
  ARRIVED = 'ARRIVED',
  CANCELLED = 'CANCELLED',
}

export enum VehicleType {
  HIACE = 'HIACE',
  MINIBUS = 'MINIBUS',
  BUS = 'BUS',
}

export enum TripType {
  ONE_WAY = 'ONE_WAY',
  ROUND_TRIP = 'ROUND_TRIP',
}

export enum IdType {
  KTP = 'KTP',
  SIM = 'SIM',
  PASSPORT = 'PASSPORT',
  OTHER = 'OTHER',
}

export enum NotificationType {
  TRANSACTIONAL = 'TRANSACTIONAL',
  PROMOTIONAL = 'PROMOTIONAL',
  REMINDER = 'REMINDER',
  SYSTEM = 'SYSTEM',
  ALERT = 'ALERT',
}

export enum NotificationChannel {
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  IN_APP = 'IN_APP',
  WHATSAPP = 'WHATSAPP',
}

export enum VoucherType {
  PERCENTAGE = 'PERCENTAGE',
  FLAT = 'FLAT',
  FREE_SEAT = 'FREE_SEAT',
}

// Common interfaces

export interface UserContext {
  id: string;
  email: string;
  role: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface PaginationArgs {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
}

// ─────────────────────────────────────────────
// Tour Vertical Enums
// ─────────────────────────────────────────────

export enum TourType {
  AGGREGATED = 'AGGREGATED',
  CUSTOM = 'CUSTOM',
}

export enum TourSource {
  INTERNAL = 'INTERNAL',
  KLOOK = 'KLOOK',
  VIATOR = 'VIATOR',
  LOCAL_OPERATOR = 'LOCAL_OPERATOR',
}

export enum TourStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export enum TourBookingStatus {
  DRAFT = 'DRAFT',
  PENDING_DEPOSIT = 'PENDING_DEPOSIT',
  CONFIRMING = 'CONFIRMING',
  CONFIRMATION_FAILED = 'CONFIRMATION_FAILED',
  PENDING_BALANCE = 'PENDING_BALANCE',
  BALANCE_OVERDUE = 'BALANCE_OVERDUE',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum ComponentType {
  ACCOMMODATION = 'ACCOMMODATION',
  TRANSPORT = 'TRANSPORT',
  ACTIVITY = 'ACTIVITY',
  MEAL = 'MEAL',
  GUIDE = 'GUIDE',
}

export enum ComponentStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export enum AvailabilityType {
  TIMESLOT = 'TIMESLOT',
  DAILY_QUOTA = 'DAILY_QUOTA',
  ON_REQUEST = 'ON_REQUEST',
}

export enum InventoryType {
  ALLOTMENT = 'ALLOTMENT',
  ON_REQUEST = 'ON_REQUEST',
}

export enum HoldStatus {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
  CONVERTED = 'CONVERTED',
  EXPIRED = 'EXPIRED',
}

export enum Difficulty {
  EASY = 'EASY',
  MODERATE = 'MODERATE',
  CHALLENGING = 'CHALLENGING',
}

// Vendor Enums
export enum VendorType {
  OPERATOR = 'OPERATOR',
  HOTEL = 'HOTEL',
  ACTIVITY = 'ACTIVITY',
  GUIDE = 'GUIDE',
  RESTAURANT = 'RESTAURANT',
  TRANSPORT = 'TRANSPORT',
}

export enum VendorStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TERMINATED = 'TERMINATED',
}

export enum VendorUserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
}

// Corporate Enums
export enum CompanySize {
  SME = 'SME',
  ENTERPRISE = 'ENTERPRISE',
  GOVERNMENT = 'GOVERNMENT',
}

export enum RFQStatus {
  SUBMITTED = 'SUBMITTED',
  IN_PROGRESS = 'IN_PROGRESS',
  QUOTED = 'QUOTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum QuotationStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  REVISED = 'REVISED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// ─────────────────────────────────────────────
// Tour Vertical Interfaces
// ─────────────────────────────────────────────

export interface Duration {
  days: number;
  nights: number;
}

export interface Money {
  amount: number | string;
  currency: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PaxCount {
  adults: number;
  children?: number;
  infants?: number;
}
