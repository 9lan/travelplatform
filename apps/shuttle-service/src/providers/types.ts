/**
 * Shuttle Provider Types
 *
 * These types define the common interface for all shuttle provider integrations
 * (Tiketux, Traveloka, RedBus, etc.)
 */

export enum ProviderCode {
  TIKETUX = 'TIKETUX',
  TRAVELOKA = 'TRAVELOKA',
  REDBUS = 'REDBUS',
}

// ─────────────────────────────────────────────
// Common Types
// ─────────────────────────────────────────────

export interface ProviderCity {
  id: string;
  name: string;
  province?: string;
  providerCode: ProviderCode;
  providerCityId: string;
}

export interface ProviderOutlet {
  id: string;
  code: string;
  name: string;
  cityId: string;
  cityName: string;
  address: string;
  latitude?: number;
  longitude?: number;
  providerCode: ProviderCode;
  providerOutletId: string;
}

export interface ProviderSchedule {
  id: string;
  providerCode: ProviderCode;
  providerScheduleId: string;
  origin: ProviderOutlet;
  destination: ProviderOutlet;
  departureTime: Date;
  arrivalTime?: Date;
  vehicleType: string;
  vehicleName?: string;
  serviceClass?: string;
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  currency: string;
  amenities?: string[];
}

export interface ProviderSeat {
  id: string;
  seatNumber: string;
  row: number;
  column: number;
  status: SeatAvailability;
  type: string;
  price: number;
  serviceName?: string;
  insurancePrice?: number;
}

export enum SeatAvailability {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
  SELECTED = 'SELECTED',
  SOLD = 'SOLD',
}

export interface ProviderSeatLayout {
  scheduleId: string;
  rows: number;
  columns: number;
  totalSeats: number;
  availableSeats: number;
  vehicleType: string;
  seats: ProviderSeat[];
}

export interface ProviderPriceBreakdown {
  basePrice: number;
  insurancePrice: number;
  serviceFee: number;
  discount: number;
  voucherDiscount: number;
  totalPrice: number;
  currency: string;
  priceDetails: PriceDetail[];
}

export interface PriceDetail {
  title: string;
  amount: number;
  type: 'add' | 'subtract' | 'base';
}

export interface ProviderPassenger {
  name: string;
  phone?: string;
  email?: string;
  idType?: string;
  idNumber?: string;
  seatNumber: string;
}

export interface ProviderBookingRequest {
  scheduleId: string;
  departureDate: string; // DD-MM-YYYY
  originOutletId: string;
  destinationOutletId: string;
  departureTime: string; // HH:MM
  passengers: ProviderPassenger[];
  bookerName: string;
  bookerPhone: string;
  bookerEmail: string;
  bookerAddress?: string;
  paymentMethod: string;
  voucherCode?: string;
  includeInsurance?: boolean;
  pickupAddress?: string;
  dropoffAddress?: string;
}

export interface ProviderBooking {
  id: string;
  providerCode: ProviderCode;
  providerBookingCode: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  bookerName: string;
  bookerPhone: string;
  bookerEmail: string;
  bookingTime: Date;
  paymentDeadline?: Date;
  totalPrice: number;
  discount: number;
  finalPrice: number;
  currency: string;
  departureDate: Date;
  departureTime: string;
  origin: string;
  destination: string;
  tickets: ProviderTicket[];
  eTicketUrl?: string;
  paymentUrl?: string;
}

export interface ProviderTicket {
  ticketNumber: string;
  passengerName: string;
  seatNumber: string;
  price: number;
  insurancePrice: number;
  discount: number;
  totalPrice: number;
  qrCode?: string;
  qrCodeUrl?: string;
  isCancelled: boolean;
  isBoarded: boolean;
}

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

// ─────────────────────────────────────────────
// Provider Interface
// ─────────────────────────────────────────────

export interface ShuttleProviderConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeout?: number;
}

export interface SearchScheduleParams {
  originCityId?: string;
  originOutletId?: string;
  destinationCityId?: string;
  destinationOutletId?: string;
  departureDate: string; // DD-MM-YYYY
  passengerCount?: number;
  isRoundTrip?: boolean;
  returnDate?: string;
}

export interface CheckSeatAvailabilityParams {
  scheduleId: string;
  departureDate: string;
  originOutletId: string;
  destinationOutletId: string;
  seatNumbers: string[];
}

export interface CalculatePriceParams {
  scheduleId: string;
  departureDate: string;
  originOutletId: string;
  destinationOutletId: string;
  seatNumbers: string[];
  voucherCode?: string;
  includeInsurance?: boolean;
  bookerPhone?: string;
}

export interface IShuttleProvider {
  readonly code: ProviderCode;
  readonly name: string;

  // Authentication
  authenticate(): Promise<void>;
  isAuthenticated(): boolean;

  // Master Data
  getCities(): Promise<ProviderCity[]>;
  getOriginOutlets(cityId?: string): Promise<ProviderOutlet[]>;
  getDestinationOutlets(originOutletId: string): Promise<ProviderOutlet[]>;

  // Schedule & Seats
  searchSchedules(params: SearchScheduleParams): Promise<ProviderSchedule[]>;
  getSeatLayout(
    scheduleId: string,
    departureDate: string,
    originOutletId: string,
    destinationOutletId: string
  ): Promise<ProviderSeatLayout>;
  checkSeatAvailability(params: CheckSeatAvailabilityParams): Promise<boolean>;

  // Pricing
  calculatePrice(params: CalculatePriceParams): Promise<ProviderPriceBreakdown>;

  // Booking
  createBooking(request: ProviderBookingRequest): Promise<ProviderBooking>;
  getBookingDetail(bookingCode: string): Promise<ProviderBooking>;
  confirmPayment(bookingCode: string, paidAt: Date): Promise<ProviderBooking>;
  cancelBooking(bookingCode: string, reason?: string): Promise<ProviderBooking>;

  // Health Check
  healthCheck(): Promise<boolean>;
}
