/**
 * Tiketux API Response Types
 *
 * These types match the Tiketux API response structures
 */

// ─────────────────────────────────────────────
// City / Kota
// ─────────────────────────────────────────────

export interface TiketuxCity {
  id_kota: string;
  nama_kota: string;
  provinsi?: string;
}

// ─────────────────────────────────────────────
// Outlet
// ─────────────────────────────────────────────

export interface TiketuxOutlet {
  id_outlet: string;
  kode_outlet: string;
  nama_outlet: string;
  id_kota: string;
  nama_kota: string;
  alamat: string;
  latitude?: string;
  longitude?: string;
  telp?: string;
}

// ─────────────────────────────────────────────
// Keberangkatan / Schedule
// ─────────────────────────────────────────────

export interface TiketuxSchedule {
  id_produk: string;
  jam_berangkat: string;
  jam_tiba?: string;
  tipe_kendaraan: string;
  nama_kendaraan?: string;
  layanan?: string;
  sisa_kursi: number;
  kapasitas: number;
  harga: number;
  harga_promo?: number;
  is_promo?: boolean;
  fasilitas?: string[];
}

export interface TiketuxScheduleResponse {
  tanggal: string;
  outletasal: TiketuxOutlet;
  outlettujuan: TiketuxOutlet;
  keberangkatan: TiketuxSchedule[];
}

// ─────────────────────────────────────────────
// Kursi / Seat
// ─────────────────────────────────────────────

export interface TiketuxSeatPosition {
  label: string;
  status: string; // 'p' = available, 'x' = unavailable, 's' = selected, 'd' = sold
  hargatiket: number;
  namalayanan?: string;
  asuransi?: number;
  totalbayar?: number;
  kodepromo?: string;
  nominal?: number;
}

export interface TiketuxDeck {
  baris: string;
  kolom: string;
  kapasitas: number;
  sisakursi: number;
  layout: Record<string, TiketuxSeatPosition>;
}

export interface TiketuxSeatResponse {
  totalpenumpang: string;
  kapasitas: string;
  sisa_kursi: string;
  nomor_kursi_tersedia: string;
  metodepenjualan: string;
  tipe_kendaraan: string;
  id_layout: string;
  jam_berangkat: string;
  baris: string;
  kolom: string;
  detaildek: TiketuxDeck[];
  petalayout?: Record<string, TiketuxSeatPosition>;
}

// ─────────────────────────────────────────────
// Price Calculation
// ─────────────────────────────────────────────

export interface TiketuxPriceRequest {
  telp_pemesan: string;
  payment: string;
  is_asuransi: number;
  is_asuransi_cancellation?: number;
  is_asuransi_misconnecting?: number;
  kode_discount_addict?: string;
  discount_addict?: number;
  kode_discount_member?: string;
  discount_member?: number;
  kode_voucher?: string;
  kode_voucher_external?: string;
  discount_voucher_external?: number;
  is_pp: number;
  is_connecting: number;
  keberangkatan: TiketuxPriceDeparture[];
}

export interface TiketuxPriceDeparture {
  tgl_berangkat: string;
  id_produk: string;
  id_outlet_pickup: string;
  id_outlet_dropoff: string;
  kursi: { nomor_kursi: string }[];
}

export interface TiketuxPriceDetail {
  title: string;
  value: number;
  type: '' | '+' | '-';
}

export interface TiketuxPriceResponse {
  total_harga_tiket: number;
  biaya_asuransi: number;
  biaya_admin?: number;
  total_discount: number;
  total_voucher?: number;
  sub_total: number;
  total_bayar: number;
  list_harga: TiketuxPriceDetail[];
}

// ─────────────────────────────────────────────
// Booking
// ─────────────────────────────────────────────

export interface TiketuxBookingRequest {
  tglberangkat: string;
  tglberangkatinduk: string;
  idproduk: string;
  idoutletpickup: string;
  idoutletdropoff: string;
  jamberangkat: string;
  telppemesan: string;
  namapemesan: string;
  alamatpemesan: string;
  emailpemesan: string;
  namapenumpang: string;
  nomorkursi: string;
  payment: string;
  saleschannel: string;
  adminfee?: string;
  keterangan?: string;
  areajemput?: string;
  alamatjemput?: string;
  areaantar?: string;
  alamatantar?: string;
  kodevoucher?: string;
  isasuransi?: string;
}

export interface TiketuxBookingResponse {
  kode_booking: string;
  status: string;
  waktu_pesan: string;
  batas_pembayaran: string;
  total_bayar: number;
  url_payment?: string;
  url_etiket?: string;
}

// ─────────────────────────────────────────────
// Booking Detail
// ─────────────────────────────────────────────

export interface TiketuxTransit {
  tgl_berangkat: string;
  jam_berangkat: string;
  ewt: number;
  nama_outlet: string;
  alamat: string;
  latitude: string;
  longitude: string;
}

export interface TiketuxTicket {
  no_tiket: string;
  nama: string;
  no_kursi: string;
  harga: number;
  biaya_asuransi: number;
  discount: number;
  harga_total: number;
  qr_content: string;
  url_img_qr: string;
  is_batal: number;
  is_boarding: number;
  list_transit?: TiketuxTransit[];
}

export interface TiketuxBookingDetail {
  kode_booking: string;
  telp_pemesan: string;
  nama_pemesan: string;
  email_pemesan: string;
  alamat_pemesan?: string;
  waktu_pesan: string;
  jenis_pembayaran: string;
  batas_pembayaran: string;
  status: 'PAID' | 'PENDING' | 'UNPAID' | 'CANCEL';
  status_trip: 'MENDATANG' | 'SELESAI' | 'BATAL';
  is_lunas: number;
  total_harga_tiket: number;
  sub_total: number;
  total_discount: number;
  total_bayar: number;
  tgl_berangkat_pergi: string;
  jam_berangkat_pergi: string;
  rute_pergi: string;
  outlet_asal_pergi: string;
  outlet_tujuan_pergi: string;
  kota_asal_pergi: string;
  kota_tujuan_pergi: string;
  url_etiket?: string;
  detail_tiket: TiketuxTicket[];
  list_harga: TiketuxPriceDetail[];
}

// ─────────────────────────────────────────────
// Layanan / Service
// ─────────────────────────────────────────────

export interface TiketuxService {
  id_layanan: string;
  nama_layanan: string;
  keterangan?: string;
}
