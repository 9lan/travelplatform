-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('HIACE', 'MINIBUS', 'BUS');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('SCHEDULED', 'BOARDING', 'DEPARTED', 'ARRIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "providerCode" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "longitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "phone" TEXT,
    "providerCode" TEXT,
    "providerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "distance" DOUBLE PRECISION,
    "estimatedDuration" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "amenities" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "departureTime" TIMESTAMP(3) NOT NULL,
    "arrivalTime" TIMESTAMP(3) NOT NULL,
    "driverName" TEXT,
    "vehiclePlate" TEXT,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "City_province_idx" ON "City"("province");

-- CreateIndex
CREATE INDEX "City_providerCode_idx" ON "City"("providerCode");

-- CreateIndex
CREATE UNIQUE INDEX "City_providerCode_providerId_key" ON "City"("providerCode", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_code_key" ON "Counter"("code");

-- CreateIndex
CREATE INDEX "Counter_cityId_idx" ON "Counter"("cityId");

-- CreateIndex
CREATE INDEX "Counter_isActive_idx" ON "Counter"("isActive");

-- CreateIndex
CREATE INDEX "Counter_providerCode_idx" ON "Counter"("providerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_providerCode_providerId_key" ON "Counter"("providerCode", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "Route_code_key" ON "Route"("code");

-- CreateIndex
CREATE INDEX "Route_originId_destinationId_idx" ON "Route"("originId", "destinationId");

-- CreateIndex
CREATE INDEX "Route_isActive_idx" ON "Route"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_code_key" ON "Vehicle"("code");

-- CreateIndex
CREATE INDEX "Vehicle_type_idx" ON "Vehicle"("type");

-- CreateIndex
CREATE INDEX "Vehicle_isActive_idx" ON "Vehicle"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_code_key" ON "Schedule"("code");

-- CreateIndex
CREATE INDEX "Schedule_routeId_departureTime_idx" ON "Schedule"("routeId", "departureTime");

-- CreateIndex
CREATE INDEX "Schedule_status_idx" ON "Schedule"("status");

-- CreateIndex
CREATE INDEX "Schedule_departureTime_idx" ON "Schedule"("departureTime");

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_originId_fkey" FOREIGN KEY ("originId") REFERENCES "Counter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Counter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
