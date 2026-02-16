/**
 * Traveloka Shuttle Provider
 *
 * Implementation of IShuttleProvider for Traveloka Bus/Shuttle PAPI
 */

import {
  type IShuttleProvider,
  type ProviderCity,
  type ProviderOutlet,
  type ProviderSchedule,
  type ProviderSeatLayout,
  type ProviderSeat,
  type ProviderPriceBreakdown,
  type ProviderBooking,
  type ProviderBookingRequest,
  type ProviderTicket,
  type SearchScheduleParams,
  type CheckSeatAvailabilityParams,
  type CalculatePriceParams,
  ProviderCode,
  SeatAvailability,
  BookingStatus,
  PaymentStatus,
} from '../types.js';
import { TravelokaClient, type TravelokaConfig } from './client.js';
import type {
  TravelokaCitiesResponse,
  TravelokaRoutePointsResponse,
  TravelokaDestinationPointsResponse,
  TravelokaScheduleResponse,
  TravelokaSeatMapResponse,
  TravelokaBookingResponse,
  TravelokaCheckBookingResponse,
  TravelokaIssueBookingResponse,
  TravelokaCancelBookingResponse,
  TravelokaDateTime,
  TravelokaInventory,
  TravelokaPointDetail,
  TravelokaWagon,
} from './types.js';

export class TravelokaProvider implements IShuttleProvider {
  readonly code = ProviderCode.TRAVELOKA;
  readonly name = 'Traveloka';

  private client: TravelokaClient;

  constructor(config: TravelokaConfig) {
    this.client = new TravelokaClient({
      authUrl: config.authUrl,
      apiUrl: config.apiUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      ...(config.timeout !== undefined && { timeout: config.timeout }),
    });
  }

  // ─────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────

  async authenticate(): Promise<void> {
    await this.client.authenticate();
  }

  isAuthenticated(): boolean {
    return this.client.isAuthenticated();
  }

  // ─────────────────────────────────────────────
  // Master Data
  // ─────────────────────────────────────────────

  async getCities(): Promise<ProviderCity[]> {
    const allCities: ProviderCity[] = [];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const response = await this.client.post<TravelokaCitiesResponse>('get-cities', { page });

      if (response.cityDetails) {
        const cities = response.cityDetails.map((city) => ({
          id: `TRAVELOKA_${city.cityCode}`,
          name: city.cityName,
          providerCode: ProviderCode.TRAVELOKA,
          providerCityId: city.cityCode,
        }));
        allCities.push(...cities);
      }

      hasNextPage = response.hasNextPage ?? false;
      page++;

      // Safety limit
      if (page > 100) break;
    }

    return allCities;
  }

  async getOriginOutlets(cityId?: string): Promise<ProviderOutlet[]> {
    // Traveloka uses route points, optionally filtered by destination
    const allOutlets: ProviderOutlet[] = [];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const response = await this.client.post<TravelokaRoutePointsResponse>('get-route-points', { page });

      if (response.routePointDetails) {
        const outlets = response.routePointDetails
          .filter((point) => {
            if (!cityId) return true;
            const travelokaCityCode = cityId.replace('TRAVELOKA_', '');
            return point.cityCode === travelokaCityCode;
          })
          .map((point) => this.mapRoutePointToOutlet(point));
        allOutlets.push(...outlets);
      }

      hasNextPage = response.hasNextPage ?? false;
      page++;

      if (page > 100) break;
    }

    return allOutlets;
  }

  async getDestinationOutlets(originOutletId: string): Promise<ProviderOutlet[]> {
    const originPointCode = originOutletId.replace('TRAVELOKA_', '');

    const response = await this.client.post<TravelokaDestinationPointsResponse>('get-destination-points', {
      originPointCode,
    });

    if (!response.destinationPoints) {
      return [];
    }

    return response.destinationPoints.map((point) => this.mapRoutePointToOutlet(point));
  }

  private mapRoutePointToOutlet(point: {
    pointCode: string;
    pointName: string;
    cityCode: string;
    cityName: string;
    geoPoint?: { latitude?: string | number | null; longitude?: string | number | null } | null;
  }): ProviderOutlet {
    return {
      id: `TRAVELOKA_${point.pointCode}`,
      code: point.pointCode,
      name: point.pointName,
      cityId: `TRAVELOKA_${point.cityCode}`,
      cityName: point.cityName,
      address: point.pointName, // Traveloka doesn't provide separate address
      ...(point.geoPoint?.latitude && { latitude: parseFloat(String(point.geoPoint.latitude)) }),
      ...(point.geoPoint?.longitude && { longitude: parseFloat(String(point.geoPoint.longitude)) }),
      providerCode: ProviderCode.TRAVELOKA,
      providerOutletId: point.pointCode,
    };
  }

  // ─────────────────────────────────────────────
  // Schedule & Seats
  // ─────────────────────────────────────────────

  async searchSchedules(params: SearchScheduleParams): Promise<ProviderSchedule[]> {
    // Parse date from YYYY-MM-DD format
    const dateParts = params.departureDate.split('-');
    const day = parseInt(dateParts[2] ?? '1', 10);
    const month = parseInt(dateParts[1] ?? '1', 10);
    const year = parseInt(dateParts[0] ?? '2024', 10);

    // Get origin/destination codes
    const originCode = params.originOutletId?.replace('TRAVELOKA_', '')
      ?? params.originCityId?.replace('TRAVELOKA_', '')
      ?? '';
    const destinationCode = params.destinationOutletId?.replace('TRAVELOKA_', '')
      ?? params.destinationCityId?.replace('TRAVELOKA_', '')
      ?? '';

    const response = await this.client.post<TravelokaScheduleResponse>('get-inventories', {
      originCode,
      destinationCode,
      departureDate: { month, day, year },
      numOfAdults: params.passengerCount ?? 1,
    });

    if (!response.departResult?.inventories) {
      return [];
    }

    return response.departResult.inventories
      .filter((inv) => inv.status === 'AVAILABLE' && !inv.soldOut)
      .map((inventory) => this.mapInventoryToSchedule(inventory));
  }

  private mapInventoryToSchedule(inventory: TravelokaInventory): ProviderSchedule {
    const origin = this.mapPointDetailToOutlet(inventory.originPointDetail);
    const destination = this.mapPointDetailToOutlet(inventory.destinationPointDetail);

    const departureTime = this.parseTravelokaDateTime(inventory.originPointDetail.localTime);
    const arrivalTime = this.parseTravelokaDateTime(inventory.destinationPointDetail.localTime);

    const basePrice = parseFloat(String(inventory.fare.currencyValue.amount));

    return {
      id: `traveloka_schedule_${inventory.routeId}_${inventory.skuId}`,
      providerCode: ProviderCode.TRAVELOKA,
      providerScheduleId: inventory.skuId,
      origin,
      destination,
      departureTime,
      ...(arrivalTime && { arrivalTime }),
      ...(inventory.busType && { vehicleType: inventory.busType }),
      ...(inventory.fleetName && { vehicleName: inventory.fleetName }),
      ...(inventory.seatClass && { serviceClass: inventory.seatClass }),
      availableSeats: parseInt(String(inventory.numOfSeatsAvailable), 10),
      totalSeats: parseInt(String(inventory.seatCapacity), 10),
      basePrice,
      currency: inventory.fare.currencyValue.currency || 'IDR',
      ...(inventory.facilities && { amenities: inventory.facilities }),
      // Store additional data for booking
      _routeId: inventory.routeId,
      _skuId: inventory.skuId,
      _providerId: inventory.providerId,
      _providerName: inventory.providerCommercialName,
      _busTripCode: inventory.busTripCode,
      _seatClass: inventory.seatClass,
      _seatSubClass: inventory.seatSubClass,
    } as ProviderSchedule & Record<string, unknown>;
  }

  private mapPointDetailToOutlet(point: TravelokaPointDetail): ProviderOutlet {
    return {
      id: `TRAVELOKA_${point.pointCode}`,
      code: point.pointCode,
      name: point.pointName,
      cityId: `TRAVELOKA_${point.cityCode}`,
      cityName: point.cityName,
      address: point.pointName,
      ...(point.geoPoint?.latitude && { latitude: parseFloat(String(point.geoPoint.latitude)) }),
      ...(point.geoPoint?.longitude && { longitude: parseFloat(String(point.geoPoint.longitude)) }),
      providerCode: ProviderCode.TRAVELOKA,
      providerOutletId: point.pointCode,
    };
  }

  async getSeatLayout(
    scheduleId: string,
    departureDate: string,
    originOutletId: string,
    destinationOutletId: string
  ): Promise<ProviderSeatLayout> {
    // Parse schedule ID to get routeId and skuId
    const idParts = scheduleId.replace('traveloka_schedule_', '').split('_');
    const routeId = idParts[0] ?? '';
    const skuId = idParts[1] ?? '';

    const pickUpPointCode = originOutletId.replace('TRAVELOKA_', '');
    const dropOffPointCode = destinationOutletId.replace('TRAVELOKA_', '');

    // Parse date
    const dateParts = departureDate.split('-');
    const day = parseInt(dateParts[0] ?? '1', 10);
    const month = parseInt(dateParts[1] ?? '1', 10);
    const year = parseInt(dateParts[2] ?? '2024', 10);

    // Note: This requires additional data from the schedule search
    // In a real implementation, you'd cache this data or fetch it again
    const response = await this.client.post<TravelokaSeatMapResponse>('get-seat-map', {
      routeId,
      skuId,
      providerId: '', // Would need to be passed or cached
      pickUpPointCode,
      dropOffPointCode,
      departureDateTime: {
        specificDate: {
          monthDayYear: { month, day, year },
          hourMinute: { hour: 0, minute: 0 }, // Would need actual time
        },
        timeZoneId: 'Asia/Jakarta',
      },
      arrivalDateTime: {
        specificDate: {
          monthDayYear: { month, day, year },
          hourMinute: { hour: 0, minute: 0 },
        },
        timeZoneId: 'Asia/Jakarta',
      },
      numOfAdults: 1,
    });

    const seats: ProviderSeat[] = [];
    let totalCapacity = 0;
    let availableSeats = 0;
    const availableSeatNumbers: string[] = [];

    if (response.wagons) {
      for (const wagon of response.wagons) {
        const wagonSeats = this.parseWagonSeats(wagon);
        seats.push(...wagonSeats.seats);
        totalCapacity += wagonSeats.total;
        availableSeats += wagonSeats.available;
        availableSeatNumbers.push(...wagonSeats.availableNumbers);
      }
    }

    return {
      scheduleId,
      rows: response.wagons?.[0]?.wagonGrids?.length ?? 0,
      columns: response.wagons?.[0]?.wagonGrids?.[0]?.length ?? 0,
      totalSeats: totalCapacity,
      availableSeats,
      vehicleType: 'BUS',
      seats,
    };
  }

  private parseWagonSeats(wagon: TravelokaWagon): {
    seats: ProviderSeat[];
    total: number;
    available: number;
    availableNumbers: string[];
  } {
    const seats: ProviderSeat[] = [];
    let total = 0;
    let available = 0;
    const availableNumbers: string[] = [];

    wagon.wagonGrids.forEach((row, rowIndex) => {
      row.forEach((grid, colIndex) => {
        if (grid.gridType === 'SEAT' && grid.value) {
          total++;
          const isAvailable = grid.gridStatus === 'AVAILABLE';
          if (isAvailable) {
            available++;
            availableNumbers.push(grid.value);
          }

          seats.push({
            id: `seat_${wagon.wagonId}_${rowIndex}_${colIndex}`,
            seatNumber: grid.value,
            row: rowIndex,
            column: colIndex,
            status: this.mapGridStatus(grid.gridStatus),
            type: 'STANDARD',
            price: 0, // Price not available in seat map
          });
        }
      });
    });

    return { seats, total, available, availableNumbers };
  }

  private mapGridStatus(status: string): SeatAvailability {
    switch (status) {
      case 'AVAILABLE':
        return SeatAvailability.AVAILABLE;
      case 'NOT_AVAILABLE_TAKEN':
        return SeatAvailability.SOLD;
      case 'NOT_AVAILABLE_ANOTHER_SUBCLASS':
        return SeatAvailability.UNAVAILABLE;
      default:
        return SeatAvailability.UNAVAILABLE;
    }
  }

  async checkSeatAvailability(params: CheckSeatAvailabilityParams): Promise<boolean> {
    try {
      const layout = await this.getSeatLayout(
        params.scheduleId,
        params.departureDate,
        params.originOutletId,
        params.destinationOutletId
      );

      const availableSet = new Set(
        layout.seats
          .filter((s) => s.status === SeatAvailability.AVAILABLE)
          .map((s) => s.seatNumber)
      );

      return params.seatNumbers.every((seat) => availableSet.has(seat));
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────
  // Pricing
  // ─────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/require-await
  async calculatePrice(params: CalculatePriceParams): Promise<ProviderPriceBreakdown> {
    // Traveloka doesn't have a separate price calculation endpoint
    // Price is calculated during booking
    // This is a simplified implementation
    const basePrice = params.seatNumbers.length * 100000; // Placeholder

    return {
      basePrice,
      insurancePrice: 0,
      serviceFee: 0,
      discount: 0,
      voucherDiscount: 0,
      totalPrice: basePrice,
      currency: 'IDR',
      priceDetails: [
        { title: 'Base Price', amount: basePrice, type: 'base' },
      ],
    };
  }

  // ─────────────────────────────────────────────
  // Booking
  // ─────────────────────────────────────────────

  async createBooking(request: ProviderBookingRequest): Promise<ProviderBooking> {
    // Parse dates
    const dateParts = request.departureDate.split('-');
    const day = parseInt(dateParts[0] ?? '1', 10);
    const month = parseInt(dateParts[1] ?? '1', 10);
    const year = parseInt(dateParts[2] ?? '2024', 10);

    const timeParts = request.departureTime.split(':');
    const hour = parseInt(timeParts[0] ?? '0', 10);
    const minute = parseInt(timeParts[1] ?? '0', 10);

    // Parse schedule ID
    const idParts = request.scheduleId.replace('traveloka_schedule_', '').split('_');
    const routeId = idParts[0] ?? '';
    const skuId = idParts[1] ?? '';

    const pickUpPointCode = request.originOutletId.replace('TRAVELOKA_', '');
    const dropOffPointCode = request.destinationOutletId.replace('TRAVELOKA_', '');

    // Split booker name
    const nameParts = request.bookerName.split(' ');
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    // Extract phone parts
    const phone = request.bookerPhone.replace(/^\+/, '');
    const countryCode = phone.startsWith('62') ? '62' : '62';
    const phoneNumber = phone.startsWith('62') ? phone.slice(2) : phone;

    const departDateTime: TravelokaDateTime = {
      specificDate: {
        monthDayYear: { month, day, year },
        hourMinute: { hour, minute },
      },
      timeZoneId: 'Asia/Jakarta',
    };

    const response = await this.client.post<TravelokaBookingResponse>('booking', {
      bookingContact: {
        salutation: 'MR',
        firstName,
        lastName,
        email: request.bookerEmail,
        phoneNumber: { countryCode, phoneNumber },
      },
      departBookings: [
        {
          pickUpPointCode,
          dropOffPointCode,
          routeId,
          skuId,
          busTripCode: '', // Would need to be passed
          providerId: '', // Would need to be passed
          specificDepartDateTime: departDateTime,
          specificArrivalDateTime: departDateTime, // Would need actual arrival
          seatClass: '',
          seatSubclass: '',
          adultPassengers: request.passengers.map((p) => {
            const pNameParts = p.name.split(' ');
            return {
              salutation: 'MR',
              firstName: pNameParts[0] ?? '',
              lastName: pNameParts.slice(1).join(' ') || (pNameParts[0] ?? ''),
              wagonId: '-',
              seatNumber: p.seatNumber,
              passengerIdentity: {
                idType: p.idType ?? 'KTP',
                value: p.idNumber ?? '',
              },
            };
          }),
        },
      ],
    });

    return this.mapBookingResponse(response, request);
  }

  private mapBookingResponse(
    response: TravelokaBookingResponse,
    request: ProviderBookingRequest
  ): ProviderBooking {
    const bookingId = String(response.travelokaBookingId);

    const tickets: ProviderTicket[] = [];
    if (response.departResults) {
      for (const result of response.departResults) {
        for (const passenger of result.adultPassengers) {
          tickets.push({
            ticketNumber: passenger.ticketNumber ?? '',
            passengerName: `${passenger.firstName} ${passenger.lastName}`,
            seatNumber: passenger.seatNumber,
            price: 0,
            insurancePrice: 0,
            discount: 0,
            totalPrice: 0,
            isCancelled: false,
            isBoarded: false,
          });
        }
      }
    }

    const totalPrice = response.totalFare?.currencyValue?.amount
      ? parseFloat(String(response.totalFare.currencyValue.amount))
      : 0;

    return {
      id: `traveloka_booking_${bookingId}`,
      providerCode: ProviderCode.TRAVELOKA,
      providerBookingCode: bookingId,
      status: this.mapBookingStatus(response.bookingStatus),
      paymentStatus: PaymentStatus.PENDING,
      bookerName: request.bookerName,
      bookerPhone: request.bookerPhone,
      bookerEmail: request.bookerEmail,
      bookingTime: new Date(),
      paymentDeadline: new Date(Number(response.expirationTimestamp)),
      totalPrice,
      discount: 0,
      finalPrice: totalPrice,
      currency: response.totalFare?.currencyValue?.currency || 'IDR',
      departureDate: this.parseDateString(request.departureDate),
      departureTime: request.departureTime,
      origin: request.originOutletId,
      destination: request.destinationOutletId,
      tickets,
    };
  }

  async getBookingDetail(bookingCode: string): Promise<ProviderBooking> {
    const travelokaBookingId = bookingCode.replace('traveloka_booking_', '');

    const response = await this.client.post<TravelokaCheckBookingResponse>('check-booking', {
      travelokaBookingId,
    });

    const tickets: ProviderTicket[] = [];
    let origin = '';
    let destination = '';
    let departureDate = new Date();
    let departureTime = '';

    if (response.departResults?.[0]) {
      const result = response.departResults[0];
      origin = result.originPointDetail?.pointName ?? '';
      destination = result.destinationPointDetail?.pointName ?? '';
      departureDate = this.parseTravelokaDateTime(result.originPointDetail?.localTime);
      departureTime = this.formatTime(departureDate);

      for (const passenger of result.adultPassengers) {
        tickets.push({
          ticketNumber: passenger.ticketNumber ?? '',
          passengerName: `${passenger.firstName} ${passenger.lastName}`,
          seatNumber: passenger.seatNumber,
          price: 0,
          insurancePrice: 0,
          discount: 0,
          totalPrice: 0,
          isCancelled: false,
          isBoarded: false,
        });
      }
    }

    const totalPrice = response.totalFare?.currencyValue?.amount
      ? parseFloat(String(response.totalFare.currencyValue.amount))
      : 0;

    return {
      id: `traveloka_booking_${travelokaBookingId}`,
      providerCode: ProviderCode.TRAVELOKA,
      providerBookingCode: travelokaBookingId,
      status: this.mapCheckBookingStatus(response.status),
      paymentStatus: this.mapPaymentStatus(response.status),
      bookerName: '',
      bookerPhone: '',
      bookerEmail: '',
      bookingTime: new Date(),
      totalPrice,
      discount: 0,
      finalPrice: totalPrice,
      currency: response.totalFare?.currencyValue?.currency || 'IDR',
      departureDate,
      departureTime,
      origin,
      destination,
      tickets,
    };
  }

  async confirmPayment(bookingCode: string, _paidAt: Date): Promise<ProviderBooking> {
    const travelokaBookingId = bookingCode.replace('traveloka_booking_', '');

    const response = await this.client.post<TravelokaIssueBookingResponse>('issue-booking', {
      travelokaBookingId,
      paymentMethod: 'NON_CREDIT_CARD',
    });

    // Get updated booking details
    return this.getBookingDetail(String(response.travelokaBookingId));
  }

  async cancelBooking(bookingCode: string, _reason?: string): Promise<ProviderBooking> {
    const travelokaBookingId = bookingCode.replace('traveloka_booking_', '');

    await this.client.post<TravelokaCancelBookingResponse>('cancel-booking', {
      travelokaBookingId: parseInt(travelokaBookingId, 10),
    });

    return this.getBookingDetail(travelokaBookingId);
  }

  // ─────────────────────────────────────────────
  // Health Check
  // ─────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    return this.client.healthCheck();
  }

  // ─────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────

  private parseTravelokaDateTime(dateTime?: TravelokaDateTime): Date {
    if (!dateTime?.specificDate) {
      return new Date();
    }

    const { monthDayYear, hourMinute } = dateTime.specificDate;
    const year = parseInt(String(monthDayYear.year), 10);
    const month = parseInt(String(monthDayYear.month), 10) - 1;
    const day = parseInt(String(monthDayYear.day), 10);
    const hour = parseInt(String(hourMinute?.hour ?? 0), 10);
    const minute = parseInt(String(hourMinute?.minute ?? 0), 10);

    return new Date(year, month, day, hour, minute);
  }

  private parseDateString(dateStr: string): Date {
    // Format: DD-MM-YYYY
    const parts = dateStr.split('-');
    const day = parseInt(parts[0] ?? '1', 10);
    const month = parseInt(parts[1] ?? '1', 10) - 1;
    const year = parseInt(parts[2] ?? '2024', 10);
    return new Date(year, month, day);
  }

  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private mapBookingStatus(status: string): BookingStatus {
    switch (status) {
      case 'SUCCESS':
        return BookingStatus.PENDING;
      case 'FAILED_BOTH_SUBCLASSES_NOT_AVAILABLE':
      case 'FAILED_DEPART_SUBCLASS_NOT_AVAILABLE':
      case 'FAILED_RETURN_SUBCLASS_NOT_AVAILABLE':
      case 'FAILED_ROUTED_OFF':
      case 'FAILED_BLOCKED':
      case 'UNKNOWN_FAILURE':
        return BookingStatus.CANCELLED;
      default:
        return BookingStatus.PENDING;
    }
  }

  private mapCheckBookingStatus(status: string): BookingStatus {
    switch (status) {
      case 'BOOKED':
        return BookingStatus.PENDING;
      case 'ISSUED':
        return BookingStatus.CONFIRMED;
      case 'CANCELLED':
        return BookingStatus.CANCELLED;
      case 'FAILED':
        return BookingStatus.CANCELLED;
      default:
        return BookingStatus.PENDING;
    }
  }

  private mapPaymentStatus(status: string): PaymentStatus {
    switch (status) {
      case 'ISSUED':
        return PaymentStatus.PAID;
      case 'CANCELLED':
      case 'FAILED':
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.PENDING;
    }
  }
}
