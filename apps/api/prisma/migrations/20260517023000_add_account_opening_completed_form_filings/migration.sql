-- CreateTable
CREATE TABLE "AccountOpeningCompletedFormFiling" (
    "id" TEXT NOT NULL,
    "accountOpeningCaseId" TEXT NOT NULL,
    "binaryFillPreviewId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileHash" TEXT,
    "fileSizeBytes" INTEGER,
    "storageProvider" TEXT,
    "storageFolderUrl" TEXT,
    "storageFileUrl" TEXT,
    "storageDriveItemId" TEXT,
    "approvedByType" TEXT,
    "approvedByIdentifier" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNote" TEXT,
    "filedByType" TEXT,
    "filedByIdentifier" TEXT,
    "filedAt" TIMESTAMP(3),
    "filingNote" TEXT,
    "skippedReason" TEXT,
    "safetySummary" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountOpeningCompletedFormFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountOpeningCompletedFormFiling_accountOpeningCaseId_createdAt_idx" ON "AccountOpeningCompletedFormFiling"("accountOpeningCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountOpeningCompletedFormFiling_binaryFillPreviewId_idx" ON "AccountOpeningCompletedFormFiling"("binaryFillPreviewId");

-- CreateIndex
CREATE INDEX "AccountOpeningCompletedFormFiling_status_createdAt_idx" ON "AccountOpeningCompletedFormFiling"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountOpeningCompletedFormFiling" ADD CONSTRAINT "AccountOpeningCompletedFormFiling_accountOpeningCaseId_fkey" FOREIGN KEY ("accountOpeningCaseId") REFERENCES "AccountOpeningCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
