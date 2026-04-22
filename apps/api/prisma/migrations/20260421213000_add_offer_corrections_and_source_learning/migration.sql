-- CreateEnum
CREATE TYPE "OfferCorrectionStatus" AS ENUM (
  'APPLIED',
  'SUPERSEDED',
  'REJECTED'
);

-- CreateEnum
CREATE TYPE "OfferCorrectionActionType" AS ENUM (
  'CREATED',
  'UPDATED',
  'APPLIED',
  'SUPERSEDED',
  'REJECTED',
  'NOTE_ADDED'
);

-- CreateEnum
CREATE TYPE "SourceReliabilityTier" AS ENUM (
  'TRUSTED',
  'WATCH',
  'RISKY'
);

-- AlterTable
ALTER TABLE "InboundEmail"
ADD COLUMN "senderDomain" TEXT,
ADD COLUMN "sourceTemplateFingerprint" TEXT;

-- CreateTable
CREATE TABLE "OfferCorrection" (
  "id" TEXT NOT NULL,
  "emailDerivedOfferId" TEXT NOT NULL,
  "offerWorkflowItemId" TEXT,
  "inboundEmailId" TEXT,
  "correctionStatus" "OfferCorrectionStatus" NOT NULL DEFAULT 'APPLIED',
  "correctedSupplierId" TEXT,
  "correctedSupplierName" TEXT,
  "correctedProductId" TEXT,
  "correctedRawProductText" TEXT,
  "correctedNormalizedProductName" TEXT,
  "correctedStrength" TEXT,
  "correctedDosageForm" TEXT,
  "correctedPackSize" TEXT,
  "correctedManufacturer" TEXT,
  "correctedUnitPrice" DECIMAL(12,2),
  "correctedCurrencyCode" TEXT,
  "correctedMinimumOrderQuantity" INTEGER,
  "correctedAvailability" TEXT,
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OfferCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferCorrectionEvent" (
  "id" TEXT NOT NULL,
  "offerCorrectionId" TEXT NOT NULL,
  "actionType" "OfferCorrectionActionType" NOT NULL,
  "previousStatus" "OfferCorrectionStatus",
  "newStatus" "OfferCorrectionStatus",
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferCorrectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceReliabilityProfile" (
  "id" TEXT NOT NULL,
  "profileKey" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "senderEmail" TEXT,
  "senderDomain" TEXT,
  "supplierId" TEXT,
  "templateFingerprint" TEXT,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "acceptedExtractionCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedExtractionCount" INTEGER NOT NULL DEFAULT 0,
  "correctedExtractionCount" INTEGER NOT NULL DEFAULT 0,
  "acceptedSupplierResolutionCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedSupplierResolutionCount" INTEGER NOT NULL DEFAULT 0,
  "aiAssistCount" INTEGER NOT NULL DEFAULT 0,
  "reviewRequiredCount" INTEGER NOT NULL DEFAULT 0,
  "reliabilityScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "reliabilityTier" "SourceReliabilityTier" NOT NULL DEFAULT 'WATCH',
  "notes" TEXT,
  "metadata" JSONB,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SourceReliabilityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundEmail_senderDomain_createdAt_idx" ON "InboundEmail"("senderDomain", "createdAt");

-- CreateIndex
CREATE INDEX "InboundEmail_sourceSystem_sourceTemplateFingerprint_idx" ON "InboundEmail"("sourceSystem", "sourceTemplateFingerprint");

-- CreateIndex
CREATE INDEX "OfferCorrection_emailDerivedOfferId_createdAt_idx" ON "OfferCorrection"("emailDerivedOfferId", "createdAt");

-- CreateIndex
CREATE INDEX "OfferCorrection_offerWorkflowItemId_createdAt_idx" ON "OfferCorrection"("offerWorkflowItemId", "createdAt");

-- CreateIndex
CREATE INDEX "OfferCorrection_inboundEmailId_createdAt_idx" ON "OfferCorrection"("inboundEmailId", "createdAt");

-- CreateIndex
CREATE INDEX "OfferCorrection_correctionStatus_updatedAt_idx" ON "OfferCorrection"("correctionStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "OfferCorrectionEvent_offerCorrectionId_createdAt_idx" ON "OfferCorrectionEvent"("offerCorrectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceReliabilityProfile_profileKey_key" ON "SourceReliabilityProfile"("profileKey");

-- CreateIndex
CREATE INDEX "SourceReliabilityProfile_sourceSystem_senderEmail_idx" ON "SourceReliabilityProfile"("sourceSystem", "senderEmail");

-- CreateIndex
CREATE INDEX "SourceReliabilityProfile_senderDomain_reliabilityTier_idx" ON "SourceReliabilityProfile"("senderDomain", "reliabilityTier");

-- CreateIndex
CREATE INDEX "SourceReliabilityProfile_templateFingerprint_reliabilityTier_idx" ON "SourceReliabilityProfile"("templateFingerprint", "reliabilityTier");

-- CreateIndex
CREATE INDEX "SourceReliabilityProfile_supplierId_reliabilityTier_idx" ON "SourceReliabilityProfile"("supplierId", "reliabilityTier");

-- AddForeignKey
ALTER TABLE "OfferCorrection"
ADD CONSTRAINT "OfferCorrection_emailDerivedOfferId_fkey"
FOREIGN KEY ("emailDerivedOfferId") REFERENCES "EmailDerivedOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferCorrection"
ADD CONSTRAINT "OfferCorrection_offerWorkflowItemId_fkey"
FOREIGN KEY ("offerWorkflowItemId") REFERENCES "OfferWorkflowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferCorrection"
ADD CONSTRAINT "OfferCorrection_inboundEmailId_fkey"
FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferCorrection"
ADD CONSTRAINT "OfferCorrection_correctedSupplierId_fkey"
FOREIGN KEY ("correctedSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferCorrection"
ADD CONSTRAINT "OfferCorrection_correctedProductId_fkey"
FOREIGN KEY ("correctedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferCorrectionEvent"
ADD CONSTRAINT "OfferCorrectionEvent_offerCorrectionId_fkey"
FOREIGN KEY ("offerCorrectionId") REFERENCES "OfferCorrection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceReliabilityProfile"
ADD CONSTRAINT "SourceReliabilityProfile_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
