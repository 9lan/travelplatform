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
  kode_kota: string;
  nama_kota: string;
  provinsi?: string;
}

// ─────────────────────────────────────────────
// Outlet
// ─────────────────────────────────────────────

export interface TiketuxOutlet {
  id: string;
  group: string;
  kode: string;
  nama: string;
  id_kota: string;
  nama_kota: string;
  alamat: string;
  latitude?: string;
  longitude?: string;
  telpon?: string;
  kode_kota: string;
  kota: string;
  flag_bandara: number; // boolean 0 | 1
  flag_agen: number; // boolean 0 | 1
  flag_aktif: number; // boolean 0 | 1
  flag_virtual_outlet: number; // boolean 0 | 1
  img: string;
  url_map: string;
  list_img: string[];
  tag: string;
  jarak: number;
}

// ─────────────────────────────────────────────
// Keberangkatan / Schedule
// ─────────────────────────────────────────────

export interface TiketuxSchedule {
  id_produk: string;
  kode_produk: string;
  rute: string;
  id_outlet_pickup: string;
  nama_outlet_pickup: string;
  alamat_outlet_pickup: string;
  maps_outlet_pickup: string;
  id_outlet_dropoff: string;
  nama_outlet_dropoff: string;
  alamat_outlet_dropoff: string;
  maps_outlet_dropoff: string;
  Via: string | null;
  estimasi_waktu_tempuh: number;
  estimasi_waktu_tempuh_menit: number;
  estimasi_waktu_tempuh_str: string;
  tgl_berangkat: string;
  tgl_berangkat_induk: string;
  jam_berangkat: string;
  tgl_sampai: string;
  jam_sampai: string;
  max_waktu_book: string;
  id_layanan: string;
  nama_layanan: string;
  tipe_kendaraan: string;
  tarif: number;
  range_tarif: string;
  min_tarif: number;
  max_tarif: number;
  range_tarif_disc: string;
  min_tarif_disc: number;
  max_tarif_disc: number;
  promo: string[];
  jumlah_kursi: number;
  sisa_kursi: number;
  kursi_terisi: number;
  keterangan: string;
  is_jadwal_dioperasikan: string;
  is_jadwal_lewat: number;
  show_btn_wa: number;
  is_waktu_verify: number;
  is_waktu_verify_maskapai: number;
  is_pilih_kursi: number;
  show_area_antar_jemput: number;
  is_transit: number;
  list_transit?: TiketuxScheduleListTransit[];
  is_connecting: number;
  list_connecting?: TiketuxScheduleListConnecting[];
  list_transit_connecting?: TiketuxScheduleListTransitConnecting[];
  harga_pengguna_baru?: TiketuxScheduleHargaPenggunaBaru;
  potongan_pengguna_baru?: TiketuxSchedulePotonganPenggunaBaru;
  poin_didapat: number;
  daftar_layanan: string[];
  daftar_layanan_connecting?: Record<string, string>;
  list_fasilitas: string[];
  is_mutasi: number;
  show_flexi_mutasi: number;
  is_flexi_mutasi: number;
  biaya_addon_mutasi: number;
  data_flexi_mutasi?: TiketuxScheduleDataFlexiMutasi;
  cashback?: string[];
}

export interface TiketuxScheduleListTransit {
  nama: string;
  ewt_menit: number;
  jam: string;
}

export interface TiketuxScheduleListConnecting {
  tgl_berangkat: string;
  jam_berangkat: string;
  id_produk: string;
  kode_produk: string;
  id_outlet_pickup: string;
  nama_outlet_pickup: string;
  kota_outlet_pickup: string;
  id_outlet_dropoff: string;
  nama_outlet_dropoff: string;
  kota_outlet_dropoff: string;
  ewt_connecting: number;
  tarif: number;
  min_tarif: number;
  max_tarif: number;
  waktu_tunggu: number;
  tgl_sampai: string;
  jam_sampai: string;
}

export interface TiketuxScheduleListTransitConnecting {
  tgl_berangkat: string;
  jam_berangkat: string;
  id_produk: string;
  kode_produk: string;
  id_outlet_pickup: string;
  nama_outlet_pickup: string;
  alamat_outlet_pickup: string;
  maps_outlet_pickup: string;
  id_outlet_dropoff: string;
  nama_outlet_dropoff: string;
  alamat_outlet_dropoff: string;
  ewt_connecting: number;
  waktu_tunggu: number;
  jenis_titik: string;
}

export interface TiketuxScheduleHargaPenggunaBaru {
  web: number;
  android: number;
  ios: number;
}

export interface TiketuxSchedulePotonganPenggunaBaru {
  web: number;
  android: number;
  ios: number;
}

export interface TiketuxScheduleDataFlexiMutasi {
  is_wajib_flexi: number;
  biaya_flexi: number;
  max_waktu_mutasi: number;
}

export interface TiketuxScheduleResponse {
  produk: TiketuxSchedule[];
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
