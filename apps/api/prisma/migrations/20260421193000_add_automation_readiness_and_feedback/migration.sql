-- CreateEnum
CREATE TYPE "AutomationGlobalMode" AS ENUM (
  'OBSERVE_ONLY',
  'INTERNAL_SIGNALS_ONLY',
  'DRAFTS_ONLY',
  'ASSISTED_OUTREACH',
  'FULLY_BLOCKED'
);

-- CreateEnum
CREATE TYPE "AutomationReadinessActionType" AS ENUM (
  'CREATED',
  'UPDATED',
  'MODE_CHANGED',
  'SEND_BLOCKED',
  'SEND_ELIGIBILITY_CHANGED',
  'NOTE_ADDED'
);

-- CreateEnum
CREATE TYPE "OperatorFeedbackType" AS ENUM (
  'EXTRACTION',
  'SUPPLIER_RESOLUTION',
  'SIGNAL',
  'DEAL',
  'DRAFT'
);

-- CreateEnum
CREATE TYPE "OperatorFeedbackVerdict" AS ENUM (
  'CORRECT',
  'PARTIALLY_CORRECT',
  'INCORRECT',
  'USEFUL',
  'NOT_USEFUL',
  'SAFE',
  'POLICY_ISSUE'
);

-- CreateTable
CREATE TABLE "AutomationReadinessPolicy" (
  "id" TEXT NOT NULL,
  "scopeName" TEXT NOT NULL,
  "globalMode" "AutomationGlobalMode" NOT NULL DEFAULT 'INTERNAL_SIGNALS_ONLY',
  "allowInternalSignals" BOOLEAN NOT NULL DEFAULT true,
  "allowDraftGeneration" BOOLEAN NOT NULL DEFAULT true,
  "allowSupplierDraftApprovalFlow" BOOLEAN NOT NULL DEFAULT true,
  "allowBuyerDraftApprovalFlow" BOOLEAN NOT NULL DEFAULT true,
  "allowActualSend" BOOLEAN NOT NULL DEFAULT false,
  "requireHumanApprovalBeforeSend" BOOLEAN NOT NULL DEFAULT true,
  "minimumExtractionPrecisionPct" DECIMAL(8,4),
  "minimumSupplierResolutionPrecisionPct" DECIMAL(8,4),
  "minimumSignalAcceptancePct" DECIMAL(8,4),
  "minimumDraftPolicyPassPct" DECIMAL(8,4),
  "minimumSampleSize" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutomationReadinessPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationReadinessEvent" (
  "id" TEXT NOT NULL,
  "automationReadinessPolicyId" TEXT NOT NULL,
  "actionType" "AutomationReadinessActionType" NOT NULL,
  "previousGlobalMode" "AutomationGlobalMode",
  "newGlobalMode" "AutomationGlobalMode",
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutomationReadinessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorValidationFeedback" (
  "id" TEXT NOT NULL,
  "emailDerivedOfferId" TEXT,
  "offerWorkflowItemId" TEXT,
  "tradeOpportunityId" TEXT,
  "tradeMessageDraftId" TEXT,
  "feedbackType" "OperatorFeedbackType" NOT NULL,
  "verdict" "OperatorFeedbackVerdict" NOT NULL,
  "productTextCorrect" BOOLEAN,
  "priceCorrect" BOOLEAN,
  "currencyCorrect" BOOLEAN,
  "supplierCorrect" BOOLEAN,
  "manufacturerCorrect" BOOLEAN,
  "availabilityCorrect" BOOLEAN,
  "moqCorrect" BOOLEAN,
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "flags" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperatorValidationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationReadinessPolicy_scopeName_key" ON "AutomationReadinessPolicy"("scopeName");

-- CreateIndex
CREATE INDEX "AutomationReadinessEvent_automationReadinessPolicyId_createdAt_idx" ON "AutomationReadinessEvent"("automationReadinessPolicyId", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorValidationFeedback_feedbackType_createdAt_idx" ON "OperatorValidationFeedback"("feedbackType", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorValidationFeedback_emailDerivedOfferId_feedbackType_createdAt_idx" ON "OperatorValidationFeedback"("emailDerivedOfferId", "feedbackType", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorValidationFeedback_offerWorkflowItemId_feedbackType_createdAt_idx" ON "OperatorValidationFeedback"("offerWorkflowItemId", "feedbackType", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorValidationFeedback_tradeOpportunityId_feedbackType_createdAt_idx" ON "OperatorValidationFeedback"("tradeOpportunityId", "feedbackType", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorValidationFeedback_tradeMessageDraftId_feedbackType_createdAt_idx" ON "OperatorValidationFeedback"("tradeMessageDraftId", "feedbackType", "createdAt");

-- AddForeignKey
ALTER TABLE "AutomationReadinessEvent"
ADD CONSTRAINT "AutomationReadinessEvent_automationReadinessPolicyId_fkey"
FOREIGN KEY ("automationReadinessPolicyId") REFERENCES "AutomationReadinessPolicy"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorValidationFeedback"
ADD CONSTRAINT "OperatorValidationFeedback_emailDerivedOfferId_fkey"
FOREIGN KEY ("emailDerivedOfferId") REFERENCES "EmailDerivedOffer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorValidationFeedback"
ADD CONSTRAINT "OperatorValidationFeedback_offerWorkflowItemId_fkey"
FOREIGN KEY ("offerWorkflowItemId") REFERENCES "OfferWorkflowItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorValidationFeedback"
ADD CONSTRAINT "OperatorValidationFeedback_tradeOpportunityId_fkey"
FOREIGN KEY ("tradeOpportunityId") REFERENCES "TradeOpportunity"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorValidationFeedback"
ADD CONSTRAINT "OperatorValidationFeedback_tradeMessageDraftId_fkey"
FOREIGN KEY ("tradeMessageDraftId") REFERENCES "TradeMessageDraft"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
