ALTER TABLE "TelegramPost"
ADD COLUMN "opportunityId" TEXT,
ADD COLUMN "contentHash" TEXT,
ADD COLUMN "metadata" JSONB;

CREATE INDEX "TelegramPost_opportunityId_channelKey_status_idx"
ON "TelegramPost"("opportunityId", "channelKey", "status");

ALTER TABLE "TelegramPost"
ADD CONSTRAINT "TelegramPost_opportunityId_fkey"
FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
