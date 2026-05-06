-- CreateEnum
CREATE TYPE "DemandSupplyMatchStatus" AS ENUM ('NEW', 'REVIEWED', 'REJECTED', 'PROMOTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DemandSupplyMatchReason" AS ENUM ('EXACT_PRODUCT_MATCH', 'TARGET_PRICE_MET', 'CUSTOMER_DEMAND_WITH_SUPPLIER_PRICE', 'CUSTOMER_DEMAND_WITH_COMMERCIAL_INTEL', 'PRICE_ALERT_WITH_CUSTOMER_DEMAND', 'OTHER');

-- CreateEnum
CREATE TYPE "DemandSupplyMatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "DemandSupplyMatch" (
    "id" TEXT NOT NULL,
    "customerDemandSignalId" TEXT NOT NULL,
    "supplierPriceItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "status" "DemandSupplyMatchStatus" NOT NULL DEFAULT 'NEW',
    "reason" "DemandSupplyMatchReason" NOT NULL,
    "confidence" "DemandSupplyMatchConfidence" NOT NULL,
    "matchScore" INTEGER,
    "rawCustomerProductText" TEXT,
    "rawSupplierProductText" TEXT,
    "quantityRequested" INTEGER,
    "requestedTargetPrice" DECIMAL(12,2),
    "requestedCurrency" TEXT,
    "supplierUnitPrice" DECIMAL(12,2),
    "supplierCurrency" TEXT,
    "estimatedMarginAmount" DECIMAL(12,2),
    "estimatedMarginPct" DECIMAL(8,4),
    "marginExplanation" TEXT,
    "urgency" TEXT,
    "riskFlags" JSONB,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB,
    "commercialIntelContext" JSONB,
    "customerDemandContext" JSONB,
    "supplierOfferContext" JSONB,
    "matchFingerprint" TEXT NOT NULL,
    "reviewedByType" TEXT,
    "reviewedByIdentifier" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectedByType" TEXT,
    "rejectedByIdentifier" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "promotedByType" TEXT,
    "promotedByIdentifier" TEXT,
    "promotedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandSupplyMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemandSupplyMatch_demand_price_key" ON "DemandSupplyMatch"("customerDemandSignalId", "supplierPriceItemId");

-- CreateIndex
CREATE INDEX "DemandSupplyMatch_status_createdAt_idx" ON "DemandSupplyMatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DemandSupplyMatch_productId_status_createdAt_idx" ON "DemandSupplyMatch"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DemandSupplyMatch_customerDemandSignalId_status_idx" ON "DemandSupplyMatch"("customerDemandSignalId", "status");

-- CreateIndex
CREATE INDEX "DemandSupplyMatch_supplierPriceItemId_status_idx" ON "DemandSupplyMatch"("supplierPriceItemId", "status");

-- CreateIndex
CREATE INDEX "DemandSupplyMatch_customerId_status_createdAt_idx" ON "DemandSupplyMatch"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DemandSupplyMatch_supplierId_status_createdAt_idx" ON "DemandSupplyMatch"("supplierId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DemandSupplyMatch_matchFingerprint_idx" ON "DemandSupplyMatch"("matchFingerprint");

-- AddForeignKey
ALTER TABLE "DemandSupplyMatch" ADD CONSTRAINT "DemandSupplyMatch_customerDemandSignalId_fkey" FOREIGN KEY ("customerDemandSignalId") REFERENCES "CustomerDemandSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandSupplyMatch" ADD CONSTRAINT "DemandSupplyMatch_supplierPriceItemId_fkey" FOREIGN KEY ("supplierPriceItemId") REFERENCES "SupplierPriceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandSupplyMatch" ADD CONSTRAINT "DemandSupplyMatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandSupplyMatch" ADD CONSTRAINT "DemandSupplyMatch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandSupplyMatch" ADD CONSTRAINT "DemandSupplyMatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
