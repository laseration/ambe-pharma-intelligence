const REVIEW_EXPORT_FILE_NAMES = new Set([
  'review-pack.json',
  'review-pack.md',
  'completion-draft.json',
  'field-mapping-summary.json',
  'unresolved-fields.json',
  'blocked-fields.json',
  'signing-notes.json',
  'risk-summary.json',
  'source-evidence.json',
  'source-evidence.md',
]);

const FILL_PREVIEW_FILE_NAMES = new Set([
  'fill-preview.json',
  'fill-preview.md',
  'fill-values.json',
  'blank-fields.json',
  'original-form-reference.json',
]);

const BINARY_FILL_PREVIEW_FILE_NAMES = new Set(['binary-fill-preview.pdf']);

const ALL_DOWNLOAD_FILE_NAMES = new Set([
  ...REVIEW_EXPORT_FILE_NAMES,
  ...FILL_PREVIEW_FILE_NAMES,
  ...BINARY_FILL_PREVIEW_FILE_NAMES,
]);

export type AccountOpeningDownloadKind =
  | 'review-export'
  | 'fill-preview'
  | 'binary-fill-preview';

export function classifyAccountOpeningDownloadFileName(
  fileName: string,
): AccountOpeningDownloadKind | null {
  if (REVIEW_EXPORT_FILE_NAMES.has(fileName)) {
    return 'review-export';
  }

  if (FILL_PREVIEW_FILE_NAMES.has(fileName)) {
    return 'fill-preview';
  }

  if (BINARY_FILL_PREVIEW_FILE_NAMES.has(fileName)) {
    return 'binary-fill-preview';
  }

  return null;
}

export function isAllowedAccountOpeningDownloadFileName(
  fileName: string,
): boolean {
  return ALL_DOWNLOAD_FILE_NAMES.has(fileName);
}

export function safeAccountOpeningDownloadFileName(fileName: string): string {
  return isAllowedAccountOpeningDownloadFileName(fileName)
    ? fileName
    : 'account-opening-review.txt';
}
