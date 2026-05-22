import { createHash } from 'node:crypto';

export type AccountOpeningOriginalUploadCandidate = {
  immutableMessageId: string | null;
  internetMessageId: string | null;
  graphAttachmentId: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  bytes: Buffer;
};

export type AccountOpeningOriginalUploadRecord = {
  sourceFingerprint: string;
  immutableMessageId: string | null;
  internetMessageId: string | null;
  graphAttachmentId: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string;
  uploadStatus: 'PENDING' | 'UPLOADED' | 'SKIPPED' | 'FAILED';
};

export function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildAccountOpeningOriginalDocumentRecord(
  input: AccountOpeningOriginalUploadCandidate,
): AccountOpeningOriginalUploadRecord {
  const sha256 = sha256Bytes(input.bytes);
  const sourceFingerprint = createHash('sha256')
    .update(
      [
        input.immutableMessageId ?? '',
        input.internetMessageId ?? '',
        input.graphAttachmentId ?? '',
        input.fileName,
        sha256,
      ].join('|'),
    )
    .digest('hex');

  return {
    sourceFingerprint,
    immutableMessageId: input.immutableMessageId,
    internetMessageId: input.internetMessageId,
    graphAttachmentId: input.graphAttachmentId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes ?? input.bytes.byteLength,
    sha256,
    uploadStatus: 'PENDING',
  };
}

export function shouldUploadAccountOpeningOriginal(input: {
  classifierSafeToRoute: boolean;
  primaryClass: string;
  conflicts: string[];
  uploadEnabled: boolean;
  hasStorageConfig: boolean;
}): { allowed: boolean; reason: string } {
  if (!input.uploadEnabled) {
    return { allowed: false, reason: 'Original upload is disabled.' };
  }
  if (!input.hasStorageConfig) {
    return {
      allowed: false,
      reason: 'Original upload storage is not configured.',
    };
  }
  if (
    input.primaryClass !== 'ACCOUNT_OPENING_FORM' ||
    !input.classifierSafeToRoute ||
    input.conflicts.length > 0
  ) {
    return {
      allowed: false,
      reason:
        'Original upload requires high-confidence account-opening classification with no conflicts.',
    };
  }

  return {
    allowed: true,
    reason:
      'Original account-opening attachment may be internally uploaded for later binary fill preview.',
  };
}
