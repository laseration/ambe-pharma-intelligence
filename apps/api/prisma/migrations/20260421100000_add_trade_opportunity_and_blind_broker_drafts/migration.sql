CREATE TYPE "TradeOpportunityStatus" AS ENUM (
  'OPEN',
  'ON_HOLD',
  'DROPPED',
  'WON',
  'LOST'
);

CREATE TYPE "TradeOpportunityStage" AS ENUM (
  'NEW',
  'REVIEW',
  'READY_FOR_SUPPLIER_OUTREACH',
  'READY_FOR_BUY',
  'BUY_APPROVED',
  'BUY_ORDERED',
  'READY_FOR_BUYER_OUTREACH',
  'BUYER_CONTACTED',
  'NEGOTIATING',
  'DEAL_CONFIRMED',
  'CLOSED'
);

CREATE TYPE "TradeOpportunitySourceType" AS ENUM (
  'EMAIL_DERIVED_OFFER',
  'WORKFLOW_ITEM',
  'BUY_DECISION',
  'OPERATOR_CREATED'
);

CREATE TYPE "TradeOpportunityActionType" AS ENUM (
  'CREATED',
  'UPDATED',
  'STAGE_CHANGED',
  'STATUS_CHANGED',
  'SUPPLIER_OUTREACH_DRAFTED',
  'BUYER_OUTREACH_DRAFTED',
  'BUY_APPROVAL_LINKED',
  'BUY_ORDER_LINKED',
  'MARKED_NEGOTIATING',
  'WON',
  'LOST',
  'DROPPED',
  'NOTE_ADDED'
);

CREATE TYPE "TradeMessageDraftDirection" AS ENUM (
  'TO_SUPPLIER',
  'TO_BUYER',
  'INTERNAL'
);

CREATE TYPE "TradeMessageDraftStatus" AS ENUM (
  'DRAFT',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'SENT',
  'CANCELLED'
);

CREATE TYPE "TradeMessagePurpose" AS ENUM (
  'INITIAL_BUYER_OFFER',
  'INITIAL_SUPPLIER_ENQUIRY',
  'PRICE_CONFIRMATION',
  'AVAILABILITY_CHECK',
  'NEGOTIATION_REPLY',
  'INTERNAL_SUMMARY'
);

CREATE TABLE "TradeOpportunity" (
  "id" TEXT NOT NULL,
  "status" "TradeOpportunityStatus" NOT NULL DEFAULT 'OPEN',
  "stage" "TradeOpportunityStage" NOT NULL DEFAULT 'NEW',
  "sourceType" "TradeOpportunitySourceType" NOT NULL,
  "emailDerivedOfferId" TEXT,
  "offerWorkflowItemId" TEXT,
  "inboundEmailId" TEXT,
  "buyDecisionId" TEXT,
  "buyExecutionId" TEXT,
  "supplierId" TEXT,
  "productId" TEXT,
  "ownerUserId" TEXT,
  "rawProductText" TEXT,
  "normalizedProductNameCandidate" TEXT,
  "manufacturerCandidate" TEXT,
  "sourceSupplierNameSnapshot" TEXT,
  "targetBuyerNameSnapshot" TEXT,
  "targetBuyerCompanySnapshot" TEXT,
  "supplierQualificationStatusSnapshot" "SupplierQualificationStatus" NOT NULL DEFAULT 'UNKNOWN',
  "quotedBuyUnitPrice" DECIMAL(12,2),
  "quotedBuyCurrencyCode" TEXT,
  "quotedBuyMinimumOrderQuantity" INTEGER,
  "quotedAvailability" TEXT,
  "targetSellUnitPrice" DECIMAL(12,2),
  "targetSellCurrencyCode" TEXT,
  "minimumMarginAmount" DECIMAL(12,2),
  "minimumMarginPct" DECIMAL(8,4),
  "estimatedMarginAmount" DECIMAL(12,2),
  "estimatedMarginPct" DECIMAL(8,4),
  "quantityTarget" INTEGER,
  "rationale" TEXT,
  "riskFlags" JSONB,
  "hasQualificationBlock" BOOLEAN NOT NULL DEFAULT false,
  "isMarginFloorMet" BOOLEAN NOT NULL DEFAULT false,
  "isActionable" BOOLEAN NOT NULL DEFAULT false,
  "hasMessagingPolicyViolations" BOOLEAN NOT NULL DEFAULT false,
  "messagingPolicyViolationCount" INTEGER NOT NULL DEFAULT 0,
  "ownerLabel" TEXT,
  "createdByType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "createdByIdentifier" TEXT,
  "closeReason" TEXT,
  "metadata" JSONB,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TradeOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradeOpportunityEvent" (
  "id" TEXT NOT NULL,
  "tradeOpportunityId" TEXT NOT NULL,
  "actionType" "TradeOpportunityActionType" NOT NULL,
  "previousStatus" "TradeOpportunityStatus",
  "newStatus" "TradeOpportunityStatus",
  "previousStage" "TradeOpportunityStage",
  "newStage" "TradeOpportunityStage",
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TradeOpportunityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradeOpportunityMessagingPolicy" (
  "id" TEXT NOT NULL,
  "tradeOpportunityId" TEXT NOT NULL,
  "allowSupplierOutreachDrafts" BOOLEAN NOT NULL DEFAULT true,
  "allowBuyerOutreachDrafts" BOOLEAN NOT NULL DEFAULT true,
  "blockSupplierIdentityLeak" BOOLEAN NOT NULL DEFAULT true,
  "blockBuyerIdentityLeak" BOOLEAN NOT NULL DEFAULT true,
  "requireHumanApprovalBeforeSend" BOOLEAN NOT NULL DEFAULT true,
  "allowedMessageTypes" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TradeOpportunityMessagingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradeMessageDraft" (
  "id" TEXT NOT NULL,
  "tradeOpportunityId" TEXT NOT NULL,
  "direction" "TradeMessageDraftDirection" NOT NULL,
  "status" "TradeMessageDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "audienceLabel" TEXT,
  "recipientNameSnapshot" TEXT,
  "recipientCompanySnapshot" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "messagePurpose" "TradeMessagePurpose" NOT NULL,
  "policyFlags" JSONB,
  "policyViolations" JSONB,
  "contentHash" TEXT,
  "containsSupplierIdentity" BOOLEAN NOT NULL DEFAULT false,
  "containsBuyerIdentity" BOOLEAN NOT NULL DEFAULT false,
  "containsExternalContactDetails" BOOLEAN NOT NULL DEFAULT false,
  "containsForwardedContent" BOOLEAN NOT NULL DEFAULT false,
  "approvedByType" TEXT,
  "approvedByIdentifier" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TradeMessageDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TradeOpportunityMessagingPolicy_tradeOpportunityId_key"
ON "TradeOpportunityMessagingPolicy"("tradeOpportunityId");

CREATE INDEX "TradeOpportunity_status_stage_updatedAt_idx"
ON "TradeOpportunity"("status", "stage", "updatedAt");

CREATE INDEX "TradeOpportunity_emailDerivedOfferId_status_stage_idx"
ON "TradeOpportunity"("emailDerivedOfferId", "status", "stage");

CREATE INDEX "TradeOpportunity_offerWorkflowItemId_status_stage_idx"
ON "TradeOpportunity"("offerWorkflowItemId", "status", "stage");

CREATE INDEX "TradeOpportunity_buyDecisionId_status_stage_idx"
ON "TradeOpportunity"("buyDecisionId", "status", "stage");

CREATE INDEX "TradeOpportunity_buyExecutionId_status_stage_idx"
ON "TradeOpportunity"("buyExecutionId", "status", "stage");

CREATE INDEX "TradeOpportunity_supplierId_status_stage_idx"
ON "TradeOpportunity"("supplierId", "status", "stage");

CREATE INDEX "TradeOpportunity_productId_status_stage_idx"
ON "TradeOpportunity"("productId", "status", "stage");

CREATE INDEX "TradeOpportunityEvent_tradeOpportunityId_createdAt_idx"
ON "TradeOpportunityEvent"("tradeOpportunityId", "createdAt");

CREATE INDEX "TradeMessageDraft_tradeOpportunityId_direction_status_updatedAt_idx"
ON "TradeMessageDraft"("tradeOpportunityId", "direction", "status", "updatedAt");

CREATE INDEX "TradeMessageDraft_tradeOpportunityId_messagePurpose_updatedAt_idx"
ON "TradeMessageDraft"("tradeOpportunityId", "messagePurpose", "updatedAt");

ALTER TABLE "TradeOpportunity"
ADD CONSTRAINT "TradeOpportunity_emailDerivedOfferId_fkey"
FOREIGN KEY ("emailDerivedOfferId") REFERENCES "EmailDerivedOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeOpportunity"
ADD CONSTRAINT "TradeOpportunity_offerWorkflowItemId_fkey"
FOREIGN KEY ("offerWorkflowItemId") REFERENCES "OfferWorkflowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeOpportunity"
ADD CONSTRAINT "TradeOpportunity_inboundEmailId_fkey"
FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeOpportunity"
ADD CONSTRAINT "TradeOpportunity_buyDecisionId_fkey"
FOREIGN KEY ("buyDecisionId") REFERENCES "BuyDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeOpportunity"
ADD CONSTRAINT "TradeOpportunity_buyExecutionId_fkey"
FOREIGN KEY ("buyExecutionId") REFERENCES "BuyExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeOpportunity"
ADD CONSTRAINT "TradeOpportunity_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeOpportunity"
ADD CONSTRAINT "TradeOpportunity_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeOpportunity"
ADD CONSTRAINT "TradeOpportunity_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeOpportunityEvent"
ADD CONSTRAINT "TradeOpportunityEvent_tradeOpportunityId_fkey"
FOREIGN KEY ("tradeOpportunityId") REFERENCES "TradeOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeOpportunityMessagingPolicy"
ADD CONSTRAINT "TradeOpportunityMessagingPolicy_tradeOpportunityId_fkey"
FOREIGN KEY ("tradeOpportunityId") REFERENCES "TradeOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeMessageDraft"
ADD CONSTRAINT "TradeMessageDraft_tradeOpportunityId_fkey"
FOREIGN KEY ("tradeOpportunityId") REFERENCES "TradeOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
