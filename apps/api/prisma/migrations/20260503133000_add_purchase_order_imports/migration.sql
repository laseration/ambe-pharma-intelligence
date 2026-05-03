-- CreateEnum
CREATE TYPE "PurchaseOrderImportStatus" AS ENUM ('COMPLETED', 'COMPLETED_WITH_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "PurchaseOrderLineStatus" AS ENUM ('IMPORTED', 'NEEDS_REVIEW', 'IGNORED');

-- CreateTable
CREATE TABLE "PurchaseOrderImport" (
    "id" TEXT NOT NULL,
    "status" "PurchaseOrderImportStatus" NOT NULL DEFAULT 'COMPLETED',
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "reviewRows" INTEGER NOT NULL DEFAULT 0,
    "ignoredRows" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "uploadedByType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "uploadedByIdentifier" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderImportId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "rawRow" JSONB NOT NULL,
    "poNumber" TEXT,
    "orderDate" TIMESTAMP(3),
    "supplierText" TEXT,
    "productText" TEXT,
    "manufacturerText" TEXT,
    "quantity" INTEGER,
    "unitPrice" DECIMAL(12,2),
    "currency" TEXT,
    "minimumOrderQuantity" INTEGER,
    "matchedProductId" TEXT,
    "matchedSupplierId" TEXT,
    "productMatchConfidence" INTEGER,
    "supplierMatchConfidence" INTEGER,
    "matchReason" TEXT,
    "matchEvidence" JSONB,
    "status" "PurchaseOrderLineStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderImport_status_uploadedAt_idx" ON "PurchaseOrderImport"("status", "uploadedAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderImportId_sourceRowNumber_idx" ON "PurchaseOrderLine"("purchaseOrderImportId", "sourceRowNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_matchedProductId_orderDate_idx" ON "PurchaseOrderLine"("matchedProductId", "orderDate");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_matchedSupplierId_orderDate_idx" ON "PurchaseOrderLine"("matchedSupplierId", "orderDate");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_status_createdAt_idx" ON "PurchaseOrderLine"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderImportId_fkey" FOREIGN KEY ("purchaseOrderImportId") REFERENCES "PurchaseOrderImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_matchedProductId_fkey" FOREIGN KEY ("matchedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_matchedSupplierId_fkey" FOREIGN KEY ("matchedSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
