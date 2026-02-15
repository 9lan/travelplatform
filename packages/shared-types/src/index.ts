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
