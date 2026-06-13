import path from 'node:path';

import { env } from '../../config/env';
import type {
  EmailAttachmentInput,
  EmailInboundDecision,
  EmailInboundFileType,
  EmailInboundImportType,
  EmailInboundSupplierMapping,
  NormalizedEmailAttachment,
} from './types';

function lower(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

// Subjects and filenames separate words with spaces, hyphens, underscores, or
// dots (e.g. "price-list.xlsx", "price_list", "April.2026.price.list.xlsx").
// Strong-phrase matching uses spaces, so collapse those separators first.
// This only adds deterministic matching ability; it never weakens it.
function normalizeSignalText(value: string | null | undefined): string {
  return lower(value)
    .replace(/[._\-/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomain(senderEmail: string): string {
  const normalized = lower(senderEmail);
  const atIndex = normalized.lastIndexOf('@');

  return atIndex >= 0 ? normalized.slice(atIndex + 1) : '';
}

export function isAllowedEmailSender(senderEmail: string): boolean {
  return isAllowedEmailSenderForList(
    senderEmail,
    env.emailInboundAllowedSenders,
  );
}

export function isAllowedEmailSenderForList(
  senderEmail: string,
  allowedSenders: string[],
): boolean {
  const normalizedSender = lower(senderEmail);
  const senderDomain = extractDomain(normalizedSender);

  if (!normalizedSender || allowedSenders.length === 0) {
    return false;
  }

  // Entries may be exact addresses like owner@ambe.test or trusted domains
  // like supplier.co / @supplier.co for direct supplier workflows.
  return allowedSenders.some((entry) => {
    const normalizedEntry = lower(entry);

    if (!normalizedEntry) {
      return false;
    }

    if (normalizedEntry.includes('@') && !normalizedEntry.startsWith('@')) {
      return normalizedEntry === normalizedSender;
    }

    const entryDomain = normalizedEntry.startsWith('@')
      ? normalizedEntry.slice(1)
      : normalizedEntry;
    return entryDomain !== '' && entryDomain === senderDomain;
  });
}

export function resolveSupplierNameFromSender(
  senderEmail: string,
  mappings: EmailInboundSupplierMapping[],
): string | null {
  const normalizedSender = lower(senderEmail);
  const senderDomain = extractDomain(normalizedSender);

  for (const mapping of mappings) {
    const normalizedPattern = lower(mapping.pattern);

    if (!normalizedPattern || !mapping.supplierName.trim()) {
      continue;
    }

    // Mapping entries follow the same exact-address or trusted-domain pattern
    // as the sender allowlist.
    if (normalizedPattern.includes('@') && !normalizedPattern.startsWith('@')) {
      if (normalizedPattern === normalizedSender) {
        return mapping.supplierName.trim();
      }

      continue;
    }

    const patternDomain = normalizedPattern.startsWith('@')
      ? normalizedPattern.slice(1)
      : normalizedPattern;

    if (patternDomain && patternDomain === senderDomain) {
      return mapping.supplierName.trim();
    }
  }

  return null;
}

function cleanSupplierOverride(
  value: string | null | undefined,
): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

export function extractManualSupplierOverride(input: {
  subject: string | null;
  bodyText: string | null;
}): string | null {
  const subjectMatch = input.subject?.match(
    /\[\s*supplier\s*:\s*([^\]]+?)\s*\]/i,
  );
  const subjectSupplier = cleanSupplierOverride(subjectMatch?.[1]);

  if (subjectSupplier) {
    return subjectSupplier;
  }

  const bodyMatch = input.bodyText?.match(/^\s*supplier\s*:\s*(.+?)\s*$/im);
  return cleanSupplierOverride(bodyMatch?.[1]);
}

function detectAttachmentFileType(
  fileName: string | null,
  mimeType: string | null,
): EmailInboundFileType {
  const extension = fileName ? path.extname(fileName).toLowerCase() : '';
  const mime = lower(mimeType);

  if (
    extension === '.csv' ||
    mime === 'text/csv' ||
    mime === 'application/csv'
  ) {
    return 'CSV';
  }

  if (
    extension === '.xlsx' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'XLSX';
  }

  if (extension === '.pdf' || mime === 'application/pdf') {
    return 'PDF';
  }

  if (
    mime.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp'].includes(extension)
  ) {
    return 'IMAGE';
  }

  return 'UNKNOWN';
}

function decodeAttachmentContent(
  content: EmailAttachmentInput['content'],
): Buffer | null {
  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (typeof content !== 'string' || content.trim() === '') {
    return null;
  }

  try {
    return Buffer.from(content, 'base64');
  } catch {
    return null;
  }
}

export function normalizeEmailAttachment(
  input: EmailAttachmentInput,
): NormalizedEmailAttachment {
  const buffer = decodeAttachmentContent(input.content);

  return {
    fileType: detectAttachmentFileType(
      input.fileName ?? null,
      input.mimeType ?? null,
    ),
    fileName: input.fileName?.trim() || null,
    mimeType: input.mimeType?.trim() || null,
    buffer,
    size: input.size ?? buffer?.byteLength ?? null,
    contentId: input.contentId?.trim() || null,
    disposition: input.disposition?.trim() || null,
    graphAttachmentId: input.graphAttachmentId?.trim() || null,
  };
}

export function filterIgnorableEmailAttachments<
  T extends { fileType: EmailInboundFileType; disposition?: string | null },
>(attachments: T[]): T[] {
  const hasPrimarySpreadsheetAttachment = attachments.some(
    (attachment) =>
      (attachment.fileType === 'CSV' || attachment.fileType === 'XLSX') &&
      lower(attachment.disposition) !== 'inline',
  );

  if (!hasPrimarySpreadsheetAttachment) {
    return attachments;
  }

  return attachments.filter(
    (attachment) =>
      !(
        attachment.fileType === 'IMAGE' &&
        lower(attachment.disposition) === 'inline'
      ),
  );
}

const IMPORT_SIGNALS: Record<
  EmailInboundImportType,
  {
    strongPhrases: string[];
    weakKeywords: string[];
  }
> = {
  'supplier-price-list': {
    strongPhrases: [
      'supplier price list',
      'price list',
      'pricelist',
      'supplier quote',
      'supplier quotation',
    ],
    weakKeywords: [
      'supplier',
      'price',
      'quote',
      'quotation',
      'catalog',
      'offer',
    ],
  },
  inventory: {
    strongPhrases: [
      'inventory export',
      'inventory report',
      'stock report',
      'inventory snapshot',
    ],
    weakKeywords: ['inventory', 'stock', 'warehouse', 'availability'],
  },
  sales: {
    strongPhrases: [
      'sales report',
      'sales export',
      'sales data',
      'revenue report',
    ],
    weakKeywords: ['sales', 'revenue', 'orders'],
  },
};

function countDistinctMatches(haystack: string, keywords: string[]): number {
  return keywords.reduce(
    (count, keyword) => count + (haystack.includes(keyword) ? 1 : 0),
    0,
  );
}

function scoreImportType(
  subject: string,
  fileName: string,
  signalSet: { strongPhrases: string[]; weakKeywords: string[] },
): {
  score: number;
  subjectHits: number;
  fileHits: number;
  strongHits: number;
} {
  const subjectStrongHits = countDistinctMatches(
    subject,
    signalSet.strongPhrases,
  );
  const fileStrongHits = countDistinctMatches(
    fileName,
    signalSet.strongPhrases,
  );
  const subjectWeakHits = countDistinctMatches(subject, signalSet.weakKeywords);
  const fileWeakHits = countDistinctMatches(fileName, signalSet.weakKeywords);
  const strongHits = subjectStrongHits + fileStrongHits;
  const subjectHits = subjectStrongHits + subjectWeakHits;
  const fileHits = fileStrongHits + fileWeakHits;

  return {
    score: strongHits * 4 + subjectWeakHits * 2 + fileWeakHits * 2,
    subjectHits,
    fileHits,
    strongHits,
  };
}

export function inferEmailImportDecision(input: {
  senderEmail: string;
  subject: string | null;
  fileName: string | null;
  fileType: EmailInboundFileType;
}): EmailInboundDecision {
  if (input.fileType === 'PDF' || input.fileType === 'IMAGE') {
    return {
      processingStatus: 'REVIEW_REQUIRED',
      inferredImportType: null,
      confidence: 'LOW',
      reason: 'PDF and image attachments require manual review.',
    };
  }

  if (input.fileType !== 'CSV' && input.fileType !== 'XLSX') {
    return {
      processingStatus: 'NEEDS_REVIEW',
      inferredImportType: null,
      confidence: 'LOW',
      reason: 'Only CSV and XLSX attachments can be imported automatically.',
    };
  }

  const normalizedSubject = normalizeSignalText(input.subject);
  const normalizedFileName = normalizeSignalText(input.fileName);
  const scores = Object.entries(IMPORT_SIGNALS).map(
    ([importType, signalSet]) => {
      const details = scoreImportType(
        normalizedSubject,
        normalizedFileName,
        signalSet,
      );

      return {
        importType: importType as NonNullable<
          EmailInboundDecision['inferredImportType']
        >,
        ...details,
      };
    },
  );

  scores.sort((left, right) => right.score - left.score);

  const best = scores[0];
  const secondBest = scores[1];
  const secondBestScore = secondBest?.score ?? 0;
  const hasStrongEvidence = best
    ? best.strongHits >= 1 ||
      (best.subjectHits >= 1 && best.fileHits >= 1) ||
      best.score >= 6
    : false;
  // The best signal must clearly dominate the runner-up. A single overlapping
  // weak keyword (for example "availability" nudging the inventory score)
  // should not block an otherwise strong price-list match, but genuinely
  // competing signals (such as a "sales inventory report") still go to review.
  // A real strong phrase always scores at least 6 (a strong hit always carries
  // its own weak keyword), so this margin admits every clearly single-type
  // filename while keeping near-ties in the review queue.
  const dominantMargin = 6;
  const dominatesRunnerUp = best
    ? best.score - secondBestScore >= dominantMargin
    : false;

  if (!best || best.score < 4 || !hasStrongEvidence || !dominatesRunnerUp) {
    return {
      processingStatus: 'NEEDS_REVIEW',
      inferredImportType: null,
      confidence: 'LOW',
      reason:
        'Import type is unclear from the subject and attachment filename.',
    };
  }

  return {
    processingStatus: 'RECEIVED',
    inferredImportType: best.importType,
    confidence: 'HIGH',
    reason:
      'Import type was inferred confidently from the subject and attachment filename.',
  };
}
