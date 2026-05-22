-- CreateEnum
CREATE TYPE "SupplierContactStatus" AS ENUM ('STAGED', 'AUTO_ACCEPTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierNameCandidate" TEXT NOT NULL,
    "normalizedSupplierName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhoneRaw" TEXT,
    "contactPhoneCanonical" TEXT,
    "contactRole" TEXT,
    "sourceInboundEmailId" TEXT,
    "sourceDocumentId" TEXT,
    "sourceFingerprint" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "status" "SupplierContactStatus" NOT NULL DEFAULT 'STAGED',
    "autoAttached" BOOLEAN NOT NULL DEFAULT false,
    "conflictFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContactEvidence" (
    "id" TEXT NOT NULL,
    "supplierContactId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "sourceType" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "normalizedValue" TEXT,
    "confidenceContribution" INTEGER NOT NULL,
    "snippet" TEXT,
    "pageNumber" INTEGER,
    "boundingBox" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierContactEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountOpeningOriginalDocument" (
    "id" TEXT NOT NULL,
    "accountOpeningCaseId" TEXT,
    "inboundEmailId" TEXT,
    "immutableMessageId" TEXT,
    "internetMessageId" TEXT,
    "graphAttachmentId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sha256" TEXT NOT NULL,
    "sharepointSiteId" TEXT,
    "driveId" TEXT,
    "driveItemId" TEXT,
    "folderUrl" TEXT,
    "fileUrl" TEXT,
    "uploadStatus" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountOpeningOriginalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierContact_sourceFingerprint_key" ON "SupplierContact"("sourceFingerprint");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_status_idx" ON "SupplierContact"("supplierId", "status");

-- CreateIndex
CREATE INDEX "SupplierContact_normalizedSupplierName_status_idx" ON "SupplierContact"("normalizedSupplierName", "status");

-- CreateIndex
CREATE INDEX "SupplierContact_contactEmail_idx" ON "SupplierContact"("contactEmail");

-- CreateIndex
CREATE INDEX "SupplierContact_sourceInboundEmailId_idx" ON "SupplierContact"("sourceInboundEmailId");

-- CreateIndex
CREATE INDEX "SupplierContact_sourceDocumentId_idx" ON "SupplierContact"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "SupplierContactEvidence_supplierContactId_idx" ON "SupplierContactEvidence"("supplierContactId");

-- CreateIndex
CREATE INDEX "SupplierContactEvidence_sourceDocumentId_idx" ON "SupplierContactEvidence"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "SupplierContactEvidence_fieldName_idx" ON "SupplierContactEvidence"("fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "AccountOpeningOriginalDocument_sourceFingerprint_key" ON "AccountOpeningOriginalDocument"("sourceFingerprint");

-- CreateIndex
CREATE INDEX "AccountOpeningOriginalDocument_accountOpeningCaseId_createdAt_idx" ON "AccountOpeningOriginalDocument"("accountOpeningCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountOpeningOriginalDocument_inboundEmailId_idx" ON "AccountOpeningOriginalDocument"("inboundEmailId");

-- CreateIndex
CREATE INDEX "AccountOpeningOriginalDocument_immutableMessageId_graphAttachmentId_idx" ON "AccountOpeningOriginalDocument"("immutableMessageId", "graphAttachmentId");

-- CreateIndex
CREATE INDEX "AccountOpeningOriginalDocument_sha256_idx" ON "AccountOpeningOriginalDocument"("sha256");

-- CreateIndex
CREATE INDEX "AccountOpeningOriginalDocument_uploadStatus_createdAt_idx" ON "AccountOpeningOriginalDocument"("uploadStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_sourceInboundEmailId_fkey" FOREIGN KEY ("sourceInboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "InboundEmailDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContactEvidence" ADD CONSTRAINT "SupplierContactEvidence_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "SupplierContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContactEvidence" ADD CONSTRAINT "SupplierContactEvidence_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "InboundEmailDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpeningOriginalDocument" ADD CONSTRAINT "AccountOpeningOriginalDocument_accountOpeningCaseId_fkey" FOREIGN KEY ("accountOpeningCaseId") REFERENCES "AccountOpeningCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpeningOriginalDocument" ADD CONSTRAINT "AccountOpeningOriginalDocument_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
