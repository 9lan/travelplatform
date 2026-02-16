# Traveloka API Integration

## Overview

Traveloka is one of Southeast Asia's largest travel platforms, providing API access for bus and shuttle ticketing through their PAPI (Partner API). This document covers the integration implementation in TravelPlatform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GraphQL Gateway                             │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Shuttle Service                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   ProviderRegistry                        │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐  │   │
│  │  │TiketuxProv. │ │TravelokaProv.│ │  RedBusProvider   │  │   │
│  │  │             │ │              │ │    (Future)       │  │   │
│  │  └─────────────┘ └──────┬───────┘ └───────────────────┘  │   │
│  └─────────────────────────┼────────────────────────────────┘   │
│                            │                                     │
│  ┌─────────────────────────▼──────────────────────────────────┐ │
│  │                  TravelokaClient                            │ │
│  │  - OAuth Authentication (separate auth server)             │ │
│  │  - JSON API requests                                        │ │
│  │  - Error Handling                                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   ┌──────────────────┐            ┌──────────────────┐
   │  Traveloka Auth  │            │  Traveloka API   │
   │ auth-api.afc...  │            │ api-gtrafpa...   │
   └──────────────────┘            └──────────────────┘
```

## Configuration

### Environment Variables

```bash
# Required
TRAVELOKA_AUTH_URL=https://auth-api.afc.traveloka.com
TRAVELOKA_API_URL=https://api-gtrafpa.gtr.traveloka.com
TRAVELOKA_CLIENT_ID=your_client_id
TRAVELOKA_CLIENT_SECRET=your_client_secret

# Optional
TRAVELOKA_TIMEOUT=60000  # Request timeout in ms (default: 60000)
```

### Provider Registration

The Traveloka provider is automatically registered when both `TRAVELOKA_AUTH_URL` and `TRAVELOKA_API_URL` environment variables are set:

```typescript
// apps/shuttle-service/src/providers/registry.ts
{
  code: ProviderCode.TRAVELOKA,
  enabled: !!(process.env['TRAVELOKA_AUTH_URL'] && process.env['TRAVELOKA_API_URL']),
  authUrl: process.env['TRAVELOKA_AUTH_URL'] ?? '',
  apiUrl: process.env['TRAVELOKA_API_URL'] ?? '',
  clientId: process.env['TRAVELOKA_CLIENT_ID'] ?? '',
  clientSecret: process.env['TRAVELOKA_CLIENT_SECRET'] ?? '',
  timeout: 60000,
}
```

## API Endpoints

### Authentication

Traveloka uses OAuth 2.0 client credentials flow with a **separate auth server**:

```
POST {TRAVELOKA_AUTH_URL}/oauth/accesstoken
Content-Type: application/x-www-form-urlencoded

client_id={id}&client_secret={secret}
```

Response:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Get Cities

```
POST {TRAVELOKA_API_URL}/bus/get-cities
Authorization: Bearer {token}
Content-Type: application/json

{ "page": 1 }
```

Response:
```json
{
  "responseStatus": "OK",
  "responseMessage": null,
  "cities": [
    {
      "cityCode": "c48",
      "cityName": "Jakarta",
      "countryCode": "ID"
    }
  ],
  "hasNextPage": true
}
```

### Get Route Points (Outlets)

```
POST {TRAVELOKA_API_URL}/bus/get-route-points
Authorization: Bearer {token}
Content-Type: application/json

{ "page": 1 }
```

Response:
```json
{
  "responseStatus": "OK",
  "routePoints": [
    {
      "pointCode": "p1669",
      "pointName": "Terminal Pulogebang",
      "cityCode": "c48",
      "cityName": "Jakarta",
      "geoPoint": {
        "latitude": "-6.2088",
        "longitude": "106.8456"
      }
    }
  ],
  "hasNextPage": true
}
```

### Get Destination Points

```
POST {TRAVELOKA_API_URL}/bus/get-destination-points
Authorization: Bearer {token}
Content-Type: application/json

{ "originPointCode": "p1669" }
```

### Get Inventories (Schedule Search)

```
POST {TRAVELOKA_API_URL}/bus/get-inventories
Authorization: Bearer {token}
Content-Type: application/json

{
  "originCode": "c48",
  "destinationCode": "c103",
  "departureDate": {
    "month": 1,
    "day": 15,
    "year": 2025
  },
  "numOfAdults": 1
}
```

Response:
```json
{
  "responseStatus": "OK",
  "searchStatus": "AVAILABLE",
  "departResult": {
    "inventories": [
      {
        "routeId": "114059",
        "skuId": "8838",
        "providerId": "PTEKASARILORENA",
        "providerCommercialName": "LORENA",
        "status": "AVAILABLE",
        "originPointDetail": {
          "pointCode": "p2",
          "pointName": "Terminal Pulogebang",
          "cityCode": "c48",
          "cityName": "Jakarta",
          "localTime": {
            "specificDate": {
              "monthDayYear": { "month": 1, "day": 15, "year": 2025 },
              "hourMinute": { "hour": 13, "minute": 0 }
            },
            "timeZoneId": "Asia/Jakarta"
          }
        },
        "destinationPointDetail": { /* similar structure */ },
        "fare": {
          "currencyValue": {
            "currency": "IDR",
            "amount": "150000",
            "nullOrEmpty": false
          },
          "numOfDecimalPoint": "0"
        },
        "duration": { "hour": "8", "minute": "30" },
        "numOfSeatsAvailable": "15",
        "seatCapacity": "30",
        "seatClass": "Super Executive",
        "seatSubClass": "Penumpang",
        "busType": "BUS",
        "fleetName": "Lorena Premium",
        "busTripCode": "LS-420",
        "seatMapAvailable": true,
        "facilities": ["AC", "Toilet", "Reclining Seat", "Blanket"]
      }
    ]
  }
}
```

Search Status Values:
- `AVAILABLE` - Inventories found
- `UNAVAILABLE_SUGGEST_BY_CITY` - No direct, suggest city-to-city
- `UNAVAILABLE_SUGGEST_CONNECTING` - Suggest connecting routes
- `UNAVAILABLE_NO_ALTERNATIVES` - No options available

### Get Seat Map

```
POST {TRAVELOKA_API_URL}/bus/get-seat-map
Authorization: Bearer {token}
Content-Type: application/json

{
  "routeId": "114059",
  "skuId": "8838",
  "providerId": "PTEKASARILORENA",
  "pickUpPointCode": "p2",
  "dropOffPointCode": "p67",
  "departureDateTime": {
    "specificDate": {
      "monthDayYear": { "month": 1, "day": 15, "year": 2025 },
      "hourMinute": { "hour": 13, "minute": 0 }
    },
    "timeZoneId": "Asia/Jakarta"
  },
  "arrivalDateTime": { /* similar structure */ },
  "numOfAdults": 1
}
```

Response:
```json
{
  "responseStatus": "OK",
  "status": "SUCCESS",
  "wagons": [
    {
      "wagonId": "1",
      "wagonLabel": "Lower Deck",
      "wagonGrids": [
        [
          { "gridType": "DRIVER", "gridStatus": "NOT_APPLICABLE", "value": null },
          { "gridType": "EMPTY", "gridStatus": "NOT_APPLICABLE", "value": null },
          { "gridType": "EXIT", "gridStatus": "NOT_APPLICABLE", "value": null }
        ],
        [
          { "gridType": "SEAT", "gridStatus": "AVAILABLE", "value": "1A" },
          { "gridType": "EMPTY", "gridStatus": "NOT_APPLICABLE", "value": null },
          { "gridType": "SEAT", "gridStatus": "NOT_AVAILABLE_TAKEN", "value": "1B" }
        ]
      ]
    }
  ]
}
```

Grid Types:
- `SEAT` - Passenger seat
- `TOILET` - Toilet
- `SMOKING_SPACE` - Smoking area
- `DRIVER` - Driver seat
- `EXIT` - Exit/Door
- `OTHER_LABEL` - Other labeled area
- `EMPTY` - Empty space/aisle
- `UPWARD_STAIRS` - Stairs up (double decker)
- `DOWNWARD_STAIRS` - Stairs down

Grid Status (for SEAT type):
- `AVAILABLE` - Seat can be booked
- `NOT_AVAILABLE_ANOTHER_SUBCLASS` - Different seat class
- `NOT_AVAILABLE_TAKEN` - Already booked
- `NOT_APPLICABLE` - Non-seat grid types

### Create Booking

```
POST {TRAVELOKA_API_URL}/bus/booking
Authorization: Bearer {token}
Content-Type: application/json

{
  "bookingContact": {
    "salutation": "MR",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@email.com",
    "phoneNumber": {
      "countryCode": "62",
      "phoneNumber": "81234567890"
    }
  },
  "departBookings": [
    {
      "pickUpPointCode": "p2",
      "dropOffPointCode": "p67",
      "routeId": "114059",
      "skuId": "8838",
      "busTripCode": "LS-420",
      "providerId": "PTEKASARILORENA",
      "specificDepartDateTime": { /* TravelokaDateTime */ },
      "specificArrivalDateTime": { /* TravelokaDateTime */ },
      "seatClass": "Super Executive",
      "seatSubclass": "Penumpang",
      "adultPassengers": [
        {
          "salutation": "MR",
          "firstName": "John",
          "lastName": "Doe",
          "wagonId": "1",
          "seatNumber": "2F",
          "passengerIdentity": {
            "idType": "KTP",
            "value": "1234567890123456"
          }
        }
      ]
    }
  ]
}
```

Response:
```json
{
  "responseStatus": "OK",
  "bookingStatus": "SUCCESS",
  "travelokaBookingId": 1184826609,
  "expirationTimestamp": 1705312800000,
  "totalFare": {
    "currencyValue": {
      "currency": "IDR",
      "amount": 150000
    },
    "numOfDecimalPoint": 0
  },
  "departResults": [
    {
      "routeSequence": "DEPART",
      "pnrCode": "ABC123",
      "pnrStatus": "BOOKED",
      "adultPassengers": [
        {
          "firstName": "John",
          "lastName": "Doe",
          "seatNumber": "2F",
          "ticketNumber": null
        }
      ]
    }
  ],
  "availablePaymentMethods": ["CREDIT_CARD", "NON_CREDIT_CARD"]
}
```

Booking Status Values:
- `SUCCESS` - Booking created
- `FAILED_BOTH_SUBCLASSES_NOT_AVAILABLE`
- `FAILED_DEPART_SUBCLASS_NOT_AVAILABLE`
- `FAILED_RETURN_SUBCLASS_NOT_AVAILABLE`
- `FAILED_ROUTED_OFF`
- `FAILED_BLOCKED`
- `UNKNOWN_FAILURE`

### Check Booking Status

```
POST {TRAVELOKA_API_URL}/bus/check-booking
Authorization: Bearer {token}
Content-Type: application/json

{ "travelokaBookingId": 1184826609 }
```

Response includes booking status:
- `BOOKED` - Confirmed but not paid
- `ISSUED` - Paid and ticket issued
- `CANCELLED` - Booking cancelled/expired
- `FAILED` - System error

### Issue Booking (Payment Confirmation)

```
POST {TRAVELOKA_API_URL}/bus/issue-booking
Authorization: Bearer {token}
Content-Type: application/json

{
  "travelokaBookingId": 1184826609,
  "paymentMethod": "NON_CREDIT_CARD"
}
```

Issue Status Values:
- `OK` - Successfully issued
- `PAYMENT_CONFIRMED` - Payment received, issuing in progress
- `FAILED` - Issue failed
- `ALREADY_ISSUED` - Already issued
- `ALREADY_CANCELLED` - Booking was cancelled
- `INVALID_AFFILIATE` - Not your booking
- `BOOKING_NOT_FOUND` - Booking doesn't exist

### Cancel Booking

```
POST {TRAVELOKA_API_URL}/bus/cancel-booking
Authorization: Bearer {token}
Content-Type: application/json

{ "travelokaBookingId": 1184826609 }
```

## Data Mapping

### DateTime Format

Traveloka uses a complex nested datetime structure:
```typescript
interface TravelokaDateTime {
  specificDate: {
    monthDayYear: {
      month: number;  // 1-12
      day: number;    // 1-31
      year: number;   // Full year (2025)
    };
    hourMinute: {
      hour: number;   // 0-23
      minute: number; // 0-59
    };
  };
  timeZoneId: string; // e.g., "Asia/Jakarta"
}
```

### Provider Types → GraphQL Types

| Traveloka Field | Provider Type | GraphQL Type |
|-----------------|---------------|--------------|
| `cityCode` | `ProviderCity.id` | `String!` |
| `cityName` | `ProviderCity.name` | `String!` |
| `pointCode` | `ProviderOutlet.id` | `String!` |
| `pointName` | `ProviderOutlet.name` | `String!` |
| `skuId` | `ProviderSchedule.id` | `String!` |
| `localTime` | `ProviderSchedule.departureTime` | `DateTime!` |
| `numOfSeatsAvailable` | `ProviderSchedule.availableSeats` | `Int!` |
| `fare.currencyValue.amount` | `ProviderSchedule.basePrice` | `Float!` |

### Seat Status Mapping

| Traveloka Status | Provider Status |
|------------------|-----------------|
| `AVAILABLE` | `AVAILABLE` |
| `NOT_AVAILABLE_TAKEN` | `SOLD` |
| `NOT_AVAILABLE_ANOTHER_SUBCLASS` | `UNAVAILABLE` |
| `NOT_APPLICABLE` | (skip) |

### Booking Status Mapping

| Traveloka Status | Provider BookingStatus |
|------------------|------------------------|
| `BOOKED` | `PENDING` |
| `ISSUED` | `CONFIRMED` |
| `CANCELLED` | `CANCELLED` |
| `FAILED` | `CANCELLED` |

## Error Handling

### Error Response Format

```json
{
  "responseStatus": "FAILED",
  "responseMessage": "Invalid credentials"
}
```

### Retry Logic

The client implements automatic retry for transient errors:
- Connection timeouts: 3 retries with exponential backoff
- 5xx server errors: 2 retries
- 401 Unauthorized: Re-authenticate and retry once

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

### Query Cities from Traveloka

```graphql
query {
  providerCities(providerCode: TRAVELOKA) {
    id
    name
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
    amenities
    origin {
      id
      name
      cityName
    }
    destination {
      id
      name
      cityName
    }
    providerCode
  }
}
```

Variables:
```json
{
  "input": {
    "providerCode": "TRAVELOKA",
    "originOutletId": "traveloka_outlet_p1669",
    "destinationOutletId": "traveloka_outlet_p67",
    "departureDate": "15-01-2025"
  }
}
```

## File Structure

```
apps/shuttle-service/src/providers/
├── index.ts                  # Main exports
├── types.ts                  # IShuttleProvider interface & common types
├── registry.ts               # ProviderRegistry (factory & aggregation)
├── tiketux/                  # Tiketux provider
└── traveloka/
    ├── index.ts              # Traveloka exports
    ├── client.ts             # TravelokaClient (HTTP + OAuth)
    ├── provider.ts           # TravelokaProvider (IShuttleProvider impl)
    └── types.ts              # Traveloka API response types
```

## Testing

### Manual Testing

1. Set environment variables in `.env`:
```bash
TRAVELOKA_AUTH_URL=https://auth-api.afc.traveloka.com
TRAVELOKA_API_URL=https://api-gtrafpa.gtr.traveloka.com
TRAVELOKA_CLIENT_ID=your_client_id
TRAVELOKA_CLIENT_SECRET=your_client_secret
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

## Important Notes

### Booking Flow

1. Search inventories → Select schedule
2. Get seat map → Select seats
3. Create booking → Receive `travelokaBookingId`
4. Customer pays through your payment system
5. Call `issue-booking` to confirm payment
6. Ticket is issued with `ticketNumber`

### Constraints

- Maximum 4 passengers per booking
- Minimum phone number length: 10 digits
- Name length: 2-20 characters each for firstName/lastName
- No special characters in passenger names
- Passengers ≥2 years must have a ticket

### Double Decker Buses

- Multiple wagons in seat map response
- `wagonLabel` indicates "Lower Deck" or "Upper Deck"
- Use `UPWARD_STAIRS`/`DOWNWARD_STAIRS` grid types

## Future Considerations

1. **Caching**: Cache cities and route points (rarely change)
2. **Rate Limiting**: Implement rate limiting for API calls
3. **Price Validation**: Always verify price in booking response
4. **Timeout Handling**: Use check-booking API if booking times out
5. **Webhook Integration**: Handle booking status updates
