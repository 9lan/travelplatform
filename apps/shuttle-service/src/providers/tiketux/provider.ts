/**
 * Tiketux Shuttle Provider
 *
 * Implementation of IShuttleProvider for Tiketux API
 */

import {
  type IShuttleProvider,
  type ShuttleProviderConfig,
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
import { TiketuxClient } from './client.js';
import type {
  TiketuxCity,
  TiketuxOutlet,
  TiketuxScheduleResponse,
  TiketuxSeatResponse,
  TiketuxPriceResponse,
  TiketuxBookingResponse,
  TiketuxBookingDetail,
  TiketuxSeatPosition,
} from './types.js';

export class TiketuxProvider implements IShuttleProvider {
  readonly code = ProviderCode.TIKETUX;
  readonly name = 'Tiketux';

  private client: TiketuxClient;

  constructor(config: ShuttleProviderConfig) {
    this.client = new TiketuxClient({
      baseUrl: config.baseUrl,
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
    const response = await this.client.post<{ kota: TiketuxCity[] }>('kota');
    const cities = response?.kota ?? [];

    return cities.map((city) => ({
      id: `TIKETUX_${city.kode_kota}`,
      name: city.nama_kota,
      ...(city.provinsi && { province: city.provinsi }),
      providerCode: ProviderCode.TIKETUX,
      providerCityId: city.kode_kota,
    }));
  }

  async getOriginOutlets(cityId?: string): Promise<ProviderOutlet[]> {
    const params: Record<string, string | undefined> = {};
    if (cityId) {
      // Extract Tiketux city ID if prefixed
      const tiketuxCityId = cityId.replace('TIKETUX_', '');
      params['kota'] = tiketuxCityId;
    }

    const response = await this.client.post<{ outlet: TiketuxOutlet[]; kota: TiketuxCity[]; outlet_terdekat: TiketuxOutlet[] }>('outletasal', params);
    const outlets = response?.outlet ?? [];

    return outlets.map((outlet) => this.mapOutlet(outlet));
  }

  async getDestinationOutlets(originOutletId: string): Promise<ProviderOutlet[]> {
    const tiketuxOutletId = originOutletId.replace('TIKETUX_', '');

    const outlets = await this.client.post<TiketuxOutlet[]>('outlettujuan', {
      outletasal: tiketuxOutletId,
    });

    return outlets.map((outlet) => this.mapOutlet(outlet));
  }

  private mapOutlet(outlet: TiketuxOutlet): ProviderOutlet {
    return {
      id: `TIKETUX_${outlet.id}`,
      code: outlet.kode,
      name: outlet.nama,
      cityId: `TIKETUX_${outlet.kode_kota}`,
      cityName: outlet.kota || outlet.nama_kota || outlet.kode_kota,
      address: outlet.alamat,
      ...(outlet.latitude && { latitude: parseFloat(outlet.latitude) }),
      ...(outlet.longitude && { longitude: parseFloat(outlet.longitude) }),
      ...(outlet.telpon && { phone: outlet.telpon }),
      providerCode: ProviderCode.TIKETUX,
      providerOutletId: outlet.id,
    };
  }

  // ─────────────────────────────────────────────
  // Schedule & Seats
  // ─────────────────────────────────────────────

  async searchSchedules(params: SearchScheduleParams): Promise<ProviderSchedule[]> {
    // Parse date from YYYY-MM-DD format
    const dateParts = params.departureDate.split('-');
    const day = dateParts[2];
    const month = dateParts[1]
    const year = dateParts[0]
    
    const originId = params.originOutletId?.replace('TIKETUX_', '') ?? '';
    const destId = params.destinationOutletId?.replace('TIKETUX_', '') ?? '';

    const response = await this.client.post<TiketuxScheduleResponse>('keberangkatanoptimize', {
      tglberangkat: `${day}-${month}-${year}`,
      outletasal: originId,
      outlettujuan: destId,
      jumlahpenumpang: params.passengerCount?.toString(),
      ispp: params.isRoundTrip ? '1' : '0',
      ...(params.returnDate && {tglberangkatpp: params.returnDate})
    });

    // const origin = this.mapOutlet(response.outletasal);
    // const destination = this.mapOutlet(response.outlettujuan);

    return response.produk.map((schedule) => {
      // Parse departure time
      const [hours, minutes] = schedule.jam_berangkat.split(':').map(Number);
      const departureDate = this.parseTiketuxDate(params.departureDate);
      departureDate.setHours(hours ?? 0, minutes ?? 0, 0, 0);

      // Parse arrival time if available
      let arrivalTime: Date | null = null;
      if (schedule.jam_sampai) {
        const [arrHours, arrMinutes] = schedule.jam_sampai.split(':').map(Number);
        arrivalTime = new Date(departureDate);
        arrivalTime.setHours(arrHours ?? 0, arrMinutes ?? 0, 0, 0);
        // If arrival is before departure, it's next day
        if (arrivalTime < departureDate) {
          arrivalTime.setDate(arrivalTime.getDate() + 1);
        }
      }

      return {
        id: `tiketux_schedule_${schedule.id_produk}`,
        providerCode: ProviderCode.TIKETUX,
        providerScheduleId: schedule.id_produk,
        origin: {
          id: params.originOutletId ?? `TIKETUX_${schedule.id_outlet_pickup}`,
          code: schedule.id_outlet_pickup,
          name: schedule.nama_outlet_pickup,
          cityId: `TIKETUX_${schedule.id_outlet_pickup}`,
          cityName: schedule.nama_outlet_pickup,
          address: schedule.alamat_outlet_pickup,
          providerCode: ProviderCode.TIKETUX,
          providerOutletId: schedule.id_outlet_pickup,
        },
        destination: {
          id: params.destinationOutletId ?? `TIKETUX_${schedule.id_outlet_dropoff}`,
          code: schedule.id_outlet_dropoff,
          name: schedule.nama_outlet_dropoff,
          cityId: `TIKETUX_${schedule.id_outlet_dropoff}`,
          cityName: schedule.nama_outlet_dropoff,
          address: schedule.alamat_outlet_dropoff,
          providerCode: ProviderCode.TIKETUX,
          providerOutletId: schedule.id_outlet_dropoff,
        },
        departureTime: departureDate,
        ...(arrivalTime && { arrivalTime }),
        vehicleType: schedule.tipe_kendaraan,
        serviceClass: schedule.nama_layanan,
        availableSeats: schedule.sisa_kursi,
        totalSeats: schedule.jumlah_kursi,
        basePrice: schedule.max_tarif ?? schedule.tarif,
        promoPrice: schedule.min_tarif,
        currency: 'IDR',
        ...(schedule.list_fasilitas && { amenities: schedule.list_fasilitas }),
      };
    });
  }

  async getSeatLayout(
    scheduleId: string,
    departureDate: string,
    originOutletId: string,
    destinationOutletId: string
  ): Promise<ProviderSeatLayout> {
    const productId = scheduleId.replace('tiketux_schedule_', '');
    const originId = originOutletId.replace('TIKETUX_', '');
    const destId = destinationOutletId.replace('TIKETUX_', '');

    const response = await this.client.post<TiketuxSeatResponse>('kursi', {
      idproduk: productId,
      tglberangkat: departureDate,
      outletasal: originId,
      outlettujuan: destId,
    });

    const seats: ProviderSeat[] = [];
    const rows = parseInt(response.baris, 10);
    const columns = parseInt(response.kolom, 10);

    // Parse seat layout from detaildek
    if (response.detaildek && response.detaildek.length > 0) {
      const deck = response.detaildek[0];
      if (deck?.layout) {
        for (const [position, seatData] of Object.entries(deck.layout)) {
          const [rowStr, colStr] = position.split('_');
          const row = parseInt(rowStr ?? '0', 10);
          const col = parseInt(colStr ?? '0', 10);

          // Skip empty positions
          if (!seatData.label || seatData.label === '') {
            continue;
          }

          seats.push(this.mapSeat(seatData, row, col));
        }
      }
    }

    return {
      scheduleId,
      rows,
      columns,
      totalSeats: parseInt(response.kapasitas, 10),
      availableSeats: parseInt(response.sisa_kursi, 10),
      vehicleType: response.tipe_kendaraan,
      seats,
    };
  }

  private mapSeat(seat: TiketuxSeatPosition, row: number, col: number): ProviderSeat {
    return {
      id: `seat_${row}_${col}`,
      seatNumber: seat.label,
      row,
      column: col,
      status: this.mapSeatStatus(seat.status),
      type: seat.namalayanan ?? 'STANDARD',
      price: seat.hargatiket,
      ...(seat.namalayanan && { serviceName: seat.namalayanan }),
      ...(seat.asuransi !== undefined && { insurancePrice: seat.asuransi }),
    };
  }

  private mapSeatStatus(status: string): SeatAvailability {
    switch (status.toLowerCase()) {
      case 'p':
        return SeatAvailability.AVAILABLE;
      case 'x':
        return SeatAvailability.UNAVAILABLE;
      case 's':
        return SeatAvailability.SELECTED;
      case 'd':
        return SeatAvailability.SOLD;
      default:
        return SeatAvailability.UNAVAILABLE;
    }
  }

  async checkSeatAvailability(params: CheckSeatAvailabilityParams): Promise<boolean> {
    const productId = params.scheduleId.replace('tiketux_schedule_', '');
    const originId = params.originOutletId.replace('TIKETUX_', '');
    const destId = params.destinationOutletId.replace('TIKETUX_', '');

    try {
      await this.client.post('cek_ketersediaan_kursi', {
        idproduk: productId,
        tglberangkat: params.departureDate,
        idoutletpickup: originId,
        idoutletdropoff: destId,
        nomorkursi: params.seatNumbers.join(','),
      });
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────
  // Pricing
  // ─────────────────────────────────────────────

  async calculatePrice(params: CalculatePriceParams): Promise<ProviderPriceBreakdown> {
    const productId = params.scheduleId.replace('tiketux_schedule_', '');
    const originId = params.originOutletId.replace('TIKETUX_', '');
    const destId = params.destinationOutletId.replace('TIKETUX_', '');

    const requestBody = {
      telp_pemesan: params.bookerPhone ?? '',
      payment: 'paymentbydaytrans',
      is_asuransi: params.includeInsurance ? 1 : 0,
      is_pp: 0,
      is_connecting: 0,
      kode_voucher: params.voucherCode ?? '',
      keberangkatan: [
        {
          tgl_berangkat: params.departureDate,
          id_produk: productId,
          id_outlet_pickup: originId,
          id_outlet_dropoff: destId,
          kursi: params.seatNumbers.map((num) => ({ nomor_kursi: num })),
        },
      ],
    };

    const response = await this.client.post<TiketuxPriceResponse>(
      'reservasi/hitungtotal_new',
      requestBody as unknown as Record<string, string | number | undefined>,
      'json'
    );

    return {
      basePrice: response.total_harga_tiket,
      insurancePrice: response.biaya_asuransi ?? 0,
      serviceFee: response.biaya_admin ?? 0,
      discount: response.total_discount ?? 0,
      voucherDiscount: response.total_voucher ?? 0,
      totalPrice: response.total_bayar,
      currency: 'IDR',
      priceDetails: response.list_harga.map((item) => ({
        title: item.title,
        amount: item.value,
        type: item.type === '+' ? 'add' : item.type === '-' ? 'subtract' : 'base',
      })),
    };
  }

  // ─────────────────────────────────────────────
  // Booking
  // ─────────────────────────────────────────────

  async createBooking(request: ProviderBookingRequest): Promise<ProviderBooking> {
    const productId = request.scheduleId.replace('tiketux_schedule_', '');
    const originId = request.originOutletId.replace('TIKETUX_', '');
    const destId = request.destinationOutletId.replace('TIKETUX_', '');

    const passengerNames = request.passengers.map((p) => p.name).join(',');
    const seatNumbers = request.passengers.map((p) => p.seatNumber).join(',');

    const response = await this.client.post<TiketuxBookingResponse>('reservasi/booking', {
      tglberangkat: request.departureDate,
      tglberangkatinduk: request.departureDate,
      idproduk: productId,
      idoutletpickup: originId,
      idoutletdropoff: destId,
      jamberangkat: request.departureTime,
      telppemesan: request.bookerPhone,
      namapemesan: request.bookerName,
      alamatpemesan: request.bookerAddress ?? '-',
      emailpemesan: request.bookerEmail,
      namapenumpang: passengerNames,
      nomorkursi: seatNumbers,
      payment: request.paymentMethod,
      saleschannel: 'API',
      kodevoucher: request.voucherCode,
      isasuransi: request.includeInsurance ? '1' : '0',
      alamatjemput: request.pickupAddress,
      alamatantar: request.dropoffAddress,
    });

    // Get full booking details
    return this.getBookingDetail(response.kode_booking);
  }

  async getBookingDetail(bookingCode: string): Promise<ProviderBooking> {
    const response = await this.client.post<TiketuxBookingDetail>('reservasi/detail', {
      kodebooking: bookingCode,
    });

    return this.mapBookingDetail(response);
  }

  private mapBookingDetail(detail: TiketuxBookingDetail): ProviderBooking {
    const tickets: ProviderTicket[] = detail.detail_tiket.map((ticket) => ({
      ticketNumber: ticket.no_tiket,
      passengerName: ticket.nama,
      seatNumber: ticket.no_kursi,
      price: ticket.harga,
      insurancePrice: ticket.biaya_asuransi,
      discount: ticket.discount,
      totalPrice: ticket.harga_total,
      qrCode: ticket.qr_content,
      qrCodeUrl: ticket.url_img_qr,
      isCancelled: ticket.is_batal === 1,
      isBoarded: ticket.is_boarding === 1,
    }));

    return {
      id: `tiketux_booking_${detail.kode_booking}`,
      providerCode: ProviderCode.TIKETUX,
      providerBookingCode: detail.kode_booking,
      status: this.mapBookingStatus(detail.status, detail.status_trip),
      paymentStatus: this.mapPaymentStatus(detail.status, detail.is_lunas),
      bookerName: detail.nama_pemesan,
      bookerPhone: detail.telp_pemesan,
      bookerEmail: detail.email_pemesan,
      bookingTime: new Date(detail.waktu_pesan),
      paymentDeadline: new Date(detail.batas_pembayaran),
      totalPrice: detail.total_harga_tiket,
      discount: detail.total_discount,
      finalPrice: detail.total_bayar,
      currency: 'IDR',
      departureDate: new Date(detail.tgl_berangkat_pergi),
      departureTime: detail.jam_berangkat_pergi,
      origin: `${detail.outlet_asal_pergi}, ${detail.kota_asal_pergi}`,
      destination: `${detail.outlet_tujuan_pergi}, ${detail.kota_tujuan_pergi}`,
      tickets,
      ...(detail.url_etiket && { eTicketUrl: detail.url_etiket }),
    };
  }

  private mapBookingStatus(
    status: string,
    tripStatus: string
  ): BookingStatus {
    if (tripStatus === 'BATAL') {
      return BookingStatus.CANCELLED;
    }
    if (tripStatus === 'SELESAI') {
      return BookingStatus.COMPLETED;
    }

    switch (status) {
      case 'PAID':
        return BookingStatus.CONFIRMED;
      case 'PENDING':
      case 'UNPAID':
        return BookingStatus.PENDING;
      case 'CANCEL':
        return BookingStatus.CANCELLED;
      default:
        return BookingStatus.PENDING;
    }
  }

  private mapPaymentStatus(status: string, isLunas: number): PaymentStatus {
    if (isLunas === 1 || status === 'PAID') {
      return PaymentStatus.PAID;
    }
    if (status === 'CANCEL') {
      return PaymentStatus.FAILED;
    }
    return PaymentStatus.PENDING;
  }

  async confirmPayment(bookingCode: string, paidAt: Date): Promise<ProviderBooking> {
    const waktuLunas = this.formatDateTime(paidAt);

    await this.client.post('reservasi/paid', {
      kodebooking: bookingCode,
      waktulunas: waktuLunas,
    });

    return this.getBookingDetail(bookingCode);
  }

  async cancelBooking(bookingCode: string, _reason?: string): Promise<ProviderBooking> {
    // Tiketux may have a specific cancellation endpoint
    // For now, just get the current status
    return this.getBookingDetail(bookingCode);
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

  private parseTiketuxDate(dateStr: string): Date {
    // Format: YYYY-MM-DD
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year ?? 2024, (month ?? 1) - 1, day ?? 1);
  }

  private formatDateTime(date: Date): string {
    // Format: YYYY-MM-DD HH:MM:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
