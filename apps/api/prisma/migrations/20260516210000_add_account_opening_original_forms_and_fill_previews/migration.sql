-- CreateTable
CREATE TABLE "AccountOpeningOriginalForm" (
    "id" TEXT NOT NULL,
    "accountOpeningCaseId" TEXT NOT NULL,
    "sourceEvidenceId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "fileHash" TEXT,
    "storageProvider" TEXT,
    "storageFolderUrl" TEXT,
    "storageFileUrl" TEXT,
    "storageDriveItemId" TEXT,
    "localBlobAvailable" BOOLEAN NOT NULL DEFAULT false,
    "formType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "fillSupportStatus" TEXT NOT NULL DEFAULT 'UNSUPPORTED',
    "detectedFieldCount" INTEGER,
    "detectionSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountOpeningOriginalForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountOpeningFillPreview" (
    "id" TEXT NOT NULL,
    "accountOpeningCaseId" TEXT NOT NULL,
    "originalFormId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GENERATED_FOR_REVIEW',
    "previewVersion" TEXT NOT NULL DEFAULT 'fill-preview-v1',
    "fileNames" JSONB NOT NULL,
    "previewJson" JSONB NOT NULL,
    "fieldSummary" JSONB,
    "safetySummary" JSONB,
    "createdByType" TEXT,
    "createdByIdentifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountOpeningFillPreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountOpeningOriginalForm_accountOpeningCaseId_createdAt_idx" ON "AccountOpeningOriginalForm"("accountOpeningCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountOpeningOriginalForm_sourceEvidenceId_idx" ON "AccountOpeningOriginalForm"("sourceEvidenceId");

-- CreateIndex
CREATE INDEX "AccountOpeningOriginalForm_fileHash_idx" ON "AccountOpeningOriginalForm"("fileHash");

-- CreateIndex
CREATE INDEX "AccountOpeningFillPreview_accountOpeningCaseId_createdAt_idx" ON "AccountOpeningFillPreview"("accountOpeningCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountOpeningFillPreview_originalFormId_createdAt_idx" ON "AccountOpeningFillPreview"("originalFormId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountOpeningOriginalForm" ADD CONSTRAINT "AccountOpeningOriginalForm_accountOpeningCaseId_fkey" FOREIGN KEY ("accountOpeningCaseId") REFERENCES "AccountOpeningCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpeningOriginalForm" ADD CONSTRAINT "AccountOpeningOriginalForm_sourceEvidenceId_fkey" FOREIGN KEY ("sourceEvidenceId") REFERENCES "AccountOpeningSourceEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpeningFillPreview" ADD CONSTRAINT "AccountOpeningFillPreview_accountOpeningCaseId_fkey" FOREIGN KEY ("accountOpeningCaseId") REFERENCES "AccountOpeningCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpeningFillPreview" ADD CONSTRAINT "AccountOpeningFillPreview_originalFormId_fkey" FOREIGN KEY ("originalFormId") REFERENCES "AccountOpeningOriginalForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
