-- CreateEnum
CREATE TYPE "RegulatoryEventType" AS ENUM ('RECALL', 'MEDICINE_DEFECT', 'SAFETY_ALERT', 'LICENCE_CHANGE', 'PRODUCT_WITHDRAWAL', 'SUPPLY_DISRUPTION', 'OTHER_REGULATORY_UPDATE');

-- CreateEnum
CREATE TYPE "RegulatorySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RegulatoryAlertStatus" AS ENUM ('NEW', 'REVIEWING', 'ACTIONED', 'IGNORED', 'FALSE_MATCH');

-- CreateEnum
CREATE TYPE "RegulatoryReviewStatus" AS ENUM ('NEW', 'REVIEWING', 'ACTIONED', 'IGNORED', 'FALSE_MATCH');

-- CreateEnum
CREATE TYPE "RegulatoryMatchStatus" AS ENUM ('CONFIDENT', 'UNCLEAR', 'REJECTED');

-- CreateEnum
CREATE TYPE "RegulatoryActionType" AS ENUM ('CREATED', 'MATCHED', 'QUEUED_FOR_REVIEW', 'STATUS_CHANGED', 'NOTE_ADDED', 'ACTIONED', 'IGNORED', 'FALSE_MATCH');

-- CreateTable
CREATE TABLE "RegulatoryUpdate" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "rawText" TEXT NOT NULL,
    "regulator" TEXT NOT NULL DEFAULT 'MHRA',
    "category" TEXT,
    "evidence" JSONB,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySignal" (
    "id" TEXT NOT NULL,
    "regulatoryUpdateId" TEXT NOT NULL,
    "eventType" "RegulatoryEventType" NOT NULL,
    "severity" "RegulatorySeverity" NOT NULL DEFAULT 'MEDIUM',
    "summary" TEXT NOT NULL,
    "affectedProductText" TEXT,
    "activeSubstance" TEXT,
    "manufacturer" TEXT,
    "licenceNumber" TEXT,
    "batchNumber" TEXT,
    "parserVersion" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatorySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryProductMatch" (
    "id" TEXT NOT NULL,
    "regulatorySignalId" TEXT NOT NULL,
    "productId" TEXT,
    "status" "RegulatoryMatchStatus" NOT NULL DEFAULT 'UNCLEAR',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "matchedFields" JSONB,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryProductMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryAlert" (
    "id" TEXT NOT NULL,
    "regulatorySignalId" TEXT NOT NULL,
    "regulatoryProductMatchId" TEXT,
    "productId" TEXT,
    "status" "RegulatoryAlertStatus" NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "suggestedAction" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryReviewItem" (
    "id" TEXT NOT NULL,
    "regulatorySignalId" TEXT NOT NULL,
    "regulatoryProductMatchId" TEXT,
    "productId" TEXT,
    "status" "RegulatoryReviewStatus" NOT NULL DEFAULT 'NEW',
    "priority" "RegulatorySeverity" NOT NULL DEFAULT 'MEDIUM',
    "reason" TEXT NOT NULL,
    "latestNote" TEXT,
    "assigneeLabel" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryActionLog" (
    "id" TEXT NOT NULL,
    "regulatoryUpdateId" TEXT,
    "regulatorySignalId" TEXT,
    "regulatoryProductMatchId" TEXT,
    "regulatoryAlertId" TEXT,
    "regulatoryReviewItemId" TEXT,
    "actionType" "RegulatoryActionType" NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "actorIdentifier" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryUpdate_sourceUrl_key" ON "RegulatoryUpdate"("sourceUrl");

-- CreateIndex
CREATE INDEX "RegulatoryUpdate_regulator_publishedAt_idx" ON "RegulatoryUpdate"("regulator", "publishedAt");

-- CreateIndex
CREATE INDEX "RegulatoryUpdate_contentHash_idx" ON "RegulatoryUpdate"("contentHash");

-- CreateIndex
CREATE INDEX "RegulatorySignal_regulatoryUpdateId_eventType_idx" ON "RegulatorySignal"("regulatoryUpdateId", "eventType");

-- CreateIndex
CREATE INDEX "RegulatorySignal_eventType_severity_createdAt_idx" ON "RegulatorySignal"("eventType", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "RegulatoryProductMatch_regulatorySignalId_status_confidence_idx" ON "RegulatoryProductMatch"("regulatorySignalId", "status", "confidence");

-- CreateIndex
CREATE INDEX "RegulatoryProductMatch_productId_status_idx" ON "RegulatoryProductMatch"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryAlert_regulatoryProductMatchId_key" ON "RegulatoryAlert"("regulatoryProductMatchId");

-- CreateIndex
CREATE INDEX "RegulatoryAlert_status_createdAt_idx" ON "RegulatoryAlert"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RegulatoryAlert_productId_status_idx" ON "RegulatoryAlert"("productId", "status");

-- CreateIndex
CREATE INDEX "RegulatoryAlert_regulatorySignalId_idx" ON "RegulatoryAlert"("regulatorySignalId");

-- CreateIndex
CREATE INDEX "RegulatoryReviewItem_status_priority_createdAt_idx" ON "RegulatoryReviewItem"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "RegulatoryReviewItem_regulatorySignalId_status_idx" ON "RegulatoryReviewItem"("regulatorySignalId", "status");

-- CreateIndex
CREATE INDEX "RegulatoryReviewItem_productId_status_idx" ON "RegulatoryReviewItem"("productId", "status");

-- CreateIndex
CREATE INDEX "RegulatoryActionLog_regulatoryUpdateId_createdAt_idx" ON "RegulatoryActionLog"("regulatoryUpdateId", "createdAt");

-- CreateIndex
CREATE INDEX "RegulatoryActionLog_regulatorySignalId_createdAt_idx" ON "RegulatoryActionLog"("regulatorySignalId", "createdAt");

-- CreateIndex
CREATE INDEX "RegulatoryActionLog_regulatoryAlertId_createdAt_idx" ON "RegulatoryActionLog"("regulatoryAlertId", "createdAt");

-- CreateIndex
CREATE INDEX "RegulatoryActionLog_regulatoryReviewItemId_createdAt_idx" ON "RegulatoryActionLog"("regulatoryReviewItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "RegulatorySignal" ADD CONSTRAINT "RegulatorySignal_regulatoryUpdateId_fkey" FOREIGN KEY ("regulatoryUpdateId") REFERENCES "RegulatoryUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryProductMatch" ADD CONSTRAINT "RegulatoryProductMatch_regulatorySignalId_fkey" FOREIGN KEY ("regulatorySignalId") REFERENCES "RegulatorySignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryProductMatch" ADD CONSTRAINT "RegulatoryProductMatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryAlert" ADD CONSTRAINT "RegulatoryAlert_regulatorySignalId_fkey" FOREIGN KEY ("regulatorySignalId") REFERENCES "RegulatorySignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryAlert" ADD CONSTRAINT "RegulatoryAlert_regulatoryProductMatchId_fkey" FOREIGN KEY ("regulatoryProductMatchId") REFERENCES "RegulatoryProductMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryAlert" ADD CONSTRAINT "RegulatoryAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryReviewItem" ADD CONSTRAINT "RegulatoryReviewItem_regulatorySignalId_fkey" FOREIGN KEY ("regulatorySignalId") REFERENCES "RegulatorySignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryReviewItem" ADD CONSTRAINT "RegulatoryReviewItem_regulatoryProductMatchId_fkey" FOREIGN KEY ("regulatoryProductMatchId") REFERENCES "RegulatoryProductMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryReviewItem" ADD CONSTRAINT "RegulatoryReviewItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryActionLog" ADD CONSTRAINT "RegulatoryActionLog_regulatoryUpdateId_fkey" FOREIGN KEY ("regulatoryUpdateId") REFERENCES "RegulatoryUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryActionLog" ADD CONSTRAINT "RegulatoryActionLog_regulatorySignalId_fkey" FOREIGN KEY ("regulatorySignalId") REFERENCES "RegulatorySignal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryActionLog" ADD CONSTRAINT "RegulatoryActionLog_regulatoryProductMatchId_fkey" FOREIGN KEY ("regulatoryProductMatchId") REFERENCES "RegulatoryProductMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryActionLog" ADD CONSTRAINT "RegulatoryActionLog_regulatoryAlertId_fkey" FOREIGN KEY ("regulatoryAlertId") REFERENCES "RegulatoryAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryActionLog" ADD CONSTRAINT "RegulatoryActionLog_regulatoryReviewItemId_fkey" FOREIGN KEY ("regulatoryReviewItemId") REFERENCES "RegulatoryReviewItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
