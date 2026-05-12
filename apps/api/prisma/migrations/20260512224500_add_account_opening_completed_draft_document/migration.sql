-- Add generated human-readable completed draft document metadata.
ALTER TABLE "AccountOpeningCase"
  ADD COLUMN "completedDraftDocument" JSONB,
  ADD COLUMN "completedDraftDocumentStatus" TEXT,
  ADD COLUMN "completedDraftDocumentSharePointStatus" TEXT,
  ADD COLUMN "completedDraftDocumentSharePointNote" TEXT,
  ADD COLUMN "completedDraftDocumentSharePointSkippedReason" TEXT,
  ADD COLUMN "completedDraftDocumentSharePointLastAttemptAt" TIMESTAMP(3);
