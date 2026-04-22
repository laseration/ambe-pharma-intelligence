-- AlterTable
ALTER TABLE "EmailDerivedOffer" ADD COLUMN "offerFingerprint" TEXT;

-- AlterTable
ALTER TABLE "SupplierPriceItem" ADD COLUMN "promotionFingerprint" TEXT;

-- AlterTable
ALTER TABLE "SupplierPriceList" ADD COLUMN "sourceInboundEmailId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmailDocument_inboundEmailId_kind_documentIndex_key"
ON "InboundEmailDocument"("inboundEmailId", "kind", "documentIndex");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDerivedOffer_inboundEmailId_offerFingerprint_key"
ON "EmailDerivedOffer"("inboundEmailId", "offerFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPriceList_supplierId_sourceInboundEmailId_key"
ON "SupplierPriceList"("supplierId", "sourceInboundEmailId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPriceItem_supplierPriceListId_promotionFingerprint_key"
ON "SupplierPriceItem"("supplierPriceListId", "promotionFingerprint");

-- AddForeignKey
ALTER TABLE "SupplierPriceList"
ADD CONSTRAINT "SupplierPriceList_sourceInboundEmailId_fkey"
FOREIGN KEY ("sourceInboundEmailId") REFERENCES "InboundEmail"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
