-- CreateEnum
CREATE TYPE "CustomerDemandStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'MATCHED');

-- CreateEnum
CREATE TYPE "CustomerDemandRequestType" AS ENUM ('SOURCE_PRODUCT', 'CHECK_AVAILABILITY', 'REQUEST_QUOTE', 'BUYER_INTEREST', 'REPEAT_DEMAND', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerDemandConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "CustomerDemandSignal" (
    "id" TEXT NOT NULL,
    "inboundEmailId" TEXT,
    "sourceDocumentId" TEXT,
    "status" "CustomerDemandStatus" NOT NULL DEFAULT 'NEW',
    "requestType" "CustomerDemandRequestType" NOT NULL,
    "customerName" TEXT,
    "customerId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "productText" TEXT,
    "productId" TEXT,
    "quantityRequested" INTEGER,
    "targetPrice" DECIMAL(12,2),
    "currency" TEXT,
    "neededByDate" TIMESTAMP(3),
    "urgency" TEXT,
    "evidenceText" TEXT NOT NULL,
    "confidence" "CustomerDemandConfidence" NOT NULL,
    "reviewReason" TEXT,
    "aiAssisted" BOOLEAN NOT NULL DEFAULT true,
    "approvedByType" TEXT,
    "approvedByIdentifier" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByType" TEXT,
    "rejectedByIdentifier" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "itemFingerprint" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDemandSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDemandSignal_inboundEmailId_itemFingerprint_key" ON "CustomerDemandSignal"("inboundEmailId", "itemFingerprint");

-- CreateIndex
CREATE INDEX "CustomerDemandSignal_inboundEmailId_status_createdAt_idx" ON "CustomerDemandSignal"("inboundEmailId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDemandSignal_productId_status_createdAt_idx" ON "CustomerDemandSignal"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDemandSignal_customerId_status_createdAt_idx" ON "CustomerDemandSignal"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDemandSignal_requestType_status_createdAt_idx" ON "CustomerDemandSignal"("requestType", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerDemandSignal" ADD CONSTRAINT "CustomerDemandSignal_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDemandSignal" ADD CONSTRAINT "CustomerDemandSignal_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "InboundEmailDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDemandSignal" ADD CONSTRAINT "CustomerDemandSignal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDemandSignal" ADD CONSTRAINT "CustomerDemandSignal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
