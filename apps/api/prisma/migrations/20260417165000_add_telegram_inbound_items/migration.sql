CREATE TYPE "TelegramInboundFileType" AS ENUM ('CSV', 'XLSX', 'PDF', 'IMAGE', 'UNKNOWN');

CREATE TYPE "TelegramInboundProcessingStatus" AS ENUM (
  'RECEIVED',
  'IMPORTED',
  'NEEDS_REVIEW',
  'REVIEW_REQUIRED',
  'IGNORED',
  'FAILED'
);

CREATE TABLE "TelegramInboundItem" (
  "id" TEXT NOT NULL,
  "telegramMessageId" TEXT NOT NULL,
  "telegramUserId" TEXT,
  "telegramChatId" TEXT NOT NULL,
  "senderDisplayName" TEXT,
  "fileType" "TelegramInboundFileType" NOT NULL DEFAULT 'UNKNOWN',
  "fileName" TEXT,
  "mimeType" TEXT,
  "telegramFileId" TEXT,
  "telegramFileUniqueId" TEXT,
  "caption" TEXT,
  "processingStatus" "TelegramInboundProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "linkedImportBatchId" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramInboundItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramInboundItem_telegramChatId_telegramMessageId_key"
ON "TelegramInboundItem"("telegramChatId", "telegramMessageId");

CREATE INDEX "TelegramInboundItem_processingStatus_createdAt_idx"
ON "TelegramInboundItem"("processingStatus", "createdAt");

ALTER TABLE "TelegramInboundItem"
ADD CONSTRAINT "TelegramInboundItem_linkedImportBatchId_fkey"
FOREIGN KEY ("linkedImportBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
