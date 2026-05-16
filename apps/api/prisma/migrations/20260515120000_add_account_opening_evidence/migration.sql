-- CreateTable
CREATE TABLE "AccountOpeningSourceEvidence" (
    "id" TEXT NOT NULL,
    "accountOpeningCaseId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "contentId" TEXT,
    "disposition" TEXT,
    "extractionMethod" TEXT,
    "extractedTextHash" TEXT,
    "extractedTextChars" INTEGER,
    "safeSnippet" TEXT,
    "rawFileAvailable" BOOLEAN NOT NULL DEFAULT false,
    "storageProvider" TEXT,
    "storageFolderUrl" TEXT,
    "storageFileUrl" TEXT,
    "storageDriveItemId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountOpeningSourceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountOpeningSourceEvidence_accountOpeningCaseId_sourceType_idx" ON "AccountOpeningSourceEvidence"("accountOpeningCaseId", "sourceType");

-- CreateIndex
CREATE INDEX "AccountOpeningSourceEvidence_extractedTextHash_idx" ON "AccountOpeningSourceEvidence"("extractedTextHash");

-- AlterTable
ALTER TABLE "AccountOpeningCase"
ADD COLUMN "draftStatus" TEXT,
ADD COLUMN "draftVersion" TEXT,
ADD COLUMN "draftGeneratedAt" TIMESTAMP(3),
ADD COLUMN "draftJson" JSONB,
ADD COLUMN "draftSummary" JSONB;

-- AddForeignKey
ALTER TABLE "AccountOpeningSourceEvidence" ADD CONSTRAINT "AccountOpeningSourceEvidence_accountOpeningCaseId_fkey" FOREIGN KEY ("accountOpeningCaseId") REFERENCES "AccountOpeningCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
