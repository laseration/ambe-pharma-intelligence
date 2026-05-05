-- AlterTable
ALTER TABLE "BuyDecision" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BuyExecution" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmailDerivedOffer" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmailDerivedOfferEvidence" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmailExtractionRun" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EntityResolutionCandidate" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InboundEmail" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InboundEmailDocument" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OfferWorkflowItem" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PromotionDecision" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SupplierQualification" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TradeMessageDraft" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TradeOpportunity" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TradeOpportunityMessagingPolicy" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "AutomationReadinessEvent_automationReadinessPolicyId_createdAt_" RENAME TO "AutomationReadinessEvent_automationReadinessPolicyId_create_idx";

-- RenameIndex
ALTER INDEX "BuyExecution_productId_fulfillmentStatus_reconciliationStatus_i" RENAME TO "BuyExecution_productId_fulfillmentStatus_reconciliationStat_idx";

-- RenameIndex
ALTER INDEX "BuyExecution_supplierId_fulfillmentStatus_reconciliationStatus_" RENAME TO "BuyExecution_supplierId_fulfillmentStatus_reconciliationSta_idx";

-- RenameIndex
ALTER INDEX "EntityResolutionCandidate_emailDerivedOfferId_entityType_confid" RENAME TO "EntityResolutionCandidate_emailDerivedOfferId_entityType_co_idx";

-- RenameIndex
ALTER INDEX "OperatorValidationFeedback_emailDerivedOfferId_feedbackType_cre" RENAME TO "OperatorValidationFeedback_emailDerivedOfferId_feedbackType_idx";

-- RenameIndex
ALTER INDEX "OperatorValidationFeedback_offerWorkflowItemId_feedbackType_cre" RENAME TO "OperatorValidationFeedback_offerWorkflowItemId_feedbackType_idx";

-- RenameIndex
ALTER INDEX "OperatorValidationFeedback_tradeMessageDraftId_feedbackType_cre" RENAME TO "OperatorValidationFeedback_tradeMessageDraftId_feedbackType_idx";

-- RenameIndex
ALTER INDEX "OperatorValidationFeedback_tradeOpportunityId_feedbackType_crea" RENAME TO "OperatorValidationFeedback_tradeOpportunityId_feedbackType__idx";

-- RenameIndex
ALTER INDEX "SourceReliabilityProfile_templateFingerprint_reliabilityTier_id" RENAME TO "SourceReliabilityProfile_templateFingerprint_reliabilityTie_idx";

-- RenameIndex
ALTER INDEX "SupplierQualification_qualificationStatus_trustTier_updatedAt_i" RENAME TO "SupplierQualification_qualificationStatus_trustTier_updated_idx";

-- RenameIndex
ALTER INDEX "SupplierQualificationEvent_supplierQualificationId_createdAt_id" RENAME TO "SupplierQualificationEvent_supplierQualificationId_createdA_idx";

-- RenameIndex
ALTER INDEX "TradeMessageDraft_tradeOpportunityId_direction_status_updatedAt" RENAME TO "TradeMessageDraft_tradeOpportunityId_direction_status_updat_idx";

-- RenameIndex
ALTER INDEX "TradeMessageDraft_tradeOpportunityId_messagePurpose_updatedAt_i" RENAME TO "TradeMessageDraft_tradeOpportunityId_messagePurpose_updated_idx";
