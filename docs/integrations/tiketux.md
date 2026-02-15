# Tiketux API Integration

## Overview

Tiketux is a shuttle/bus ticketing platform that provides API access for searching schedules, checking seat availability, and creating bookings. This document covers the integration implementation in TravelPlatform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GraphQL Gateway                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Shuttle Service                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   ProviderRegistry                        │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │TiketuxProv. │ │TravelokaPro│ │   RedBusProvider    │ │   │
│  │  │             │ │ (Future)   │ │      (Future)       │ │   │
│  │  └──────┬──────┘ └─────────────┘ └─────────────────────┘ │   │
│  └─────────┼────────────────────────────────────────────────┘   │
│            │                                                     │
│  ┌─────────▼──────────────────────────────────────────────────┐ │
│  │                    TiketuxClient                            │ │
│  │  - OAuth Authentication                                     │ │
│  │  - Request/Response Handling                                │ │
│  │  - Error Handling                                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │   Tiketux API    │
                   │ api.tiketux.com  │
                   └──────────────────┘
```

## Configuration

### Environment Variables

```bash
# Required
TIKETUX_BASE_URL=https://daytrans.asmat.app/api-whitelabel
TIKETUX_CLIENT_ID=your_client_id
TIKETUX_CLIENT_SECRET=your_client_secret

# Optional
TIKETUX_TIMEOUT=30000  # Request timeout in ms (default: 30000)
```

### Provider Registration

The Tiketux provider is automatically registered when the environment variables are set. The `ProviderRegistry` handles initialization:

```typescript
// apps/shuttle-service/src/providers/registry.ts
const configs: ProviderConfig[] = [
  {
    code: ProviderCode.TIKETUX,
    enabled: !!process.env['TIKETUX_BASE_URL'],
    baseUrl: process.env['TIKETUX_BASE_URL'] ?? '',
    clientId: process.env['TIKETUX_CLIENT_ID'] ?? '',
    clientSecret: process.env['TIKETUX_CLIENT_SECRET'] ?? '',
    timeout: 30000,
  },
];
```

## API Endpoints

### Authentication

Tiketux uses OAuth 2.0 client credentials flow:

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={id}&client_secret={secret}
```

Response:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Get Cities (Kota)

```
GET /api/kota
Authorization: Bearer {token}
```

Response:
```json
{
  "status": "success",
  "data": [
    {
      "id_kota": "1",
      "nama_kota": "Jakarta",
      "provinsi": "DKI Jakarta"
    }
  ]
}
```

### Get Origin Outlets

```
GET /api/outlet/asal?id_kota={cityId}
Authorization: Bearer {token}
```

Response:
```json
{
  "status": "success",
  "data": [
    {
      "id_outlet": "101",
      "kode_outlet": "JKT-01",
      "nama_outlet": "Jakarta Pusat",
      "id_kota": "1",
      "nama_kota": "Jakarta",
      "alamat": "Jl. Sudirman No. 1",
      "latitude": "-6.2088",
      "longitude": "106.8456"
    }
  ]
}
```

### Get Destination Outlets

```
GET /api/outlet/tujuan?id_outlet_asal={originOutletId}
Authorization: Bearer {token}
```

### Search Schedules (Keberangkatan)

```
GET /api/keberangkatan?id_outlet_asal={origin}&id_outlet_tujuan={dest}&tgl_berangkat={date}
Authorization: Bearer {token}
```

Response:
```json
{
  "status": "success",
  "data": {
    "tanggal": "2024-01-15",
    "outletasal": { /* outlet object */ },
    "outlettujuan": { /* outlet object */ },
    "keberangkatan": [
      {
        "id_produk": "P001",
        "jam_berangkat": "08:00",
        "jam_tiba": "12:00",
        "tipe_kendaraan": "HIACE",
        "nama_kendaraan": "Hiace Premium",
        "layanan": "Executive",
        "sisa_kursi": 8,
        "kapasitas": 14,
        "harga": 150000,
        "harga_promo": 120000,
        "is_promo": true,
        "fasilitas": ["AC", "USB Charger", "Reclining Seat"]
      }
    ]
  }
}
```

### Get Seat Layout (Kursi)

```
GET /api/kursi?id_produk={scheduleId}&tgl_berangkat={date}&id_outlet_pickup={origin}&id_outlet_dropoff={dest}
Authorization: Bearer {token}
```

Response:
```json
{
  "status": "success",
  "data": {
    "totalpenumpang": "6",
    "kapasitas": "14",
    "sisa_kursi": "8",
    "nomor_kursi_tersedia": "1,2,3,5,6,7,9,10",
    "metodepenjualan": "seat",
    "tipe_kendaraan": "HIACE",
    "baris": "4",
    "kolom": "4",
    "detaildek": [
      {
        "baris": "4",
        "kolom": "4",
        "kapasitas": 14,
        "sisakursi": 8,
        "layout": {
          "1A": { "label": "1A", "status": "p", "hargatiket": 150000 },
          "1B": { "label": "1B", "status": "d", "hargatiket": 150000 }
        }
      }
    ]
  }
}
```

Seat status codes:
- `p` = Available (purchasable)
- `x` = Unavailable
- `d` = Sold (terpesan)
- `s` = Selected

### Calculate Price (Hitung Harga)

```
POST /api/hitungharga
Authorization: Bearer {token}
Content-Type: application/json

{
  "telp_pemesan": "081234567890",
  "payment": "transfer",
  "is_asuransi": 0,
  "is_pp": 0,
  "is_connecting": 0,
  "keberangkatan": [
    {
      "tgl_berangkat": "2024-01-15",
      "id_produk": "P001",
      "id_outlet_pickup": "101",
      "id_outlet_dropoff": "201",
      "kursi": [{ "nomor_kursi": "1A" }, { "nomor_kursi": "1B" }]
    }
  ]
}
```

Response:
```json
{
  "status": "success",
  "data": {
    "total_harga_tiket": 300000,
    "biaya_asuransi": 0,
    "biaya_admin": 5000,
    "total_discount": 60000,
    "sub_total": 245000,
    "total_bayar": 245000,
    "list_harga": [
      { "title": "Tiket (2 kursi)", "value": 300000, "type": "" },
      { "title": "Diskon Promo", "value": 60000, "type": "-" },
      { "title": "Biaya Admin", "value": 5000, "type": "+" }
    ]
  }
}
```

### Create Booking

```
POST /api/booking
Authorization: Bearer {token}
Content-Type: application/json

{
  "tglberangkat": "2024-01-15",
  "tglberangkatinduk": "2024-01-15",
  "idproduk": "P001",
  "idoutletpickup": "101",
  "idoutletdropoff": "201",
  "jamberangkat": "08:00",
  "telppemesan": "081234567890",
  "namapemesan": "John Doe",
  "alamatpemesan": "Jakarta",
  "emailpemesan": "john@example.com",
  "namapenumpang": "John Doe|Jane Doe",
  "nomorkursi": "1A|1B",
  "payment": "transfer",
  "saleschannel": "API"
}
```

Response:
```json
{
  "status": "success",
  "data": {
    "kode_booking": "TKX2024011500001",
    "status": "PENDING",
    "waktu_pesan": "2024-01-14 10:00:00",
    "batas_pembayaran": "2024-01-14 11:00:00",
    "total_bayar": 245000,
    "url_payment": "https://pay.tiketux.com/...",
    "url_etiket": null
  }
}
```

### Get Booking Detail

```
GET /api/booking/{bookingCode}
Authorization: Bearer {token}
```

### Confirm Payment

```
POST /api/booking/{bookingCode}/confirm
Authorization: Bearer {token}
Content-Type: application/json

{
  "paid_at": "2024-01-14T10:30:00Z"
}
```

## Data Mapping

### Provider Types → GraphQL Types

| Tiketux Field | Provider Type | GraphQL Type |
|---------------|---------------|--------------|
| `id_kota` | `ProviderCity.id` | `String!` |
| `nama_kota` | `ProviderCity.name` | `String!` |
| `provinsi` | `ProviderCity.province` | `String` |
| `id_outlet` | `ProviderOutlet.id` | `String!` |
| `nama_outlet` | `ProviderOutlet.name` | `String!` |
| `id_produk` | `ProviderSchedule.id` | `String!` |
| `jam_berangkat` | `ProviderSchedule.departureTime` | `DateTime!` |
| `sisa_kursi` | `ProviderSchedule.availableSeats` | `Int!` |
| `harga` | `ProviderSchedule.basePrice` | `Float!` |

### Seat Status Mapping

| Tiketux Status | Provider Status |
|----------------|-----------------|
| `p` | `AVAILABLE` |
| `x` | `UNAVAILABLE` |
| `d` | `SOLD` |
| `s` | `SELECTED` |

## Error Handling

### Error Response Format

```json
{
  "status": "error",
  "message": "Authentication failed",
  "code": "AUTH_ERROR"
}
```

### Retry Logic

The client implements automatic retry for transient errors:
- Connection timeouts: 3 retries with exponential backoff
- 5xx server errors: 2 retries
- 401 Unauthorized: Re-authenticate and retry once

### Health Check

```
GET /api/health
Authorization: Bearer {token}
```

## GraphQL Queries

### Query Available Providers

```graphql
query {
  enabledProviders {
    code
    name
    isHealthy
  }
}
```

### Query Cities from Tiketux

```graphql
query {
  providerCities(providerCode: TIKETUX) {
    id
    name
    province
    providerCode
  }
}
```

### Search Schedules

```graphql
query SearchSchedules($input: ProviderScheduleSearchInput!) {
  providerSchedules(input: $input) {
    id
    departureTime
    arrivalTime
    vehicleType
    vehicleName
    availableSeats
    totalSeats
    basePrice
    promoPrice
    isPromo
    amenities
    origin {
      id
      name
      address
    }
    destination {
      id
      name
      address
    }
    providerCode
  }
}
```

Variables:
```json
{
  "input": {
    "providerCode": "TIKETUX",
    "originOutletId": "101",
    "destinationOutletId": "201",
    "departureDate": "2024-01-15"
  }
}
```

### Get Seat Layout

```graphql
query GetSeatLayout($input: ProviderSeatLayoutInput!) {
  providerSeatLayout(input: $input) {
    scheduleId
    vehicleType
    totalCapacity
    availableSeats
    availableSeatNumbers
    decks {
      rows
      columns
      capacity
      availableSeats
      seats {
        label
        status
        price
      }
    }
    providerCode
  }
}
```

## File Structure

```
apps/shuttle-service/src/providers/
├── index.ts                 # Main exports
├── types.ts                 # IShuttleProvider interface & common types
├── registry.ts              # ProviderRegistry (factory & aggregation)
└── tiketux/
    ├── index.ts             # Tiketux exports
    ├── client.ts            # TiketuxClient (HTTP + OAuth)
    ├── provider.ts          # TiketuxProvider (IShuttleProvider impl)
    └── types.ts             # Tiketux API response types
```

## Testing

### Manual Testing

1. Set environment variables in `.env`:
```bash
TIKETUX_BASE_URL=https://api.tiketux.com
TIKETUX_CLIENT_ID=your_client_id
TIKETUX_CLIENT_SECRET=your_client_secret
```

2. Start the service:
```bash
cd apps/shuttle-service
pnpm dev
```

3. Check provider health:
```bash
curl http://localhost:4001/health/providers
```

4. Query via GraphQL playground at `http://localhost:4001/graphql`

### Integration Tests

```typescript
// Example test
describe('TiketuxProvider', () => {
  it('should authenticate successfully', async () => {
    const provider = new TiketuxProvider({
      baseUrl: process.env.TIKETUX_BASE_URL!,
      clientId: process.env.TIKETUX_CLIENT_ID!,
      clientSecret: process.env.TIKETUX_CLIENT_SECRET!,
    });

    await provider.authenticate();
    expect(provider.isAuthenticated()).toBe(true);
  });
});
```

## Future Considerations

1. **Caching**: Implement Redis caching for cities and outlets (rarely change)
2. **Rate Limiting**: Add rate limiting to prevent API quota exhaustion
3. **Webhooks**: Implement webhook handlers for booking status updates
4. **Failover**: Add circuit breaker pattern for API failures
5. **Monitoring**: Add detailed logging and metrics for API calls
