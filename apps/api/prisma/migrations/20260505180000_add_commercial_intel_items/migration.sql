-- CreateEnum
CREATE TYPE "EmailIntentClassification" AS ENUM ('SUPPLIER_OFFER', 'CUSTOMER_REQUEST', 'COMMERCIAL_INTEL', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CommercialIntelItemType" AS ENUM ('SUPPLIER_RELIABILITY_NOTE', 'BUYER_DEMAND_SIGNAL', 'MANUAL_BUY_TRIGGER', 'MANUAL_SELL_TRIGGER', 'MARKET_PRICE_INTEL', 'EXPIRY_RISK_RULE', 'PRODUCT_NOTE', 'CONTACT_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommercialIntelStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommercialIntelConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "CommercialIntelItem" (
    "id" TEXT NOT NULL,
    "inboundEmailId" TEXT,
    "sourceDocumentId" TEXT,
    "itemType" "CommercialIntelItemType" NOT NULL,
    "status" "CommercialIntelStatus" NOT NULL DEFAULT 'NEW',
    "productText" TEXT,
    "productId" TEXT,
    "supplierName" TEXT,
    "supplierId" TEXT,
    "customerName" TEXT,
    "contactName" TEXT,
    "priceThreshold" DECIMAL(12,2),
    "currency" TEXT,
    "availabilitySignal" TEXT,
    "riskLevel" TEXT,
    "urgency" TEXT,
    "signalEffect" TEXT,
    "evidenceText" TEXT NOT NULL,
    "confidence" "CommercialIntelConfidence" NOT NULL,
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

    CONSTRAINT "CommercialIntelItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommercialIntelItem_inboundEmailId_itemFingerprint_key" ON "CommercialIntelItem"("inboundEmailId", "itemFingerprint");

-- CreateIndex
CREATE INDEX "CommercialIntelItem_inboundEmailId_status_createdAt_idx" ON "CommercialIntelItem"("inboundEmailId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialIntelItem_productId_status_createdAt_idx" ON "CommercialIntelItem"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialIntelItem_supplierId_status_createdAt_idx" ON "CommercialIntelItem"("supplierId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialIntelItem_itemType_status_createdAt_idx" ON "CommercialIntelItem"("itemType", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "CommercialIntelItem" ADD CONSTRAINT "CommercialIntelItem_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialIntelItem" ADD CONSTRAINT "CommercialIntelItem_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "InboundEmailDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialIntelItem" ADD CONSTRAINT "CommercialIntelItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialIntelItem" ADD CONSTRAINT "CommercialIntelItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
