-- CreateTable
CREATE TABLE "AccountOpeningBinaryFillPreview" (
    "id" TEXT NOT NULL,
    "accountOpeningCaseId" TEXT NOT NULL,
    "originalFormId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNSUPPORTED',
    "previewVersion" TEXT NOT NULL DEFAULT 'binary-fill-preview-v1',
    "binaryPreviewFileName" TEXT,
    "binaryPreviewContentType" TEXT,
    "binaryPreviewHash" TEXT,
    "binaryPreviewBytes" BYTEA,
    "filledFieldCount" INTEGER NOT NULL DEFAULT 0,
    "blankFieldCount" INTEGER NOT NULL DEFAULT 0,
    "unsupportedReason" TEXT,
    "warnings" JSONB,
    "brandingPreservationCheck" JSONB,
    "safetySummary" JSONB,
    "createdByType" TEXT,
    "createdByIdentifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountOpeningBinaryFillPreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountOpeningBinaryFillPreview_accountOpeningCaseId_createdAt_idx" ON "AccountOpeningBinaryFillPreview"("accountOpeningCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountOpeningBinaryFillPreview_originalFormId_createdAt_idx" ON "AccountOpeningBinaryFillPreview"("originalFormId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountOpeningBinaryFillPreview_status_createdAt_idx" ON "AccountOpeningBinaryFillPreview"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountOpeningBinaryFillPreview" ADD CONSTRAINT "AccountOpeningBinaryFillPreview_accountOpeningCaseId_fkey" FOREIGN KEY ("accountOpeningCaseId") REFERENCES "AccountOpeningCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpeningBinaryFillPreview" ADD CONSTRAINT "AccountOpeningBinaryFillPreview_originalFormId_fkey" FOREIGN KEY ("originalFormId") REFERENCES "AccountOpeningOriginalForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
