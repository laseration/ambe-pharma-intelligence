-- Add completed draft storage for review-first account-opening cases.
ALTER TABLE "AccountOpeningCase"
  ADD COLUMN "completedDraft" JSONB,
  ADD COLUMN "completedDraftStatus" TEXT,
  ADD COLUMN "completedDraftGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "completedDraftSharePointStatus" TEXT,
  ADD COLUMN "completedDraftSharePointNote" TEXT,
  ADD COLUMN "completedDraftSharePointSkippedReason" TEXT,
  ADD COLUMN "completedDraftSharePointLastAttemptAt" TIMESTAMP(3);
