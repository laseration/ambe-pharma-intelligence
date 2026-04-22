CREATE TYPE "OfferWorkflowStatus" AS ENUM (
  'NEW',
  'IN_REVIEW',
  'NEEDS_INFO',
  'APPROVED_TO_BUY',
  'REJECTED',
  'ORDERED',
  'CLOSED'
);

CREATE TYPE "OfferWorkflowPriority" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW'
);

CREATE TYPE "OfferWorkflowActionType" AS ENUM (
  'CREATED',
  'REOPENED',
  'ASSIGNED',
  'STARTED_REVIEW',
  'MARKED_NEEDS_INFO',
  'APPROVED_TO_BUY',
  'REJECTED',
  'MARKED_ORDERED',
  'CLOSED',
  'NOTE_ADDED',
  'AUTO_CLOSED'
);

CREATE TABLE "OfferWorkflowItem" (
  "id" TEXT NOT NULL,
  "emailDerivedOfferId" TEXT NOT NULL,
  "inboundEmailId" TEXT,
  "status" "OfferWorkflowStatus" NOT NULL DEFAULT 'NEW',
  "priority" "OfferWorkflowPriority" NOT NULL DEFAULT 'MEDIUM',
  "priorityReason" TEXT,
  "assigneeUserId" TEXT,
  "assigneeLabel" TEXT,
  "latestNote" TEXT,
  "sourceKind" TEXT,
  "sourceReviewReason" TEXT,
  "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
  "hasUnresolvedSupplier" BOOLEAN NOT NULL DEFAULT false,
  "hasConflictingSupplierCues" BOOLEAN NOT NULL DEFAULT false,
  "hasManufacturerAmbiguity" BOOLEAN NOT NULL DEFAULT false,
  "createdByType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "createdByIdentifier" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferWorkflowItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfferWorkflowEvent" (
  "id" TEXT NOT NULL,
  "workflowItemId" TEXT NOT NULL,
  "actionType" "OfferWorkflowActionType" NOT NULL,
  "previousStatus" "OfferWorkflowStatus",
  "newStatus" "OfferWorkflowStatus",
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferWorkflowEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfferWorkflowItem_emailDerivedOfferId_key"
ON "OfferWorkflowItem"("emailDerivedOfferId");

CREATE INDEX "OfferWorkflowItem_status_priority_createdAt_idx"
ON "OfferWorkflowItem"("status", "priority", "createdAt");

CREATE INDEX "OfferWorkflowItem_assigneeUserId_status_priority_idx"
ON "OfferWorkflowItem"("assigneeUserId", "status", "priority");

CREATE INDEX "OfferWorkflowItem_assigneeLabel_status_priority_idx"
ON "OfferWorkflowItem"("assigneeLabel", "status", "priority");

CREATE INDEX "OfferWorkflowItem_inboundEmailId_status_priority_idx"
ON "OfferWorkflowItem"("inboundEmailId", "status", "priority");

CREATE INDEX "OfferWorkflowEvent_workflowItemId_createdAt_idx"
ON "OfferWorkflowEvent"("workflowItemId", "createdAt");

ALTER TABLE "OfferWorkflowItem"
ADD CONSTRAINT "OfferWorkflowItem_emailDerivedOfferId_fkey"
FOREIGN KEY ("emailDerivedOfferId") REFERENCES "EmailDerivedOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferWorkflowItem"
ADD CONSTRAINT "OfferWorkflowItem_inboundEmailId_fkey"
FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OfferWorkflowItem"
ADD CONSTRAINT "OfferWorkflowItem_assigneeUserId_fkey"
FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OfferWorkflowEvent"
ADD CONSTRAINT "OfferWorkflowEvent_workflowItemId_fkey"
FOREIGN KEY ("workflowItemId") REFERENCES "OfferWorkflowItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
