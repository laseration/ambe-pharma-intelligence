/*
  Warnings:

  - A unique constraint covering the columns `[importBatchId]` on the table `SupplierPriceList` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `rawProductName` to the `InventorySnapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rawCustomerName` to the `SalesRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rawProductName` to the `SalesRecord` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('SUPPLIER_PRICE_LIST', 'INVENTORY', 'SALES');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- AlterTable
ALTER TABLE "InventorySnapshot" ADD COLUMN     "candidateFormulation" TEXT,
ADD COLUMN     "candidatePackSize" TEXT,
ADD COLUMN     "candidateStrength" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "normalizedProductName" TEXT,
ADD COLUMN     "rawProductName" TEXT NOT NULL,
ADD COLUMN     "rawRow" JSONB,
ADD COLUMN     "rawSupplierName" TEXT;

-- AlterTable
ALTER TABLE "SalesRecord" ADD COLUMN     "candidateFormulation" TEXT,
ADD COLUMN     "candidatePackSize" TEXT,
ADD COLUMN     "candidateStrength" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "normalizedProductName" TEXT,
ADD COLUMN     "rawCustomerName" TEXT NOT NULL,
ADD COLUMN     "rawProductName" TEXT NOT NULL,
ADD COLUMN     "rawRow" JSONB,
ADD COLUMN     "rawSupplierName" TEXT;

-- AlterTable
ALTER TABLE "SupplierPriceItem" ADD COLUMN     "candidateFormulation" TEXT,
ADD COLUMN     "candidatePackSize" TEXT,
ADD COLUMN     "candidateStrength" TEXT,
ADD COLUMN     "rawRow" JSONB;

-- AlterTable
ALTER TABLE "SupplierPriceList" ADD COLUMN     "fileMimeType" TEXT,
ADD COLUMN     "fileSizeBytes" INTEGER,
ADD COLUMN     "importBatchId" TEXT;

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'COMPLETED',
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "fieldName" TEXT,
    "message" TEXT NOT NULL,
    "rawRow" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_kind_uploadedAt_idx" ON "ImportBatch"("kind", "uploadedAt");

-- CreateIndex
CREATE INDEX "ImportError_importBatchId_rowNumber_idx" ON "ImportError"("importBatchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPriceList_importBatchId_key" ON "SupplierPriceList"("importBatchId");

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPriceList" ADD CONSTRAINT "SupplierPriceList_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
