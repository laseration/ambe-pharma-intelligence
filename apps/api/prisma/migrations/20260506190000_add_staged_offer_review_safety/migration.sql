-- CreateEnum
CREATE TYPE "PolicyCheckScope" AS ENUM ('STAGED_OFFER', 'OUTBOUND_DRAFT');

-- CreateEnum
CREATE TYPE "PolicyCheckStatus" AS ENUM ('PASSED', 'FINDINGS', 'BLOCKED');

-- AlterTable
ALTER TABLE "EmailDerivedOffer"
ADD COLUMN "confidenceBreakdown" JSONB,
ADD COLUMN "confidenceExplanation" TEXT,
ADD COLUMN "promotionBlockers" JSONB,
ADD COLUMN "policyCheckSummary" JSONB;

-- AlterTable
ALTER TABLE "EmailDerivedOfferEvidence"
ADD COLUMN "extractionRunId" TEXT,
ADD COLUMN "fieldValue" TEXT,
ADD COLUMN "normalizedValue" TEXT,
ADD COLUMN "extractionMethod" TEXT,
ADD COLUMN "extractorVersion" TEXT,
ADD COLUMN "evidenceFingerprint" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedByType" TEXT,
ADD COLUMN "reviewedByIdentifier" TEXT;

-- CreateTable
CREATE TABLE "PolicyCheckResult" (
    "id" TEXT NOT NULL,
    "scope" "PolicyCheckScope" NOT NULL,
    "status" "PolicyCheckStatus" NOT NULL,
    "inboundEmailId" TEXT,
    "emailDerivedOfferId" TEXT,
    "tradeMessageDraftId" TEXT,
    "checkType" TEXT NOT NULL,
    "findings" JSONB,
    "blockingFindingCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "checkedByType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "checkedByIdentifier" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyCheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailDerivedOfferEvidence_extractionRunId_idx" ON "EmailDerivedOfferEvidence"("extractionRunId");

-- CreateIndex
CREATE INDEX "EmailDerivedOfferEvidence_emailDerivedOfferId_evidenceFingerprint_idx" ON "EmailDerivedOfferEvidence"("emailDerivedOfferId", "evidenceFingerprint");

-- CreateIndex
CREATE INDEX "PolicyCheckResult_scope_status_createdAt_idx" ON "PolicyCheckResult"("scope", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyCheckResult_inboundEmailId_createdAt_idx" ON "PolicyCheckResult"("inboundEmailId", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyCheckResult_emailDerivedOfferId_createdAt_idx" ON "PolicyCheckResult"("emailDerivedOfferId", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyCheckResult_tradeMessageDraftId_createdAt_idx" ON "PolicyCheckResult"("tradeMessageDraftId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailDerivedOfferEvidence" ADD CONSTRAINT "EmailDerivedOfferEvidence_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "EmailExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCheckResult" ADD CONSTRAINT "PolicyCheckResult_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCheckResult" ADD CONSTRAINT "PolicyCheckResult_emailDerivedOfferId_fkey" FOREIGN KEY ("emailDerivedOfferId") REFERENCES "EmailDerivedOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCheckResult" ADD CONSTRAINT "PolicyCheckResult_tradeMessageDraftId_fkey" FOREIGN KEY ("tradeMessageDraftId") REFERENCES "TradeMessageDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
