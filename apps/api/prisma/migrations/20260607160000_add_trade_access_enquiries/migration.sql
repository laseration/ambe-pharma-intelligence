-- Conservative B2B RFQ intake and internal-only supplier draft opportunities.
CREATE TYPE "BuyerTradeEnquiryStatus" AS ENUM (
  'NEW',
  'REVIEWING',
  'MATCHED',
  'QUOTED',
  'CLOSED',
  'REJECTED',
  'DUPLICATE',
  'SPAM',
  'ARCHIVED'
);

CREATE TYPE "BuyerTradeEnquiryPriority" AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT'
);

CREATE TYPE "SupplierDraftOpportunityStatus" AS ENUM (
  'DRAFT',
  'REVIEWING',
  'APPROVED_INTERNAL',
  'REJECTED'
);

CREATE TABLE "BuyerTradeEnquiry" (
  "id" TEXT NOT NULL,
  "status" "BuyerTradeEnquiryStatus" NOT NULL DEFAULT 'NEW',
  "priority" "BuyerTradeEnquiryPriority" NOT NULL DEFAULT 'NORMAL',
  "companyName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT,
  "businessType" TEXT,
  "country" TEXT,
  "productName" TEXT NOT NULL,
  "strength" TEXT,
  "packSize" TEXT,
  "quantityRequired" TEXT,
  "targetMarket" TEXT,
  "requiredBy" TIMESTAMP(3),
  "documentationNotes" TEXT,
  "additionalNotes" TEXT,
  "source" TEXT NOT NULL DEFAULT 'PUBLIC_TRADE_ACCESS',
  "reviewNotes" TEXT,
  "statusUpdatedAt" TIMESTAMP(3),
  "statusUpdatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BuyerTradeEnquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierDraftOpportunity" (
  "id" TEXT NOT NULL,
  "status" "SupplierDraftOpportunityStatus" NOT NULL DEFAULT 'DRAFT',
  "productName" TEXT NOT NULL,
  "strength" TEXT,
  "packSize" TEXT,
  "quantity" TEXT,
  "expiry" TIMESTAMP(3),
  "storage" TEXT,
  "country" TEXT,
  "supplierPrice" DECIMAL(12,2),
  "currencyCode" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expiryWarning" TEXT,
  "reviewWarning" TEXT,
  "warnings" JSONB,
  "rawRow" JSONB,
  "sourceType" TEXT NOT NULL DEFAULT 'SUPPLIER_LIST_IMPORT',
  "sourceImportBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupplierDraftOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BuyerTradeEnquiry_status_priority_createdAt_idx"
  ON "BuyerTradeEnquiry"("status", "priority", "createdAt");

CREATE INDEX "BuyerTradeEnquiry_contactEmail_createdAt_idx"
  ON "BuyerTradeEnquiry"("contactEmail", "createdAt");

CREATE INDEX "BuyerTradeEnquiry_companyName_createdAt_idx"
  ON "BuyerTradeEnquiry"("companyName", "createdAt");

CREATE INDEX "SupplierDraftOpportunity_status_createdAt_idx"
  ON "SupplierDraftOpportunity"("status", "createdAt");

CREATE INDEX "SupplierDraftOpportunity_sourceImportBatchId_idx"
  ON "SupplierDraftOpportunity"("sourceImportBatchId");
