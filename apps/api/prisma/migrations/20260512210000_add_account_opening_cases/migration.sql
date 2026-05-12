-- CreateEnum
CREATE TYPE "AccountOpeningStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED_FOR_COMPLETION',
  'NEEDS_INFO',
  'REJECTED',
  'COMPLETED_DRAFT_READY',
  'UPLOADED_TO_SHAREPOINT',
  'READY_TO_SEND',
  'SENT',
  'CLOSED'
);

-- CreateTable
CREATE TABLE "AccountOpeningCase" (
  "id" TEXT NOT NULL,
  "inboundEmailId" TEXT,
  "messageId" TEXT,
  "senderEmail" TEXT,
  "senderDomain" TEXT,
  "subject" TEXT,
  "receivedAt" TIMESTAMP(3),
  "companyName" TEXT,
  "detectedFormType" TEXT,
  "status" "AccountOpeningStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "recommendedSigner" TEXT NOT NULL DEFAULT 'Aman Dhillon',
  "signingStatement" TEXT NOT NULL DEFAULT 'Aman Dhillon can sign this account-opening form by default.',
  "signingExplanation" TEXT,
  "detectedNames" JSONB,
  "detectedRoles" JSONB,
  "escalationNotes" JSONB,
  "riskFlags" JSONB,
  "missingFields" JSONB,
  "reviewerChecks" JSONB,
  "signingNotes" JSONB,
  "missingInfoResponses" JSONB,
  "extractedTextSummary" TEXT,
  "sharePointStatus" TEXT,
  "sharePointNote" TEXT,
  "sharePointSkippedReason" TEXT,
  "sharePointLastAttemptAt" TIMESTAMP(3),
  "sharePointFolderUrl" TEXT,
  "sourceAttachmentNames" JSONB,
  "sourceFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountOpeningCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountOpeningCaseEvent" (
  "id" TEXT NOT NULL,
  "accountOpeningCaseId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "previousStatus" "AccountOpeningStatus",
  "newStatus" "AccountOpeningStatus",
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorIdentifier" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountOpeningCaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountOpeningCase_sourceFingerprint_key" ON "AccountOpeningCase"("sourceFingerprint");

-- CreateIndex
CREATE INDEX "AccountOpeningCase_status_updatedAt_idx" ON "AccountOpeningCase"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AccountOpeningCase_messageId_idx" ON "AccountOpeningCase"("messageId");

-- CreateIndex
CREATE INDEX "AccountOpeningCase_senderEmail_idx" ON "AccountOpeningCase"("senderEmail");

-- CreateIndex
CREATE INDEX "AccountOpeningCaseEvent_accountOpeningCaseId_createdAt_idx" ON "AccountOpeningCaseEvent"("accountOpeningCaseId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountOpeningCase" ADD CONSTRAINT "AccountOpeningCase_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpeningCaseEvent" ADD CONSTRAINT "AccountOpeningCaseEvent_accountOpeningCaseId_fkey" FOREIGN KEY ("accountOpeningCaseId") REFERENCES "AccountOpeningCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
