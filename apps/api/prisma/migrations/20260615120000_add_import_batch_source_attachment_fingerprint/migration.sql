-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN "sourceAttachmentFingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_sourceAttachmentFingerprint_key" ON "ImportBatch"("sourceAttachmentFingerprint");
