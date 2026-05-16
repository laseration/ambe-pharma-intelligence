-- CreateTable
CREATE TABLE "AccountOpeningFieldMapping" (
    "id" TEXT NOT NULL,
    "accountOpeningCaseId" TEXT NOT NULL,
    "supplierFieldLabel" TEXT NOT NULL,
    "supplierSectionLabel" TEXT,
    "normalizedLabel" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceEvidenceId" TEXT,
    "evidenceSnippet" TEXT,
    "suggestedDraftFieldKey" TEXT,
    "mappedDraftFieldKey" TEXT,
    "proposedValue" TEXT,
    "valueSource" TEXT,
    "confidence" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "blockedReason" TEXT,
    "reviewReason" TEXT,
    "operatorNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountOpeningFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountOpeningFieldMapping_accountOpeningCaseId_sortOrder_idx" ON "AccountOpeningFieldMapping"("accountOpeningCaseId", "sortOrder");

-- CreateIndex
CREATE INDEX "AccountOpeningFieldMapping_accountOpeningCaseId_status_idx" ON "AccountOpeningFieldMapping"("accountOpeningCaseId", "status");

-- CreateIndex
CREATE INDEX "AccountOpeningFieldMapping_sourceEvidenceId_idx" ON "AccountOpeningFieldMapping"("sourceEvidenceId");

-- AddForeignKey
ALTER TABLE "AccountOpeningFieldMapping" ADD CONSTRAINT "AccountOpeningFieldMapping_accountOpeningCaseId_fkey" FOREIGN KEY ("accountOpeningCaseId") REFERENCES "AccountOpeningCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpeningFieldMapping" ADD CONSTRAINT "AccountOpeningFieldMapping_sourceEvidenceId_fkey" FOREIGN KEY ("sourceEvidenceId") REFERENCES "AccountOpeningSourceEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
