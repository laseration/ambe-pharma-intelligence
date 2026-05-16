-- CreateTable
CREATE TABLE "AccountOpeningFieldMappingTemplate" (
    "id" TEXT NOT NULL,
    "supplierDomain" TEXT,
    "supplierName" TEXT,
    "formFingerprint" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mappingJson" JSONB NOT NULL,
    "safetySummary" JSONB,
    "createdFromCaseId" TEXT,
    "createdByType" TEXT,
    "createdByIdentifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountOpeningFieldMappingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountOpeningFieldMappingTemplate_supplierDomain_formFingerprint_idx" ON "AccountOpeningFieldMappingTemplate"("supplierDomain", "formFingerprint");

-- CreateIndex
CREATE INDEX "AccountOpeningFieldMappingTemplate_status_updatedAt_idx" ON "AccountOpeningFieldMappingTemplate"("status", "updatedAt");
