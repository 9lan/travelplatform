# TravelPlatform Tour & Xperience Architecture Design

**Date:** 2026-02-17
**Status:** Draft
**Author:** Architecture Team

---

## Executive Summary

This document defines the architecture for TravelPlatform's **Tour** (multi-day packages) and **Xperience** (instant voucher marketplace) verticals. The design extends the existing GraphQL Federation platform with 5 new services, supporting both B2C leisure travelers and Corporate/MICE clients.

### Key Decisions

| Aspect | Decision |
|--------|----------|
| Primary vertical | Tour first, Xperience follows |
| Business model | Hybrid (Aggregated + Direct Supply) |
| Direct supply components | Accommodation, Transport, Activities, Meals, Guides |
| Inventory model | Hybrid by component (allotment/real-time/on-request) |
| Booking flow | Two-phase (deposit → confirm within SLA → charge/refund) |
| Customer segments | B2C + Standard MICE (RFQ, quotations, 200 pax groups) |
| Vendor management | Self-service portal |
| Voucher strategy | Hybrid (master itinerary + component vouchers) |
| Payment | Deposit+balance, installments, MICE invoicing (IDR) |
| Discovery | Map-based itinerary builder |
| Tech stack | Existing + PostGIS + OpenSearch + S3 |

---

## Table of Contents

1. [Service Architecture](#1-service-architecture)
2. [Domain Model - Core Entities](#2-domain-model---core-entities)
3. [Domain Model - Inventory & Vendor](#3-domain-model---inventory--vendor)
4. [Domain Model - Corporate/MICE](#4-domain-model---corporatemice)
5. [Booking Lifecycle & State Machine](#5-booking-lifecycle--state-machine)
6. [Two-Phase Confirmation & Voucher Engine](#6-two-phase-confirmation--voucher-engine)
7. [API Strategy & GraphQL Schema](#7-api-strategy--graphql-schema)
8. [Search & Discovery Engine](#8-search--discovery-engine)
9. [Map-Based Itinerary Builder](#9-map-based-itinerary-builder)
10. [Payment & Invoicing](#10-payment--invoicing)
11. [Vendor Portal & Settlement](#11-vendor-portal--settlement)
12. [Infrastructure & Scalability](#12-infrastructure--scalability)
13. [Event-Driven Architecture & Analytics](#13-event-driven-architecture--analytics)
14. [Phased Execution Roadmap](#14-phased-execution-roadmap)
15. [Super App Strategy & Competitive Moat](#15-super-app-strategy--competitive-moat)

---

## 1. Service Architecture

### New Services

Adding **5 new services** to the existing 8-service federation:

```
Existing Services (extend as needed)
├── Gateway (:4000) ──────────── Entry point, auth, composition
├── Shuttle (:4001) ──────────── Reuse for transport component
├── Seat (:4002) ─────────────── Reuse for shuttle seat inventory
├── Pricing (:4003) ──────────── Extend for tour pricing rules
├── Booking (:4004) ──────────── Extend for tour bookings
├── Payment (:4005) ──────────── Extend for deposits/installments
├── Promo (:4006) ────────────── Reuse for tour promotions
└── Notification (:4007) ─────── Reuse for tour notifications

New Tour Services
├── Tour (:4010/5440) ─────────── Tour packages, itineraries, search
├── Inventory (:4011/5441) ────── Unified availability engine
├── Vendor (:4012/5442) ───────── Vendor portal, contracts, settlement
├── Component (:4013/5443) ────── Accommodation, activities, meals, guides
└── Corporate (:4014/5444) ────── MICE accounts, RFQ, quotations
```

### Service Responsibilities

| Service | Responsibility |
|---------|----------------|
| **Tour** | Tour packages (aggregated + custom), itinerary builder logic, search/discovery |
| **Inventory** | Unified availability across all component types, handles allotment vs on-request logic |
| **Vendor** | Vendor lifecycle, contracts, commission calculation, settlement |
| **Component** | Master data for accommodations, activities, meals, guides (the "catalog") |
| **Corporate** | Isolates MICE complexity from B2C flow |

---

## 2. Domain Model - Core Entities

### Tour Service (Package & Itinerary)

```prisma
model Tour {
  id            String       @id @default(cuid())
  code          String       @unique
  name          String
  slug          String       @unique
  type          TourType     // AGGREGATED | CUSTOM
  source        TourSource   // INTERNAL | KLOOK | VIATOR | LOCAL_OPERATOR
  providerId    String?
  providerRef   String?      // External reference if aggregated
  destinationId String
  duration      Json         // { days: Int, nights: Int }
  categories    String[]     // Beach, Cultural, Adventure
  themes        String[]     // Honeymoon, Family, Solo
  difficulty    Difficulty   // EASY | MODERATE | CHALLENGING
  minPax        Int
  maxPax        Int
  basePrice     Decimal
  currency      String       @default("IDR")
  status        TourStatus   // DRAFT | ACTIVE | SUSPENDED | ARCHIVED
  metadata      Json         // SEO, images, highlights
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  itinerary     Itinerary[]

  @@index([destinationId])
  @@index([status])
  @@index([type, source])
}

model Itinerary {
  id          String          @id @default(cuid())
  tourId      String
  tour        Tour            @relation(fields: [tourId], references: [id])
  dayNumber   Int
  title       String
  description String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  items       ItineraryItem[]

  @@unique([tourId, dayNumber])
}

model ItineraryItem {
  id            String        @id @default(cuid())
  itineraryId   String
  itinerary     Itinerary     @relation(fields: [itineraryId], references: [id])
  sequence      Int
  componentType ComponentType // ACCOMMODATION | TRANSPORT | ACTIVITY | MEAL | GUIDE
  componentId   String        // Reference to Component service
  startTime     String?       // HH:mm format
  endTime       String?
  isOptional    Boolean       @default(false)
  priceOverride Decimal?
  notes         String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@index([itineraryId])
  @@index([componentType, componentId])
}

enum TourType {
  AGGREGATED
  CUSTOM
}

enum TourSource {
  INTERNAL
  KLOOK
  VIATOR
  LOCAL_OPERATOR
}

enum Difficulty {
  EASY
  MODERATE
  CHALLENGING
}

enum TourStatus {
  DRAFT
  ACTIVE
  SUSPENDED
  ARCHIVED
}

enum ComponentType {
  ACCOMMODATION
  TRANSPORT
  ACTIVITY
  MEAL
  GUIDE
}
```

### Component Service (Catalog)

```prisma
model Accommodation {
  id          String             @id @default(cuid())
  vendorId    String
  name        String
  type        AccommodationType  // HOTEL | VILLA | HOMESTAY
  locationId  String
  address     String
  coordinates Json               // { lat: Float, lng: Float }
  starRating  Int?
  amenities   String[]
  images      Json[]
  status      ComponentStatus    @default(ACTIVE)
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  roomTypes   RoomType[]

  @@index([vendorId])
  @@index([locationId])
}

model RoomType {
  id              String        @id @default(cuid())
  accommodationId String
  accommodation   Accommodation @relation(fields: [accommodationId], references: [id])
  name            String
  capacity        Int
  baseRate        Decimal
  amenities       String[]
  images          Json[]
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([accommodationId])
}

model Activity {
  id               String           @id @default(cuid())
  vendorId         String
  name             String
  categoryId       String
  locationId       String
  coordinates      Json             // { lat: Float, lng: Float }
  meetingPoint     String?
  duration         Json             // { hours: Int, minutes: Int }
  difficulty       Difficulty       @default(EASY)
  inclusions       String[]
  exclusions       String[]
  minPax           Int              @default(1)
  maxPax           Int
  basePrice        Decimal
  availabilityType AvailabilityType // TIMESLOT | DAILY_QUOTA | ON_REQUEST
  operatingHours   Json?            // { slots: String[], daysOfWeek: Int[] }
  images           Json[]
  status           ComponentStatus  @default(ACTIVE)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([vendorId])
  @@index([categoryId])
  @@index([locationId])
}

model Meal {
  id             String          @id @default(cuid())
  vendorId       String
  name           String
  type           MealVenueType   // RESTAURANT | FOOD_TOUR | CATERING
  locationId     String
  cuisine        String[]
  dietaryOptions String[]
  mealType       MealType        // BREAKFAST | LUNCH | DINNER
  basePrice      Decimal
  menuOptions    Json[]
  images         Json[]
  status         ComponentStatus @default(ACTIVE)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@index([vendorId])
  @@index([locationId])
}

model Guide {
  id                   String          @id @default(cuid())
  vendorId             String
  name                 String
  languages            String[]
  certifications       String[]
  specialties          String[]
  dailyRate            Decimal
  locationIds          String[]
  calendarAvailability Json?           // Calendar-based availability
  images               Json[]
  status               ComponentStatus @default(ACTIVE)
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  @@index([vendorId])
}

model Location {
  id          String   @id @default(cuid())
  name        String
  destination String
  country     String
  coordinates Json     // { lat: Float, lng: Float }
  timezone    String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([destination])
}

model Category {
  id        String   @id @default(cuid())
  name      String   @unique
  slug      String   @unique
  icon      String?
  parentId  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([parentId])
}

enum AccommodationType {
  HOTEL
  VILLA
  HOMESTAY
}

enum AvailabilityType {
  TIMESLOT
  DAILY_QUOTA
  ON_REQUEST
}

enum MealVenueType {
  RESTAURANT
  FOOD_TOUR
  CATERING
}

enum MealType {
  BREAKFAST
  LUNCH
  DINNER
}

enum ComponentStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}
```

---

## 3. Domain Model - Inventory & Vendor

### Inventory Service

```prisma
model Allotment {
  id            String          @id @default(cuid())
  componentType ComponentType
  componentId   String
  vendorId      String
  date          DateTime        @db.Date
  totalUnits    Int
  bookedUnits   Int             @default(0)
  releaseDate   DateTime?       // When unsold returns to vendor
  cutoffHours   Int             @default(24) // Booking cutoff before date
  status        AllotmentStatus @default(ACTIVE)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  holds         InventoryHold[]

  @@unique([componentType, componentId, date])
  @@index([vendorId])
  @@index([date])
  @@index([status])
}

model InventoryHold {
  id           String      @id @default(cuid())
  allotmentId  String
  allotment    Allotment   @relation(fields: [allotmentId], references: [id])
  bookingId    String?
  sessionId    String
  units        Int
  expiresAt    DateTime
  status       HoldStatus  @default(HELD)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@index([allotmentId])
  @@index([sessionId])
  @@index([expiresAt])
  @@index([status])
}

model OnRequestBooking {
  id             String              @id @default(cuid())
  componentType  ComponentType
  componentId    String
  bookingId      String
  vendorId       String
  requestedDate  DateTime            @db.Date
  requestedUnits Int
  status         OnRequestStatus     @default(PENDING)
  slaDeadline    DateTime            // 4 hours from request
  vendorResponse String?
  respondedAt    DateTime?
  autoRejectAt   DateTime
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@index([vendorId])
  @@index([status])
  @@index([slaDeadline])
}

enum AllotmentStatus {
  ACTIVE
  RELEASED
  CLOSED
}

enum HoldStatus {
  HELD
  CONVERTED
  EXPIRED
  RELEASED
}

enum OnRequestStatus {
  PENDING
  CONFIRMED
  REJECTED
  EXPIRED
}
```

### Vendor Service

```prisma
model Vendor {
  id              String       @id @default(cuid())
  code            String       @unique
  name            String
  type            VendorType   // OPERATOR | HOTEL | ACTIVITY | GUIDE | RESTAURANT
  legalName       String
  taxId           String?
  businessLicense String?
  contactEmail    String
  contactPhone    String
  bankAccount     Json         // { bank, accountNumber, accountName }
  status          VendorStatus @default(PENDING)
  onboardedAt     DateTime?
  verifiedAt      DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  contracts       VendorContract[]
  settlements     VendorSettlement[]
  performance     VendorPerformance[]
  users           VendorUser[]

  @@index([status])
  @@index([type])
}

model VendorUser {
  id        String         @id @default(cuid())
  vendorId  String
  vendor    Vendor         @relation(fields: [vendorId], references: [id])
  email     String         @unique
  name      String
  role      VendorUserRole @default(STAFF)
  status    UserStatus     @default(ACTIVE)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@index([vendorId])
}

model VendorContract {
  id             String       @id @default(cuid())
  vendorId       String
  vendor         Vendor       @relation(fields: [vendorId], references: [id])
  contractType   ContractType // AGGREGATION | DIRECT_ALLOTMENT | ON_REQUEST
  commissionRate Decimal      // Platform commission %
  paymentTerms   PaymentTerms // NET_7 | NET_14 | NET_30
  validFrom      DateTime
  validTo        DateTime?
  autoRenew      Boolean      @default(true)
  documents      Json[]       // Contract PDFs in S3
  status         ContractStatus @default(ACTIVE)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([vendorId])
  @@index([status])
}

model VendorSettlement {
  id               String           @id @default(cuid())
  vendorId         String
  vendor           Vendor           @relation(fields: [vendorId], references: [id])
  periodStart      DateTime         @db.Date
  periodEnd        DateTime         @db.Date
  grossAmount      Decimal
  commissionAmount Decimal
  netAmount        Decimal
  bookingCount     Int
  cancelledAmount  Decimal          @default(0)
  status           SettlementStatus @default(PENDING)
  paidAt           DateTime?
  paymentRef       String?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@unique([vendorId, periodStart, periodEnd])
  @@index([status])
}

model VendorPerformance {
  id                String   @id @default(cuid())
  vendorId          String
  vendor            Vendor   @relation(fields: [vendorId], references: [id])
  period            DateTime @db.Date // First of month
  confirmationRate  Decimal  // % on-request confirmed
  avgResponseTime   Decimal  // Hours to confirm
  cancellationRate  Decimal
  avgRating         Decimal?
  reviewCount       Int      @default(0)
  slaBreaches       Int      @default(0)
  performanceScore  Int      // Computed 0-100
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([vendorId, period])
}

enum VendorType {
  OPERATOR
  HOTEL
  ACTIVITY
  GUIDE
  RESTAURANT
}

enum VendorStatus {
  PENDING
  ACTIVE
  SUSPENDED
  TERMINATED
}

enum VendorUserRole {
  ADMIN
  MANAGER
  STAFF
}

enum UserStatus {
  ACTIVE
  DISABLED
}

enum ContractType {
  AGGREGATION
  DIRECT_ALLOTMENT
  ON_REQUEST
}

enum PaymentTerms {
  NET_7
  NET_14
  NET_30
}

enum ContractStatus {
  DRAFT
  ACTIVE
  EXPIRED
  TERMINATED
}

enum SettlementStatus {
  PENDING
  APPROVED
  PAID
  DISPUTED
}
```

---

## 4. Domain Model - Corporate/MICE

### Corporate Service

```prisma
model Company {
  id              String        @id @default(cuid())
  code            String        @unique
  name            String
  legalName       String
  industry        String?
  size            CompanySize   // SME | ENTERPRISE | GOVERNMENT
  taxId           String?
  address         String
  billingAddress  String
  creditLimit     Decimal
  creditUsed      Decimal       @default(0)
  paymentTerms    PaymentTerms  @default(NET_30)
  status          CompanyStatus @default(PENDING)
  accountManagerId String?
  contractDocuments Json[]
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  users           CompanyUser[]
  rfqs            RFQ[]
  quotations      Quotation[]
  invoices        Invoice[]

  @@index([status])
}

model CompanyUser {
  id            String          @id @default(cuid())
  companyId     String
  company       Company         @relation(fields: [companyId], references: [id])
  userId        String          // Reference to main user service
  role          CompanyUserRole // ADMIN | BOOKER | APPROVER | VIEWER
  department    String?
  approvalLimit Decimal?        // Max booking value without escalation
  status        UserStatus      @default(ACTIVE)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@unique([companyId, userId])
  @@index([companyId])
}

model RFQ {
  id           String    @id @default(cuid())
  code         String    @unique
  companyId    String
  company      Company   @relation(fields: [companyId], references: [id])
  requesterId  String
  title        String
  description  String?
  destination  String
  travelDates  Json      // { start: Date, end: Date }
  paxCount     Int
  roomConfig   Json?     // { singles: Int, doubles: Int, twins: Int }
  requirements Json      // Meals, transport, activities needed
  budget       Json?     // { min: Decimal, max: Decimal, currency: String }
  deadline     DateTime
  status       RFQStatus @default(SUBMITTED)
  attachments  Json[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  quotations   Quotation[]

  @@index([companyId])
  @@index([status])
}

model Quotation {
  id           String          @id @default(cuid())
  code         String          @unique
  rfqId        String?
  rfq          RFQ?            @relation(fields: [rfqId], references: [id])
  companyId    String
  company      Company         @relation(fields: [companyId], references: [id])
  preparedBy   String          // Sales staff user ID
  validUntil   DateTime
  subtotal     Decimal
  discount     Decimal         @default(0)
  tax          Decimal
  total        Decimal
  markup       Decimal         // Internal: platform markup
  marginPercent Decimal        // Internal: margin %
  terms        String?
  inclusions   String[]
  exclusions   String[]
  status       QuotationStatus @default(DRAFT)
  version      Int             @default(1)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  items        QuotationItem[]

  @@index([companyId])
  @@index([rfqId])
  @@index([status])
}

model QuotationItem {
  id            String    @id @default(cuid())
  quotationId   String
  quotation     Quotation @relation(fields: [quotationId], references: [id])
  dayNumber     Int?
  componentType ComponentType?
  componentId   String?
  description   String
  quantity      Int
  unitPrice     Decimal
  total         Decimal
  costPrice     Decimal   // Internal: your cost
  margin        Decimal   // Internal: margin
  notes         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([quotationId])
}

model ApprovalWorkflow {
  id               String             @id @default(cuid())
  companyId        String
  bookingId        String             @unique
  requesterId      String
  requestedAt      DateTime           @default(now())
  currentLevel     Int                @default(1)
  status           ApprovalStatus     @default(PENDING)
  autoApproveBelow Decimal?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  approvers        ApprovalStep[]

  @@index([companyId])
  @@index([status])
}

model ApprovalStep {
  id         String           @id @default(cuid())
  workflowId String
  workflow   ApprovalWorkflow @relation(fields: [workflowId], references: [id])
  userId     String
  level      Int
  status     ApprovalStatus   @default(PENDING)
  decidedAt  DateTime?
  comments   String?
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  @@unique([workflowId, userId])
  @@index([workflowId])
}

model GroupManifest {
  id                String          @id @default(cuid())
  bookingId         String          @unique
  status            ManifestStatus  @default(DRAFT)
  roomingList       Json[]          // { roomType, travelerIds[] }
  transportManifest Json[]          // { legId, travelerIds[], seatAssignments }
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  travelers         GroupTraveler[]
}

model GroupTraveler {
  id               String        @id @default(cuid())
  manifestId       String
  manifest         GroupManifest @relation(fields: [manifestId], references: [id])
  name             String
  email            String?
  phone            String?
  idNumber         String?
  department       String?
  dietaryReqs      String[]
  specialNeeds     String?
  emergencyContact Json?
  documents        Json[]        // Passport copies, etc.
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@index([manifestId])
}

model Invoice {
  id           String        @id @default(cuid())
  code         String        @unique
  companyId    String
  company      Company       @relation(fields: [companyId], references: [id])
  bookingId    String
  subtotal     Decimal
  discount     Decimal       @default(0)
  tax          Decimal
  total        Decimal
  currency     String        @default("IDR")
  issuedAt     DateTime      @default(now())
  dueDate      DateTime
  paymentTerms PaymentTerms
  status       InvoiceStatus @default(DRAFT)
  paidAt       DateTime?
  paidAmount   Decimal?
  pdfUrl       String?       // S3 stored invoice PDF
  notes        String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  lineItems    InvoiceLineItem[]

  @@index([companyId])
  @@index([status])
  @@index([dueDate])
}

model InvoiceLineItem {
  id          String   @id @default(cuid())
  invoiceId   String
  invoice     Invoice  @relation(fields: [invoiceId], references: [id])
  description String
  quantity    Int
  unitPrice   Decimal
  total       Decimal
  taxRate     Decimal  @default(0.11) // 11% VAT
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([invoiceId])
}

enum CompanySize {
  SME
  ENTERPRISE
  GOVERNMENT
}

enum CompanyStatus {
  PENDING
  ACTIVE
  SUSPENDED
}

enum CompanyUserRole {
  ADMIN
  BOOKER
  APPROVER
  VIEWER
}

enum RFQStatus {
  SUBMITTED
  IN_PROGRESS
  QUOTED
  ACCEPTED
  REJECTED
  EXPIRED
}

enum QuotationStatus {
  DRAFT
  SENT
  REVISED
  ACCEPTED
  REJECTED
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ManifestStatus {
  DRAFT
  CONFIRMED
  LOCKED
}

enum InvoiceStatus {
  DRAFT
  SENT
  VIEWED
  PAID
  OVERDUE
  CANCELLED
}
```

---

## 5. Booking Lifecycle & State Machine

### Extended Booking Model

```prisma
model TourBooking {
  id                    String              @id @default(cuid())
  code                  String              @unique // TRV-TOUR-XXXXXX
  type                  TourBookingType     // PACKAGE | CUSTOM
  tourId                String?             // If package-based

  // Customer (B2C)
  customerId            String?
  customerEmail         String?

  // Company (MICE)
  companyId             String?
  bookerId              String?
  rfqId                 String?
  quotationId           String?
  approvalWorkflowId    String?
  invoiceId             String?

  // Dates & Pax
  travelStartDate       DateTime            @db.Date
  travelEndDate         DateTime            @db.Date
  adults                Int
  children              Int                 @default(0)
  infants               Int                 @default(0)

  // Pricing
  subtotal              Decimal
  discount              Decimal             @default(0)
  tax                   Decimal
  total                 Decimal
  depositAmount         Decimal?
  depositPaidAt         DateTime?
  balanceAmount         Decimal?
  balanceDueDate        DateTime?

  // Status
  status                TourBookingStatus   @default(DRAFT)
  confirmationDeadline  DateTime?           // SLA for on-request components

  // Vouchers
  voucherPackageUrl     String?

  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  components            BookingComponent[]
  paymentSchedule       PaymentScheduleItem[]

  @@index([customerId])
  @@index([companyId])
  @@index([status])
  @@index([travelStartDate])
}

model BookingComponent {
  id              String                  @id @default(cuid())
  bookingId       String
  booking         TourBooking             @relation(fields: [bookingId], references: [id])
  dayNumber       Int
  componentType   ComponentType
  componentId     String
  vendorId        String
  inventoryType   InventoryType           // ALLOTMENT | ON_REQUEST
  quantity        Int
  unitPrice       Decimal
  total           Decimal
  status          BookingComponentStatus  @default(PENDING)
  confirmationRef String?                 // Vendor's confirmation code
  voucherCode     String?
  voucherUrl      String?
  specialRequests String?
  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  @@index([bookingId])
  @@index([vendorId])
  @@index([status])
}

model PaymentScheduleItem {
  id          String                @id @default(cuid())
  bookingId   String
  booking     TourBooking           @relation(fields: [bookingId], references: [id])
  type        PaymentType           // DEPOSIT | BALANCE | INSTALLMENT
  number      Int?                  // For installments: 1, 2, 3...
  amount      Decimal
  dueDate     DateTime
  paidAt      DateTime?
  paymentId   String?
  status      PaymentScheduleStatus @default(PENDING)
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  @@index([bookingId])
  @@index([dueDate])
  @@index([status])
}

enum TourBookingType {
  PACKAGE
  CUSTOM
}

enum TourBookingStatus {
  // B2C Flow
  DRAFT
  PENDING_DEPOSIT
  CONFIRMING
  CONFIRMATION_FAILED
  PENDING_BALANCE
  BALANCE_OVERDUE
  CONFIRMED
  COMPLETED
  REVIEWED

  // Cancellation
  CANCELLED
  REFUNDED

  // MICE Flow
  RFQ_RECEIVED
  QUOTING
  QUOTED
  QUOTE_ACCEPTED
  QUOTE_REJECTED
  QUOTE_EXPIRED
  PENDING_APPROVAL
  APPROVAL_REJECTED
  APPROVED
  PENDING_INVOICE
  INVOICED
  PAYMENT_OVERDUE

  // Common
  ABANDONED
  DEPOSIT_EXPIRED
  AUTO_REFUNDED
}

enum InventoryType {
  ALLOTMENT
  ON_REQUEST
}

enum BookingComponentStatus {
  PENDING
  CONFIRMED
  REJECTED
  CANCELLED
}

enum PaymentType {
  DEPOSIT
  BALANCE
  INSTALLMENT
}

enum PaymentScheduleStatus {
  PENDING
  PAID
  OVERDUE
  FAILED
}
```

### State Machine

```
B2C FLOW:
─────────
DRAFT → PENDING_DEPOSIT → CONFIRMING → PENDING_BALANCE → CONFIRMED → COMPLETED
  │           │               │               │               │
  ▼           ▼               ▼               ▼               ▼
ABANDONED  DEPOSIT_EXPIRED  CONFIRMATION_FAILED  BALANCE_OVERDUE  REVIEWED
                                │
                                ▼
                          AUTO_REFUNDED

MICE FLOW:
──────────
RFQ_RECEIVED → QUOTING → QUOTED → QUOTE_ACCEPTED → PENDING_APPROVAL
                           │            │                  │
                           ▼            ▼                  ▼
                    QUOTE_REJECTED  QUOTE_EXPIRED   APPROVAL_REJECTED
                                                           │
                                                           ▼
APPROVED → CONFIRMING → PENDING_INVOICE → INVOICED → CONFIRMED → COMPLETED
               │                             │
               ▼                             ▼
       CONFIRMATION_FAILED             PAYMENT_OVERDUE

ANY STATE → CANCELLED → REFUNDED
```

---

## 6. Two-Phase Confirmation & Voucher Engine

### Confirmation Flow

```
Phase 1: Deposit & Hold
───────────────────────
1. User submits booking
2. System holds allotment inventory (15 min)
3. User pays deposit (20-50% based on rules)
4. Deposit confirmed → Start confirmation SLA timer (4 hours)

Phase 2: Component Confirmation
───────────────────────────────
5. For each component:
   ├── ALLOTMENT → Convert hold to booking (instant)
   ├── REAL_TIME → Call provider API (sync)
   └── ON_REQUEST → Create OnRequestBooking, notify vendor

6. Vendor Portal: Vendor sees pending requests
   ├── Confirm → Mark component CONFIRMED
   └── Reject → Mark component REJECTED

7. SLA Monitor Job (runs every 5 min):
   ├── All confirmed before deadline → BOOKING CONFIRMED
   ├── Any rejected → Trigger alternative search or REFUND
   └── SLA expired + pending → Auto-reject, REFUND
```

### BullMQ Queues

```typescript
// Queue definitions
const tourQueues = {
  'tour:confirmation': {
    // Process component confirmations
    concurrency: 10,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  },

  'tour:sla-monitor': {
    // Check for SLA breaches
    repeat: { every: 300000 } // Every 5 minutes
  },

  'tour:voucher-generation': {
    // Generate voucher packages
    concurrency: 5,
    attempts: 3
  },

  'tour:vendor-notify': {
    // Send vendor notifications
    concurrency: 20
  },

  'tour:payment-reminder': {
    // Balance/installment reminders
    repeat: { cron: '0 9 * * *' } // Daily at 9 AM
  }
};
```

### Voucher Models

```prisma
model VoucherPackage {
  id          String               @id @default(cuid())
  bookingId   String               @unique
  packageCode String               @unique // VP-XXXXXX
  qrCode      String               // Master QR for validation
  pdfUrl      String?              // S3 stored PDF
  webUrl      String?              // Web view URL
  generatedAt DateTime?
  expiresAt   DateTime
  status      VoucherPackageStatus @default(PENDING)
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt

  componentVouchers ComponentVoucher[]
}

model ComponentVoucher {
  id                     String                 @id @default(cuid())
  packageId              String
  package                VoucherPackage         @relation(fields: [packageId], references: [id])
  bookingComponentId     String
  voucherCode            String                 @unique // VC-XXXXXX
  qrCode                 String                 // Component-specific QR
  componentType          ComponentType
  vendorId               String
  vendorName             String
  redemptionDetails      Json                   // Check-in time, address, contact
  status                 ComponentVoucherStatus @default(ISSUED)
  redeemedAt             DateTime?
  redeemedBy             String?
  offlineValidationHash  String                 // For offline merchant app
  createdAt              DateTime               @default(now())
  updatedAt              DateTime               @updatedAt

  redemptionLogs         RedemptionLog[]

  @@index([packageId])
  @@index([vendorId])
  @@index([status])
}

model RedemptionLog {
  id          String           @id @default(cuid())
  voucherId   String
  voucher     ComponentVoucher @relation(fields: [voucherId], references: [id])
  action      RedemptionAction // SCANNED | VALIDATED | REDEEMED | REJECTED
  performedBy Json             // { vendorUserId, deviceId }
  location    Json?            // { lat, lng }
  timestamp   DateTime         @default(now())
  offlineSync Boolean          @default(false)
  notes       String?

  @@index([voucherId])
  @@index([timestamp])
}

enum VoucherPackageStatus {
  PENDING
  GENERATED
  SENT
  DOWNLOADED
}

enum ComponentVoucherStatus {
  ISSUED
  REDEEMED
  EXPIRED
  CANCELLED
}

enum RedemptionAction {
  SCANNED
  VALIDATED
  REDEEMED
  REJECTED
}
```

### Offline Redemption

```
Hash Generation:
  hash = HMAC-SHA256(voucherCode + date + vendorSecret)

QR Content:
  { "v": "VC-XXXXXX", "h": "abc123...", "d": "2026-03-15" }

Merchant App Flow:
1. Download daily manifest with validation hashes
2. Scan QR → Extract voucherCode + hash
3. Validate hash locally (no network needed)
4. Mark redeemed locally
5. Sync to server when online (batch upload)
```

---

## 7. API Strategy & GraphQL Schema

### Federation Structure

```graphql
# ─────────────────────────────────────────────
# TOUR SERVICE
# ─────────────────────────────────────────────

type Tour @key(fields: "id") {
  id: ID!
  code: String!
  name: String!
  slug: String!
  type: TourType!
  source: TourSource!
  destination: Destination!
  duration: Duration!
  categories: [Category!]!
  themes: [String!]!
  difficulty: Difficulty!
  minPax: Int!
  maxPax: Int!
  priceFrom: Money!
  status: TourStatus!
  itinerary: [ItineraryDay!]!
  images: [Image!]!
  highlights: [String!]!
  inclusions: [String!]!
  exclusions: [String!]!
  availability(dateRange: DateRangeInput!): [AvailabilitySlot!]!
  reviews: ReviewConnection!
  rating: Rating
}

type Query {
  # Discovery
  searchTours(input: TourSearchInput!): TourConnection!
  tourBySlug(slug: String!): Tour
  tourById(id: ID!): Tour
  featuredTours(destination: ID, limit: Int): [Tour!]!
  popularDestinations(limit: Int): [Destination!]!

  # Custom builder
  searchComponents(input: ComponentSearchInput!): ComponentConnection!
  componentById(type: ComponentType!, id: ID!): Component
  validateItinerary(input: ItineraryInput!): ItineraryValidation!
  calculateCustomPrice(input: ItineraryInput!): PriceBreakdown!

  # Bookings
  myTourBookings(status: [TourBookingStatus!]): [TourBooking!]!
  tourBooking(id: ID!): TourBooking
}

type Mutation {
  # Custom trip
  createCustomItinerary(input: CreateItineraryInput!): Itinerary!
  updateItinerary(id: ID!, input: UpdateItineraryInput!): Itinerary!
  addComponentToDay(itineraryId: ID!, input: AddComponentInput!): ItineraryDay!
  removeComponent(itineraryId: ID!, itemId: ID!): ItineraryDay!
  reorderComponents(itineraryId: ID!, dayNumber: Int!, itemIds: [ID!]!): ItineraryDay!

  # Booking
  initiateTourBooking(input: InitiateBookingInput!): TourBookingSession!
  confirmTourBooking(sessionId: ID!, paymentInput: PaymentInput!): TourBooking!
  cancelTourBooking(bookingId: ID!, reason: String!): TourBooking!

  # Reviews
  submitReview(bookingId: ID!, input: ReviewInput!): Review!
}

# ─────────────────────────────────────────────
# INVENTORY SERVICE
# ─────────────────────────────────────────────

type Query {
  checkAvailability(input: AvailabilityCheckInput!): AvailabilityResult!
  getComponentAvailability(
    componentType: ComponentType!
    componentId: ID!
    dateRange: DateRangeInput!
  ): [DailyAvailability!]!
}

type Mutation {
  holdInventory(input: HoldInput!): InventoryHold!
  releaseHold(holdId: ID!): Boolean!
  convertHoldToBooking(holdId: ID!, bookingId: ID!): Boolean!
}

# ─────────────────────────────────────────────
# VENDOR SERVICE
# ─────────────────────────────────────────────

type Query {
  # Vendor portal
  vendorDashboard: VendorDashboard!
  pendingRequests: [OnRequestBooking!]!
  vendorBookings(dateRange: DateRangeInput!): [VendorBooking!]!
  vendorSettlements: [VendorSettlement!]!
  vendorPerformance: VendorPerformance!
}

type Mutation {
  # Onboarding
  registerVendor(input: VendorRegistrationInput!): Vendor!
  updateVendorProfile(input: VendorProfileInput!): Vendor!

  # Inventory management
  updateAllotment(input: AllotmentInput!): Allotment!
  bulkUpdateAllotments(input: BulkAllotmentInput!): [Allotment!]!
  setBlackoutDates(input: BlackoutInput!): Boolean!

  # Request handling
  confirmRequest(requestId: ID!, confirmationRef: String): OnRequestBooking!
  rejectRequest(requestId: ID!, reason: String!): OnRequestBooking!

  # Settlement
  disputeSettlement(settlementId: ID!, reason: String!): VendorSettlement!
}

# ─────────────────────────────────────────────
# CORPORATE SERVICE
# ─────────────────────────────────────────────

type Query {
  myCompany: Company
  companyUsers: [CompanyUser!]!
  companyRFQs(status: RFQStatus): [RFQ!]!
  quotation(id: ID!): Quotation
  quotations(status: QuotationStatus): [Quotation!]!
  pendingApprovals: [ApprovalWorkflow!]!
  companyInvoices(status: InvoiceStatus): [Invoice!]!
  groupManifest(bookingId: ID!): GroupManifest
}

type Mutation {
  # Company management
  registerCompany(input: CompanyRegistrationInput!): Company!
  inviteCompanyUser(input: InviteUserInput!): CompanyUser!
  updateCompanyUser(userId: ID!, input: UpdateUserInput!): CompanyUser!

  # RFQ Flow
  submitRFQ(input: RFQInput!): RFQ!
  updateRFQ(id: ID!, input: RFQInput!): RFQ!
  cancelRFQ(id: ID!): RFQ!

  # Quotation (Sales side)
  createQuotation(rfqId: ID!, input: QuotationInput!): Quotation!
  updateQuotation(id: ID!, input: QuotationInput!): Quotation!
  sendQuotation(id: ID!): Quotation!

  # Quotation (Company side)
  acceptQuotation(quotationId: ID!): TourBooking!
  rejectQuotation(quotationId: ID!, reason: String): Quotation!
  requestQuotationRevision(quotationId: ID!, feedback: String!): Quotation!

  # Approvals
  approveBooking(workflowId: ID!, comments: String): ApprovalWorkflow!
  rejectBooking(workflowId: ID!, reason: String!): ApprovalWorkflow!

  # Group management
  createManifest(bookingId: ID!): GroupManifest!
  addTraveler(manifestId: ID!, input: TravelerInput!): GroupTraveler!
  updateTraveler(travelerId: ID!, input: TravelerInput!): GroupTraveler!
  removeTraveler(travelerId: ID!): Boolean!
  uploadManifestCSV(manifestId: ID!, file: Upload!): GroupManifest!
  updateRoomingList(manifestId: ID!, input: RoomingInput!): GroupManifest!
  finalizeManifest(manifestId: ID!): GroupManifest!
}
```

### Key Input Types

```graphql
input TourSearchInput {
  query: String
  destination: ID
  coordinates: CoordinatesInput
  dateRange: DateRangeInput
  duration: DurationRangeInput
  pax: PaxInput
  categories: [ID!]
  themes: [String!]
  priceRange: PriceRangeInput
  difficulty: [Difficulty!]
  source: [TourSource!]

  first: Int
  after: String
  sortBy: TourSortField
  sortOrder: SortOrder
}

input ComponentSearchInput {
  type: ComponentType!
  destination: ID!
  coordinates: CoordinatesInput
  date: Date
  dateRange: DateRangeInput
  category: ID
  priceRange: PriceRangeInput

  first: Int
  after: String
}

input ItineraryInput {
  destinationId: ID!
  startDate: Date!
  days: [ItineraryDayInput!]!
  pax: PaxInput!
}

input ItineraryDayInput {
  dayNumber: Int!
  items: [ItineraryItemInput!]!
}

input ItineraryItemInput {
  componentType: ComponentType!
  componentId: ID!
  startTime: Time!
  endTime: Time
  quantity: Int
  notes: String
}

input InitiateBookingInput {
  type: TourBookingType!
  tourId: ID
  customItinerary: ItineraryInput
  travelDate: DateRangeInput!
  pax: PaxInput!
  customerInfo: CustomerInfoInput
  companyId: ID
  paymentMethod: PaymentMethod!
  installmentPlan: Int  # 3 or 6 months, optional
}

input PaxInput {
  adults: Int!
  children: Int
  infants: Int
}

input DateRangeInput {
  start: Date!
  end: Date!
}

enum TourSortField {
  RELEVANCE
  PRICE_LOW
  PRICE_HIGH
  DURATION
  RATING
  POPULARITY
}
```

---

## 8. Search & Discovery Engine

### OpenSearch Index: tours

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "code": { "type": "keyword" },
      "name": {
        "type": "text",
        "analyzer": "standard",
        "fields": { "keyword": { "type": "keyword" } }
      },
      "slug": { "type": "keyword" },
      "type": { "type": "keyword" },
      "source": { "type": "keyword" },

      "destination": {
        "properties": {
          "id": { "type": "keyword" },
          "name": { "type": "text" },
          "country": { "type": "keyword" },
          "coordinates": { "type": "geo_point" }
        }
      },

      "duration": {
        "properties": {
          "days": { "type": "integer" },
          "nights": { "type": "integer" }
        }
      },

      "categories": { "type": "keyword" },
      "themes": { "type": "keyword" },
      "difficulty": { "type": "keyword" },

      "pricing": {
        "properties": {
          "basePrice": { "type": "float" },
          "currency": { "type": "keyword" }
        }
      },

      "pax": {
        "properties": {
          "min": { "type": "integer" },
          "max": { "type": "integer" }
        }
      },

      "rating": {
        "properties": {
          "average": { "type": "float" },
          "count": { "type": "integer" }
        }
      },

      "bookingCount": { "type": "integer" },
      "popularityScore": { "type": "float" },

      "highlights": { "type": "text" },
      "inclusions": { "type": "keyword" },

      "availability": {
        "properties": {
          "nextAvailable": { "type": "date" },
          "spotsThisMonth": { "type": "integer" }
        }
      },

      "vendor": {
        "properties": {
          "id": { "type": "keyword" },
          "name": { "type": "text" },
          "rating": { "type": "float" }
        }
      },

      "status": { "type": "keyword" },
      "updatedAt": { "type": "date" }
    }
  }
}
```

### OpenSearch Index: components

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "type": { "type": "keyword" },
      "name": {
        "type": "text",
        "fields": { "keyword": { "type": "keyword" } }
      },
      "vendorId": { "type": "keyword" },

      "location": {
        "properties": {
          "id": { "type": "keyword" },
          "name": { "type": "text" },
          "destination": { "type": "keyword" },
          "coordinates": { "type": "geo_point" }
        }
      },

      "category": { "type": "keyword" },
      "duration": {
        "properties": {
          "hours": { "type": "integer" },
          "minutes": { "type": "integer" }
        }
      },
      "difficulty": { "type": "keyword" },

      "pricing": {
        "properties": {
          "basePrice": { "type": "float" },
          "currency": { "type": "keyword" }
        }
      },

      "availabilityType": { "type": "keyword" },

      "rating": {
        "properties": {
          "average": { "type": "float" },
          "count": { "type": "integer" }
        }
      },

      "operatingHours": {
        "properties": {
          "slots": { "type": "keyword" },
          "daysOfWeek": { "type": "integer" }
        }
      },

      "status": { "type": "keyword" },
      "updatedAt": { "type": "date" }
    }
  }
}
```

### Event-Driven Index Sync

```typescript
// Events that trigger index updates
const indexTriggers = {
  'tour.created': 'indexTour',
  'tour.updated': 'indexTour',
  'tour.deleted': 'deleteTourIndex',
  'tour.published': 'indexTour',
  'component.created': 'indexComponent',
  'component.updated': 'indexComponent',
  'component.deleted': 'deleteComponentIndex',
  'booking.confirmed': 'updateTourPopularity',
  'review.submitted': 'updateTourRating',
  'inventory.changed': 'updateAvailabilityHints'
};
```

---

## 9. Map-Based Itinerary Builder

### Validation Rules

```typescript
interface ValidationRule {
  code: string;
  severity: 'ERROR' | 'WARNING';
  check: (itinerary: Itinerary) => ValidationIssue[];
}

const validationRules: ValidationRule[] = [
  {
    code: 'TIME_CONFLICT',
    severity: 'ERROR',
    check: (itinerary) => {
      // Check for overlapping activities on same day
    }
  },
  {
    code: 'INSUFFICIENT_TRAVEL_TIME',
    severity: 'ERROR',
    check: (itinerary) => {
      // Calculate travel time between consecutive components
      // Error if arrival time > start time
    }
  },
  {
    code: 'OUTSIDE_OPERATING_HOURS',
    severity: 'ERROR',
    check: (itinerary) => {
      // Check component operating hours
    }
  },
  {
    code: 'NO_ACCOMMODATION',
    severity: 'ERROR',
    check: (itinerary) => {
      // Check each night has accommodation
    }
  },
  {
    code: 'PAX_EXCEEDS_CAPACITY',
    severity: 'ERROR',
    check: (itinerary) => {
      // Check pax count vs component capacity
    }
  },
  {
    code: 'MISSING_MEAL',
    severity: 'WARNING',
    check: (itinerary) => {
      // Suggest meals for missing slots
    }
  },
  {
    code: 'SUGGEST_TRANSPORT',
    severity: 'WARNING',
    check: (itinerary) => {
      // Suggest transport if gap > 30 min drive
    }
  }
];
```

### Travel Time Calculation

```sql
-- PostGIS query for travel time estimation
SELECT
  ST_Distance(
    ST_SetSRID(ST_MakePoint(from_lng, from_lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(to_lng, to_lat), 4326)::geography
  ) / 1000 AS distance_km,

  -- Rough estimate: 30 km/h average in tourist areas
  (ST_Distance(...) / 1000) / 30 * 60 AS estimated_minutes
FROM ...
```

---

## 10. Payment & Invoicing

### Payment Types

| Type | Use Case | Flow |
|------|----------|------|
| FULL | Low-value, last-minute | Pay 100% → Confirm |
| DEPOSIT | Standard B2C | Pay 20% → Confirm → Pay 80% before travel |
| INSTALLMENT | High-value B2C | Pay in 3 or 6 monthly installments |
| INVOICE | MICE | Book → Invoice → Pay within NET-30/60 |

### Deposit Rules

```typescript
const depositRules = {
  // Days before travel → deposit percentage
  '30+': 0.20,   // 20% deposit
  '14-29': 0.30, // 30% deposit
  '7-13': 0.50,  // 50% deposit
  '0-6': 1.00,   // Full payment required
};

const balanceDueRules = {
  // Balance due X days before travel
  default: 7,
  highValue: 14, // > IDR 50M
  mice: 14,
};
```

### Refund Policy

```typescript
const refundPolicy = {
  // Days before travel → refund percentage
  '30+': 1.00,   // 100% refund
  '14-29': 0.75, // 75% refund
  '7-13': 0.50,  // 50% refund
  '0-6': 0.00,   // No refund
};
```

### BullMQ Payment Jobs

```typescript
const paymentJobs = {
  'tour:balance-reminder': {
    // Remind at 14, 7, 3, 1 days before due
    schedule: [14, 7, 3, 1],
  },

  'tour:installment-reminder': {
    // Remind at 7, 3, 1 days before due
    schedule: [7, 3, 1],
  },

  'tour:invoice-reminder': {
    // Remind at 7, 3, 1 days before due
    schedule: [7, 3, 1],
  },

  'tour:overdue-handler': {
    // Daily check for overdue payments
    cron: '0 9 * * *',
  },

  'tour:auto-cancel': {
    // Cancel if balance not paid by travel date - 3 days
    trigger: 'onOverdue',
  },
};
```

---

## 11. Vendor Portal & Settlement

### Portal Modules

1. **Dashboard** - Pending requests, today's bookings, monthly revenue, rating
2. **Booking Management** - Pending requests, upcoming, history, cancellations
3. **Inventory Management** - Allotment calendar, bulk updates, blackout dates
4. **Pricing** - Base rates, seasonal rules, special offers
5. **Settlements** - Earnings, payouts, history, disputes
6. **Performance** - Metrics, reviews, SLA compliance
7. **Settings** - Profile, bank details, contacts, API credentials

### Settlement Calculation

```
Settlement Period: Bi-weekly (1st-15th, 16th-end of month)

For each vendor:
1. Gross bookings (completed, travel date in period)
2. Deductions:
   - Platform commission (per contract %)
   - Cancellation penalties
   - Refunds processed
   - Disputes against vendor
3. Adjustments:
   - Previous period corrections
   - Promotional contributions
   - Performance bonuses
4. Net payout = Gross - Deductions + Adjustments

Timeline:
- Period ends → +3 days: Calculated
- +5 days: Vendor review window
- +7 days: Finalized
- +10 days: Payout processed
```

### Performance Scoring

```
Score (0-100) =
  Confirmation Rate (30%) +
  Response Time (25%) +
  Cancellation Rate (20%) +
  Customer Rating (15%) +
  SLA Compliance (10%)

Impact:
- 80+: Featured placement, priority support
- 60-79: Standard placement
- 40-59: Warning, reduced visibility
- <40: Suspension review
```

---

## 12. Infrastructure & Scalability

### Kubernetes Deployment

```yaml
# Service scaling targets
services:
  gateway:      { min: 3, max: 10, cpu: 70% }
  tour:         { min: 3, max: 8, cpu: 70% }
  inventory:    { min: 3, max: 8, cpu: 70% }
  vendor:       { min: 2, max: 5, cpu: 70% }
  component:    { min: 2, max: 5, cpu: 70% }
  corporate:    { min: 2, max: 5, cpu: 70% }
  booking:      { min: 3, max: 10, cpu: 70% }
  payment:      { min: 2, max: 5, cpu: 70% }
  notification: { min: 2, max: 8, cpu: 70% }
```

### Database Strategy

- Per-service PostgreSQL (existing pattern)
- PostGIS extension for geo-spatial queries
- PgBouncer connection pooling (100 connections/service)

### Caching (Redis Cluster)

| Layer | Key Pattern | TTL |
|-------|-------------|-----|
| API Response | `graphql:{hash}` | 60-300s |
| Session | `session:{id}` | 30 min |
| Availability | `avail:{type}:{id}:{date}` | 60s |
| Component | `component:{type}:{id}` | 3600s |
| Rate Limit | `ratelimit:{id}` | 60s |

### Resilience

- **Circuit Breaker**: 5 failures in 30s → Open for 30s
- **Retry**: 3 attempts, exponential backoff (1s, 2s, 4s)
- **Rate Limiting**: Sliding window per tier
- **Idempotency**: Redis-based, 24h TTL

---

## 13. Event-Driven Architecture & Analytics

### Domain Events

```typescript
// Core events
interface TourViewed { tourId, userId?, sessionId, source, timestamp }
interface BookingInitiated { bookingId, tourId?, totalAmount, paxCount, timestamp }
interface DepositPaid { bookingId, paymentId, amount, timestamp }
interface ComponentConfirmed { bookingId, componentId, vendorId, responseTime, timestamp }
interface BookingConfirmed { bookingId, totalAmount, timestamp }
interface BookingCancelled { bookingId, reason, cancelledBy, refundAmount, timestamp }
interface BookingCompleted { bookingId, totalRevenue, timestamp }
interface VoucherRedeemed { voucherId, bookingId, vendorId, timestamp }
interface CheckoutAbandoned { sessionId, cartValue, lastStep, timestamp }
```

### Analytics Pipeline

```
Redis Streams → Analytics Worker → ClickHouse → Metabase
                     ↓
              Prometheus (real-time metrics)
```

### Growth Features Powered by Events

1. **Recommendation Engine** - Based on views, bookings, searches
2. **Abandoned Cart Recovery** - +30min push, +2h email, +24h discount
3. **Loyalty Program** - Points earn/redeem based on booking events
4. **Dynamic Pricing** - Demand signals from search/booking events

---

## 14. Phased Execution Roadmap

### Phase 1: Foundation (Weeks 1-12)

**Goal:** Launch aggregated tours + basic direct supply

- Week 1-4: Core infrastructure (5 new services, schemas, CI/CD)
- Week 5-8: Aggregation MVP (first provider, search, booking, vouchers)
- Week 9-12: Direct supply lite (allotment inventory, fixed packages)

**Deliverables:** 50+ direct packages, 1-2 providers, B2C flow

### Phase 2: Scale (Weeks 13-24)

**Goal:** Full direct supply + MICE + vendor portal

- Week 13-16: Search & discovery (OpenSearch, geo-search)
- Week 17-20: Custom trip builder (map UI, validation, on-request)
- Week 21-24: Vendor portal + MICE (self-service, RFQ, invoicing)

**Deliverables:** Custom builder, 50+ vendors, 10 corporate accounts

### Phase 3: Dominance (Weeks 25-40)

**Goal:** Xperience vertical + AI + regional expansion

- Week 25-30: Xperience vertical (instant vouchers, time-slots)
- Week 31-35: Intelligence layer (recommendations, dynamic pricing)
- Week 36-40: Platform maturity (multi-currency, white-label API)

**Deliverables:** 1M MAU, 200K monthly bookings, regional expansion ready

---

## 15. Super App Strategy & Competitive Moat

### Cross-Vertical Integration

- Unified booking across Shuttle + Tour + Xperience
- Bundle pricing (10% off multi-vertical bookings)
- Shared customer profile and wallet
- Unified trip management

### Loyalty Program

```
Tiers:
- Member: Earn points
- Silver (5K pts): 5% bonus, priority support
- Gold (15K pts): 10% bonus, free cancellation
- Platinum (50K pts): 15% bonus, dedicated agent
```

### Moat Building

1. **Supply depth** - Exclusive local operators, better rates
2. **Cross-vertical synergy** - Bundle discounts, unified loyalty
3. **Data advantage** - Full trip context, personalization
4. **Corporate lock-in** - Credit terms, approval workflows
5. **Tech platform** - Vendor portal, white-label API

### Long-Term Vision

- Year 1: Regional leader (Indonesia)
- Year 2: Southeast Asia expansion
- Year 3: Full travel super app

---

## Appendix A: Environment Variables

### Tour Service

```env
NODE_ENV=development
PORT=4010
DATABASE_URL=postgresql://tour:tour_dev@localhost:5440/tour
REDIS_URL=redis://localhost:6379
OPENSEARCH_URL=http://localhost:9200

# Provider credentials
KLOOK_API_KEY=
VIATOR_API_KEY=

# Google Maps (for travel time)
GOOGLE_MAPS_API_KEY=
```

### Inventory Service

```env
NODE_ENV=development
PORT=4011
DATABASE_URL=postgresql://inventory:inventory_dev@localhost:5441/inventory
REDIS_URL=redis://localhost:6379
```

### Vendor Service

```env
NODE_ENV=development
PORT=4012
DATABASE_URL=postgresql://vendor:vendor_dev@localhost:5442/vendor
REDIS_URL=redis://localhost:6379
S3_BUCKET=travelplatform-vendor-docs
```

### Component Service

```env
NODE_ENV=development
PORT=4013
DATABASE_URL=postgresql://component:component_dev@localhost:5443/component
REDIS_URL=redis://localhost:6379
```

### Corporate Service

```env
NODE_ENV=development
PORT=4014
DATABASE_URL=postgresql://corporate:corporate_dev@localhost:5444/corporate
REDIS_URL=redis://localhost:6379
S3_BUCKET=travelplatform-invoices
```

---

## Appendix B: Database Migrations

Run in order:

```bash
# Generate Prisma clients
pnpm --filter @travelplatform/tour-service db:generate
pnpm --filter @travelplatform/inventory-service db:generate
pnpm --filter @travelplatform/vendor-service db:generate
pnpm --filter @travelplatform/component-service db:generate
pnpm --filter @travelplatform/corporate-service db:generate

# Push schemas (dev) or run migrations (prod)
pnpm --filter @travelplatform/tour-service db:push
pnpm --filter @travelplatform/inventory-service db:push
pnpm --filter @travelplatform/vendor-service db:push
pnpm --filter @travelplatform/component-service db:push
pnpm --filter @travelplatform/corporate-service db:push
```

---

## Appendix C: OpenSearch Setup

```bash
# Create indices
curl -X PUT "localhost:9200/tours" -H 'Content-Type: application/json' -d @opensearch/tours-mapping.json
curl -X PUT "localhost:9200/components" -H 'Content-Type: application/json' -d @opensearch/components-mapping.json

# Create index aliases
curl -X POST "localhost:9200/_aliases" -H 'Content-Type: application/json' -d '{
  "actions": [
    { "add": { "index": "tours", "alias": "tours_read" } },
    { "add": { "index": "components", "alias": "components_read" } }
  ]
}'
```

---

## Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-17 | 1.0 | Architecture Team | Initial design |
