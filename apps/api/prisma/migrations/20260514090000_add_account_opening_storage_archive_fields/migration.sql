-- AlterTable
ALTER TABLE "AccountOpeningCase"
  ADD COLUMN "storageStatus" TEXT,
  ADD COLUMN "storageNote" TEXT,
  ADD COLUMN "storageSkippedReason" TEXT,
  ADD COLUMN "storageLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "storageFolderUrl" TEXT;
