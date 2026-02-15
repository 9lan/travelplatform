/**
 * Traveloka API Types
 *
 * Based on Traveloka Bus/Shuttle PAPI (Partner API)
 */

// ─────────────────────────────────────────────
// General Types
// ─────────────────────────────────────────────

export interface TravelokaResponse<T> {
  status: number;
  data: T;
}

export interface TravelokaOAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface TravelokaDateTime {
  specificDate: {
    monthDayYear: {
      month: number | string;
      day: number | string;
      year: number | string;
    };
    hourMinute: {
      hour: number | string;
      minute: number | string;
    };
  };
  timeZoneId: string;
}

export interface TravelokaCurrencyValue {
  currencyValue: {
    currency: string;
    amount: number | string;
    nullOrEmpty: boolean;
  };
  numOfDecimalPoint: number | string;
}

export interface TravelokaGeoPoint {
  longitude: string | number | null;
  latitude: string | number | null;
}

// ─────────────────────────────────────────────
// Cities & Route Points
// ─────────────────────────────────────────────

export interface TravelokaCitiesResponse {
  responseStatus: string;
  responseMessage: string | null;
  cities: TravelokaCity[];
  hasNextPage: boolean;
}

export interface TravelokaCity {
  cityCode: string;
  cityName: string;
  countryCode: string;
}

export interface TravelokaRoutePointsResponse {
  responseStatus: string;
  responseMessage: string | null;
  routePoints: TravelokaRoutePoint[];
  hasNextPage: boolean;
}

export interface TravelokaRoutePoint {
  pointCode: string;
  pointName: string;
  cityCode: string;
  cityName: string;
  geoPoint: TravelokaGeoPoint | null;
}

export interface TravelokaDestinationPointsResponse {
  responseStatus: string;
  responseMessage: string | null;
  destinationPoints: TravelokaRoutePoint[];
}

export interface TravelokaOriginPointsResponse {
  responseStatus: string;
  responseMessage: string | null;
  originPoints: TravelokaRoutePoint[];
}

// ─────────────────────────────────────────────
// Schedules / Inventories
// ─────────────────────────────────────────────

export interface TravelokaScheduleRequest {
  originCode: string;
  destinationCode: string;
  departureDate: {
    month: number;
    day: number;
    year: number;
  };
  returnDate?: {
    month: number;
    day: number;
    year: number;
  };
  numOfAdults: number;
}

export interface TravelokaScheduleResponse {
  responseStatus: string;
  responseMessage: string | null;
  searchStatus: string; // AVAILABLE, UNAVAILABLE_SUGGEST_BY_CITY, UNAVAILABLE_NO_ALTERNATIVES
  departResult: TravelokaDepartResult;
  returnResult: TravelokaDepartResult | null;
  pollingData: {
    pollingStatus: string;
    pollingDelayMillis: string | null;
  };
}

export interface TravelokaDepartResult {
  inventories: TravelokaInventory[];
  otherRouteSuggestions: Array<{
    originCode: string;
    destinationCode: string;
  }>;
  departureCounter?: unknown[];
  destinationCounter?: unknown[];
}

export interface TravelokaInventory {
  routeSequence: string;
  status: string;
  originPointDetail: TravelokaPointDetail;
  destinationPointDetail: TravelokaPointDetail;
  providerId: string;
  providerCommercialName: string;
  routeId: string;
  skuId: string;
  oldFare: TravelokaFare | null;
  fare: TravelokaFare;
  duration: {
    hour: string | number;
    minute: string | number;
  };
  numOfSeatsAvailable: string | number;
  seatCapacity: string | number;
  seatLayout: string;
  seatClass: string;
  seatSubClass: string;
  busType: string;
  fleetName?: string;
  busTripCode: string;
  requiresPassengerIds: boolean;
  seatMapAvailable: boolean;
  shouldExchangeEticket: boolean;
  facilities?: string[];
  productType?: string;
  soldOut?: boolean;
}

export interface TravelokaPointDetail {
  pointCode: string;
  pointName: string;
  cityCode: string;
  cityName: string;
  geoPoint: TravelokaGeoPoint | null;
  localTime: TravelokaDateTime;
}

export interface TravelokaFare {
  currencyValue: {
    currency: string;
    amount: string | number;
    newAmount?: string;
    nullOrEmpty: boolean;
  };
  numOfDecimalPoint: string | number;
}

// ─────────────────────────────────────────────
// Seat Map
// ─────────────────────────────────────────────

export interface TravelokaSeatMapRequest {
  routeId: string;
  skuId: string;
  providerId: string;
  pickUpPointCode: string;
  dropOffPointCode: string;
  departureDateTime: TravelokaDateTime;
  arrivalDateTime: TravelokaDateTime;
  numOfAdults: number;
}

export interface TravelokaSeatMapResponse {
  responseStatus: string;
  responseMessage: string | null;
  status: string;
  wagons: TravelokaWagon[];
}

export interface TravelokaWagon {
  wagonId: string;
  wagonLabel: string;
  wagonGrids: TravelokaWagonGrid[][];
  idProduct?: string;
}

export interface TravelokaWagonGrid {
  gridType: string; // SEAT, TOILET, SMOKING_SPACE, DRIVER, EXIT, OTHER_LABEL, EMPTY, UPWARD_STAIRS, DOWNWARD_STAIRS
  gridStatus: string; // AVAILABLE, NOT_AVAILABLE_ANOTHER_SUBCLASS, NOT_AVAILABLE_TAKEN, NOT_APPLICABLE
  value: string | null; // seat number
}

// ─────────────────────────────────────────────
// Booking
// ─────────────────────────────────────────────

export interface TravelokaBookingRequest {
  bookingContact: TravelokaBookingContact;
  departBookings: TravelokaBooking[];
  returnBookings?: TravelokaBooking[];
}

export interface TravelokaBookingContact {
  salutation: string; // MR, MRS, MISS, OTHERS
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: {
    countryCode: string;
    phoneNumber: string;
  };
}

export interface TravelokaBooking {
  pickUpPointCode: string;
  dropOffPointCode: string;
  routeId: string;
  skuId: string;
  busTripCode: string;
  providerId: string;
  specificDepartDateTime: TravelokaDateTime;
  specificArrivalDateTime: TravelokaDateTime;
  seatClass: string;
  seatSubclass: string;
  adultPassengers: TravelokaPassenger[];
}

export interface TravelokaPassenger {
  salutation: string;
  firstName: string;
  lastName: string;
  wagonId: string;
  seatNumber: string;
  passengerIdentity: {
    idType: string; // KTP, SIM, PASSPORT, OTHERS
    value: string;
  };
}

export interface TravelokaBookingResponse {
  responseStatus: string; // OK, FAILED
  responseMessage: string | null;
  bookingStatus: string; // SUCCESS, FAILED_BOTH_SUBCLASSES_NOT_AVAILABLE, etc.
  travelokaBookingId: number | string;
  expirationTimestamp: number | string;
  totalFare: TravelokaCurrencyValue;
  departResults: TravelokaBookingResult[];
  returnResults: TravelokaBookingResult[];
  availablePaymentMethods: string[]; // CREDIT_CARD, NON_CREDIT_CARD
}

export interface TravelokaBookingResult {
  routeSequence: string;
  pnrCode: string;
  pnrStatus: string; // BOOKED, ISSUED, CANCELLED, FAILED
  originPointDetail: TravelokaBookingPointDetail;
  destinationPointDetail: TravelokaBookingPointDetail;
  tripDuration: {
    hour: number | string;
    minute: number | string;
  };
  charges: Array<{
    chargeType: string; // BASE_PRICE, SERVICE_FEE, DISCOUNT
    charge: TravelokaCurrencyValue;
  }>;
  adultPassengers: TravelokaBookingPassenger[];
  fare: TravelokaCurrencyValue;
}

export interface TravelokaBookingPointDetail {
  pointCode: string;
  pointName: string;
  cityCode: string;
  cityName: string;
  geoPoint: TravelokaGeoPoint | null;
  localTime: TravelokaDateTime;
}

export interface TravelokaBookingPassenger {
  salutation: string;
  firstName: string;
  lastName: string;
  wagonId: string;
  seatNumber: string;
  seatSelectionType: string; // AUTO, MANUAL
  passengerIdentity: {
    idType: string;
    value: string;
  };
  ticketNumber: string | null;
}

// ─────────────────────────────────────────────
// Check Booking
// ─────────────────────────────────────────────

export interface TravelokaCheckBookingResponse {
  responseStatus: string; // OK, FAILED
  responseMessage: string | null;
  travelokaBookingId: number | string;
  status: string; // BOOKED, ISSUED, CANCELLED, FAILED
  totalFare: TravelokaCurrencyValue;
  departResults: TravelokaBookingResult[];
  returnResults: TravelokaBookingResult[];
}

// ─────────────────────────────────────────────
// Issue Booking
// ─────────────────────────────────────────────

export interface TravelokaIssueBookingRequest {
  travelokaBookingId: number | string;
  paymentMethod: string; // CREDIT_CARD, NON_CREDIT_CARD
}

export interface TravelokaIssueBookingResponse {
  responseStatus: string; // OK, PAYMENT_CONFIRMED, FAILED, ALREADY_ISSUED, ALREADY_CANCELLED
  responseMessage: string | null;
  travelokaBookingId: number | string;
  status: string;
  departResults: TravelokaBookingResult[];
  returnResults: TravelokaBookingResult[];
}

// ─────────────────────────────────────────────
// Cancel Booking
// ─────────────────────────────────────────────

export interface TravelokaCancelBookingResponse {
  responseStatus: string; // OK, FAILED
  responseMessage: string | null;
  travelokaBookingId: number | string;
  status: string;
}
