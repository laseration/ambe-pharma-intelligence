CREATE TYPE "InboundEmailProcessingStatus" AS ENUM (
  'RECEIVED',
  'TRIAGED',
  'EXTRACTED',
  'STAGED',
  'AUTO_PROMOTED',
  'REVIEW_REQUIRED',
  'REJECTED',
  'FAILED'
);

CREATE TYPE "InboundEmailDocumentKind" AS ENUM (
  'SUBJECT',
  'BODY_MAIN',
  'BODY_FORWARDED',
  'SIGNATURE',
  'DISCLAIMER',
  'ATTACHMENT_TEXT',
  'ATTACHMENT_TABLE'
);

CREATE TYPE "EmailExtractionMethod" AS ENUM (
  'DETERMINISTIC',
  'AI_FALLBACK'
);

CREATE TYPE "EmailExtractionRunStatus" AS ENUM (
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED'
);

CREATE TYPE "EmailDerivedOfferStatus" AS ENUM (
  'STAGED',
  'AUTO_PROMOTED',
  'REVIEW_REQUIRED',
  'REJECTED'
);

CREATE TYPE "EntityResolutionType" AS ENUM (
  'PRODUCT',
  'SUPPLIER',
  'MANUFACTURER'
);

CREATE TYPE "PromotionDecisionStatus" AS ENUM (
  'AUTO_PROMOTED',
  'REVIEW_REQUIRED',
  'REJECTED'
);

CREATE TABLE "InboundEmail" (
  "id" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL DEFAULT 'MICROSOFT_GRAPH',
  "externalMessageId" TEXT,
  "internetMessageId" TEXT,
  "conversationId" TEXT,
  "fromEmail" TEXT NOT NULL,
  "fromName" TEXT,
  "subject" TEXT,
  "rawHtml" TEXT,
  "rawText" TEXT,
  "bodyHash" TEXT,
  "attachmentSummary" JSONB,
  "processingStatus" "InboundEmailProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "triageStatus" TEXT,
  "sourceTrustScore" INTEGER,
  "structureConfidence" INTEGER,
  "businessWorthinessScore" INTEGER,
  "parserConfidence" TEXT,
  "reviewReason" TEXT,
  "receivedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundEmailDocument" (
  "id" TEXT NOT NULL,
  "inboundEmailId" TEXT NOT NULL,
  "kind" "InboundEmailDocumentKind" NOT NULL,
  "documentIndex" INTEGER NOT NULL,
  "label" TEXT,
  "textContent" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InboundEmailDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailExtractionRun" (
  "id" TEXT NOT NULL,
  "inboundEmailId" TEXT NOT NULL,
  "method" "EmailExtractionMethod" NOT NULL,
  "status" "EmailExtractionRunStatus" NOT NULL DEFAULT 'COMPLETED',
  "extractorVersion" TEXT NOT NULL,
  "aiPromptVersion" TEXT,
  "requestId" TEXT,
  "notes" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailExtractionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailDerivedOffer" (
  "id" TEXT NOT NULL,
  "inboundEmailId" TEXT NOT NULL,
  "extractionRunId" TEXT,
  "sourceDocumentId" TEXT,
  "status" "EmailDerivedOfferStatus" NOT NULL DEFAULT 'STAGED',
  "sourceKind" TEXT NOT NULL,
  "sourceBlockText" TEXT NOT NULL,
  "rawProductText" TEXT,
  "normalizedProductNameCandidate" TEXT,
  "strengthCandidate" TEXT,
  "dosageFormCandidate" TEXT,
  "packSizeCandidate" TEXT,
  "manufacturerCandidate" TEXT,
  "supplierCandidate" TEXT,
  "priceCandidate" DECIMAL(12,2),
  "currencyCandidate" TEXT,
  "minimumOrderQuantityCandidate" INTEGER,
  "availabilityCandidate" TEXT,
  "sourceTrustScore" INTEGER,
  "structureConfidence" INTEGER,
  "fieldConfidence" INTEGER,
  "entityResolutionConfidence" INTEGER,
  "promotionConfidence" INTEGER,
  "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
  "reviewReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailDerivedOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailDerivedOfferEvidence" (
  "id" TEXT NOT NULL,
  "emailDerivedOfferId" TEXT NOT NULL,
  "sourceDocumentId" TEXT,
  "fieldName" TEXT NOT NULL,
  "evidenceType" TEXT NOT NULL,
  "rawText" TEXT NOT NULL,
  "startOffset" INTEGER,
  "endOffset" INTEGER,
  "confidence" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailDerivedOfferEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntityResolutionCandidate" (
  "id" TEXT NOT NULL,
  "emailDerivedOfferId" TEXT NOT NULL,
  "entityType" "EntityResolutionType" NOT NULL,
  "candidateId" TEXT,
  "candidateName" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EntityResolutionCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionDecision" (
  "id" TEXT NOT NULL,
  "inboundEmailId" TEXT,
  "emailDerivedOfferId" TEXT,
  "status" "PromotionDecisionStatus" NOT NULL,
  "decidedByType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "reason" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromotionDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundEmail_sourceSystem_externalMessageId_key"
ON "InboundEmail"("sourceSystem", "externalMessageId");

CREATE INDEX "InboundEmail_fromEmail_createdAt_idx"
ON "InboundEmail"("fromEmail", "createdAt");

CREATE INDEX "InboundEmail_processingStatus_createdAt_idx"
ON "InboundEmail"("processingStatus", "createdAt");

CREATE INDEX "InboundEmailDocument_inboundEmailId_kind_documentIndex_idx"
ON "InboundEmailDocument"("inboundEmailId", "kind", "documentIndex");

CREATE INDEX "EmailExtractionRun_inboundEmailId_method_createdAt_idx"
ON "EmailExtractionRun"("inboundEmailId", "method", "createdAt");

CREATE INDEX "EmailDerivedOffer_inboundEmailId_status_createdAt_idx"
ON "EmailDerivedOffer"("inboundEmailId", "status", "createdAt");

CREATE INDEX "EmailDerivedOffer_sourceDocumentId_idx"
ON "EmailDerivedOffer"("sourceDocumentId");

CREATE INDEX "EmailDerivedOfferEvidence_emailDerivedOfferId_fieldName_idx"
ON "EmailDerivedOfferEvidence"("emailDerivedOfferId", "fieldName");

CREATE INDEX "EmailDerivedOfferEvidence_sourceDocumentId_idx"
ON "EmailDerivedOfferEvidence"("sourceDocumentId");

CREATE INDEX "EntityResolutionCandidate_emailDerivedOfferId_entityType_confidence_idx"
ON "EntityResolutionCandidate"("emailDerivedOfferId", "entityType", "confidence");

CREATE INDEX "PromotionDecision_inboundEmailId_status_createdAt_idx"
ON "PromotionDecision"("inboundEmailId", "status", "createdAt");

CREATE INDEX "PromotionDecision_emailDerivedOfferId_status_createdAt_idx"
ON "PromotionDecision"("emailDerivedOfferId", "status", "createdAt");

ALTER TABLE "InboundEmailDocument"
ADD CONSTRAINT "InboundEmailDocument_inboundEmailId_fkey"
FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailExtractionRun"
ADD CONSTRAINT "EmailExtractionRun_inboundEmailId_fkey"
FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailDerivedOffer"
ADD CONSTRAINT "EmailDerivedOffer_inboundEmailId_fkey"
FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailDerivedOffer"
ADD CONSTRAINT "EmailDerivedOffer_extractionRunId_fkey"
FOREIGN KEY ("extractionRunId") REFERENCES "EmailExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailDerivedOffer"
ADD CONSTRAINT "EmailDerivedOffer_sourceDocumentId_fkey"
FOREIGN KEY ("sourceDocumentId") REFERENCES "InboundEmailDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailDerivedOfferEvidence"
ADD CONSTRAINT "EmailDerivedOfferEvidence_emailDerivedOfferId_fkey"
FOREIGN KEY ("emailDerivedOfferId") REFERENCES "EmailDerivedOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailDerivedOfferEvidence"
ADD CONSTRAINT "EmailDerivedOfferEvidence_sourceDocumentId_fkey"
FOREIGN KEY ("sourceDocumentId") REFERENCES "InboundEmailDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EntityResolutionCandidate"
ADD CONSTRAINT "EntityResolutionCandidate_emailDerivedOfferId_fkey"
FOREIGN KEY ("emailDerivedOfferId") REFERENCES "EmailDerivedOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromotionDecision"
ADD CONSTRAINT "PromotionDecision_inboundEmailId_fkey"
FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromotionDecision"
ADD CONSTRAINT "PromotionDecision_emailDerivedOfferId_fkey"
FOREIGN KEY ("emailDerivedOfferId") REFERENCES "EmailDerivedOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
