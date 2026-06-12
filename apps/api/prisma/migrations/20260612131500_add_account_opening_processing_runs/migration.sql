CREATE TABLE "AccountOpeningProcessingRun" (
    "id" TEXT NOT NULL,
    "accountOpeningCaseId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "warningSummary" TEXT,
    "errorSummary" TEXT,
    "diagnostics" JSONB,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "actorIdentifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountOpeningProcessingRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountOpeningProcessingRun_accountOpeningCaseId_startedAt_idx" ON "AccountOpeningProcessingRun"("accountOpeningCaseId", "startedAt");
CREATE INDEX "AccountOpeningProcessingRun_triggerType_status_startedAt_idx" ON "AccountOpeningProcessingRun"("triggerType", "status", "startedAt");

ALTER TABLE "AccountOpeningProcessingRun" ADD CONSTRAINT "AccountOpeningProcessingRun_accountOpeningCaseId_fkey" FOREIGN KEY ("accountOpeningCaseId") REFERENCES "AccountOpeningCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
