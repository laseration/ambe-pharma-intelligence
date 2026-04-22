CREATE TYPE "BuyExecutionFulfillmentStatus" AS ENUM (
  'NOT_STARTED',
  'ORDER_PLACED',
  'ORDER_CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED'
);

CREATE TYPE "BuyExecutionReconciliationStatus" AS ENUM (
  'NOT_RECONCILED',
  'MATCHED',
  'PRICE_DRIFT',
  'QUANTITY_DRIFT',
  'CURRENCY_MISMATCH',
  'REQUIRES_REVIEW'
);

CREATE TYPE "BuyExecutionActionType" AS ENUM (
  'CREATED',
  'ORDER_PLACED',
  'ORDER_CONFIRMED',
  'RECEIVED',
  'PARTIALLY_RECEIVED',
  'INVOICE_RECORDED',
  'CANCELLED',
  'RECONCILED',
  'NOTE_ADDED',
  'UPDATED_REFERENCE'
);

CREATE TABLE "BuyExecution" (
  "id" TEXT NOT NULL,
  "buyDecisionId" TEXT NOT NULL,
  "supplierId" TEXT,
  "productId" TEXT,
  "orderedQuantity" INTEGER,
  "orderedUnitPrice" DECIMAL(12,2),
  "orderedCurrencyCode" TEXT,
  "orderedMinimumOrderQuantity" INTEGER,
  "confirmedAvailability" BOOLEAN,
  "externalOrderReference" TEXT,
  "orderPlacedAt" TIMESTAMP(3),
  "orderConfirmedAt" TIMESTAMP(3),
  "expectedDeliveryDate" TIMESTAMP(3),
  "receivedQuantity" INTEGER,
  "receivedAt" TIMESTAMP(3),
  "invoicedUnitPrice" DECIMAL(12,2),
  "invoicedCurrencyCode" TEXT,
  "invoiceReference" TEXT,
  "invoicedAt" TIMESTAMP(3),
  "fulfillmentStatus" "BuyExecutionFulfillmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "reconciliationStatus" "BuyExecutionReconciliationStatus" NOT NULL DEFAULT 'NOT_RECONCILED',
  "hasPriceDrift" BOOLEAN NOT NULL DEFAULT false,
  "hasQuantityDrift" BOOLEAN NOT NULL DEFAULT false,
  "hasCurrencyMismatch" BOOLEAN NOT NULL DEFAULT false,
  "hasAvailabilityDrift" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BuyExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuyExecutionEvent" (
  "id" TEXT NOT NULL,
  "buyExecutionId" TEXT NOT NULL,
  "actionType" "BuyExecutionActionType" NOT NULL,
  "previousFulfillmentStatus" "BuyExecutionFulfillmentStatus",
  "newFulfillmentStatus" "BuyExecutionFulfillmentStatus",
  "previousReconciliationStatus" "BuyExecutionReconciliationStatus",
  "newReconciliationStatus" "BuyExecutionReconciliationStatus",
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BuyExecutionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyExecution_buyDecisionId_key"
ON "BuyExecution"("buyDecisionId");

CREATE INDEX "BuyExecution_fulfillmentStatus_orderPlacedAt_idx"
ON "BuyExecution"("fulfillmentStatus", "orderPlacedAt");

CREATE INDEX "BuyExecution_reconciliationStatus_updatedAt_idx"
ON "BuyExecution"("reconciliationStatus", "updatedAt");

CREATE INDEX "BuyExecution_supplierId_fulfillmentStatus_reconciliationStatus_idx"
ON "BuyExecution"("supplierId", "fulfillmentStatus", "reconciliationStatus");

CREATE INDEX "BuyExecution_productId_fulfillmentStatus_reconciliationStatus_idx"
ON "BuyExecution"("productId", "fulfillmentStatus", "reconciliationStatus");

CREATE INDEX "BuyExecutionEvent_buyExecutionId_createdAt_idx"
ON "BuyExecutionEvent"("buyExecutionId", "createdAt");

ALTER TABLE "BuyExecution"
ADD CONSTRAINT "BuyExecution_buyDecisionId_fkey"
FOREIGN KEY ("buyDecisionId") REFERENCES "BuyDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BuyExecution"
ADD CONSTRAINT "BuyExecution_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyExecution"
ADD CONSTRAINT "BuyExecution_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyExecutionEvent"
ADD CONSTRAINT "BuyExecutionEvent_buyExecutionId_fkey"
FOREIGN KEY ("buyExecutionId") REFERENCES "BuyExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
