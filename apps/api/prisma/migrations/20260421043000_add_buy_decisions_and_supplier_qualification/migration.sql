CREATE TYPE "BuyDecisionApprovalStatus" AS ENUM (
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "BuyDecisionOrderStatus" AS ENUM (
  'NOT_ORDERED',
  'ORDERED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'CANCELLED'
);

CREATE TYPE "BuyDecisionActionType" AS ENUM (
  'CREATED',
  'APPROVED',
  'REJECTED',
  'MARKED_ORDERED',
  'MARKED_PARTIALLY_FULFILLED',
  'MARKED_FULFILLED',
  'CANCELLED',
  'NOTE_ADDED',
  'UPDATED_REFERENCE'
);

CREATE TYPE "SupplierQualificationStatus" AS ENUM (
  'UNKNOWN',
  'PENDING_REVIEW',
  'APPROVED',
  'RESTRICTED',
  'BLOCKED'
);

CREATE TYPE "SupplierTrustTier" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW'
);

CREATE TYPE "SupplierQualificationActionType" AS ENUM (
  'CREATED',
  'REVIEWED',
  'APPROVED',
  'RESTRICTED',
  'BLOCKED',
  'EXPIRED',
  'NOTE_ADDED'
);

ALTER TABLE "OfferWorkflowItem"
ADD COLUMN "supplierQualificationStatus" "SupplierQualificationStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "hasUnknownSupplierQualification" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "hasRestrictedSupplier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasBlockedSupplier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "qualificationRiskNote" TEXT;

CREATE TABLE "SupplierQualification" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "qualificationStatus" "SupplierQualificationStatus" NOT NULL DEFAULT 'UNKNOWN',
  "trustTier" "SupplierTrustTier" NOT NULL DEFAULT 'LOW',
  "qualificationNote" TEXT,
  "lastReviewedAt" TIMESTAMP(3),
  "reviewedByType" TEXT,
  "reviewedByIdentifier" TEXT,
  "expiresAt" TIMESTAMP(3),
  "requiresManualApproval" BOOLEAN NOT NULL DEFAULT true,
  "canAutoApproveBuyDecisions" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupplierQualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierQualificationEvent" (
  "id" TEXT NOT NULL,
  "supplierQualificationId" TEXT NOT NULL,
  "actionType" "SupplierQualificationActionType" NOT NULL,
  "previousStatus" "SupplierQualificationStatus",
  "newStatus" "SupplierQualificationStatus",
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupplierQualificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuyDecision" (
  "id" TEXT NOT NULL,
  "emailDerivedOfferId" TEXT NOT NULL,
  "offerWorkflowItemId" TEXT,
  "inboundEmailId" TEXT,
  "supplierId" TEXT,
  "productId" TEXT,
  "rawProductText" TEXT,
  "normalizedProductNameCandidate" TEXT,
  "manufacturerCandidate" TEXT,
  "quotedUnitPrice" DECIMAL(12,2),
  "quotedCurrencyCode" TEXT,
  "quotedMinimumOrderQuantity" INTEGER,
  "quotedAvailability" TEXT,
  "sourceKind" TEXT,
  "sourceBlockText" TEXT,
  "supplierQualificationStatus" "SupplierQualificationStatus" NOT NULL DEFAULT 'UNKNOWN',
  "hasQualificationRisk" BOOLEAN NOT NULL DEFAULT true,
  "qualificationRiskNote" TEXT,
  "approvalStatus" "BuyDecisionApprovalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approvalNote" TEXT,
  "approvedByType" TEXT,
  "approvedByIdentifier" TEXT,
  "approvedAt" TIMESTAMP(3),
  "orderStatus" "BuyDecisionOrderStatus" NOT NULL DEFAULT 'NOT_ORDERED',
  "orderedAt" TIMESTAMP(3),
  "externalOrderReference" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BuyDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuyDecisionEvent" (
  "id" TEXT NOT NULL,
  "buyDecisionId" TEXT NOT NULL,
  "actionType" "BuyDecisionActionType" NOT NULL,
  "previousApprovalStatus" "BuyDecisionApprovalStatus",
  "newApprovalStatus" "BuyDecisionApprovalStatus",
  "previousOrderStatus" "BuyDecisionOrderStatus",
  "newOrderStatus" "BuyDecisionOrderStatus",
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BuyDecisionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierQualification_supplierId_key"
ON "SupplierQualification"("supplierId");

CREATE INDEX "SupplierQualification_qualificationStatus_trustTier_updatedAt_idx"
ON "SupplierQualification"("qualificationStatus", "trustTier", "updatedAt");

CREATE INDEX "SupplierQualificationEvent_supplierQualificationId_createdAt_idx"
ON "SupplierQualificationEvent"("supplierQualificationId", "createdAt");

CREATE UNIQUE INDEX "BuyDecision_emailDerivedOfferId_key"
ON "BuyDecision"("emailDerivedOfferId");

CREATE UNIQUE INDEX "BuyDecision_offerWorkflowItemId_key"
ON "BuyDecision"("offerWorkflowItemId");

CREATE INDEX "BuyDecision_approvalStatus_approvedAt_idx"
ON "BuyDecision"("approvalStatus", "approvedAt");

CREATE INDEX "BuyDecision_orderStatus_orderedAt_idx"
ON "BuyDecision"("orderStatus", "orderedAt");

CREATE INDEX "BuyDecision_supplierId_approvalStatus_orderStatus_idx"
ON "BuyDecision"("supplierId", "approvalStatus", "orderStatus");

CREATE INDEX "BuyDecision_productId_approvalStatus_orderStatus_idx"
ON "BuyDecision"("productId", "approvalStatus", "orderStatus");

CREATE INDEX "BuyDecisionEvent_buyDecisionId_createdAt_idx"
ON "BuyDecisionEvent"("buyDecisionId", "createdAt");

ALTER TABLE "SupplierQualification"
ADD CONSTRAINT "SupplierQualification_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierQualificationEvent"
ADD CONSTRAINT "SupplierQualificationEvent_supplierQualificationId_fkey"
FOREIGN KEY ("supplierQualificationId") REFERENCES "SupplierQualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BuyDecision"
ADD CONSTRAINT "BuyDecision_emailDerivedOfferId_fkey"
FOREIGN KEY ("emailDerivedOfferId") REFERENCES "EmailDerivedOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BuyDecision"
ADD CONSTRAINT "BuyDecision_offerWorkflowItemId_fkey"
FOREIGN KEY ("offerWorkflowItemId") REFERENCES "OfferWorkflowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyDecision"
ADD CONSTRAINT "BuyDecision_inboundEmailId_fkey"
FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyDecision"
ADD CONSTRAINT "BuyDecision_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyDecision"
ADD CONSTRAINT "BuyDecision_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyDecisionEvent"
ADD CONSTRAINT "BuyDecisionEvent_buyDecisionId_fkey"
FOREIGN KEY ("buyDecisionId") REFERENCES "BuyDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
