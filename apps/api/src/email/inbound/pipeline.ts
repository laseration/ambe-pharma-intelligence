import { createHash } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { env } from '../../config/env';
import {
  getActiveInternalCompanyNames,
  getActiveInternalEmailDomains,
} from '../../organization/activeOrganizationConfig';
import { parseUploadedFile } from '../../imports/parsers';
import { buildProductCandidates } from '../../imports/normalization';
import { findOrCreateProduct } from '../../imports/service';
import { db } from '../../lib/db';
import { logger } from '../../lib/logger';
import { redactSafeOutputString } from '../../safety/redaction';
import { offerWorkflowService } from '../../reviewQueue/workflowService';
import { getLearnedResolutionHints } from '../../corrections/service';
import { extractAttachmentText } from '../attachmentTextExtraction';
import { classifyInboundDocument } from './documentClassifier';
import { extractSupplierContact } from './supplierContactExtraction';
import { persistSupplierContactCandidatesForInboundEmail } from './supplierContactPersistence';
import {
  normalizeEmailTextForParsing,
  parseStructuredPriceEmailBody,
  parseStructuredPriceText,
} from '../parsing';
import {
  extractManualSupplierOverride,
  filterIgnorableEmailAttachments,
  normalizeEmailAttachment,
  resolveSupplierNameFromSender,
} from './helpers';
import {
  buildSourceTemplateFingerprint,
  extractSenderDomain,
  normalizeFingerprintText,
} from './sourceFingerprint';
import {
  attachmentChecksumSha256,
  attachmentMetadataFingerprint,
} from './provenance';
import type { EmailInboundMessage, EmailInboundResult } from './types';

const EXTRACTOR_VERSION = 'email-staging-v1';
// After this many failed staging attempts a message is dead-lettered (terminal
// FAILED) instead of being retried on every poll forever.
const MAX_INGEST_ATTEMPTS = 5;
const PRICE_PATTERN =
  /\b(?:((?:GBP|USD|EUR))\s*(\d+(?:\.\d{1,2})?)|([\u00A3$€])\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*((?:GBP|USD|EUR)))\b/i;
const MOQ_PATTERN =
  /\b(?:moq|min(?:imum)?(?: order| qty| quantity)?)[\s:=-]*(\d+)\b/i;
const AVAILABILITY_PATTERN =
  /\b(available|in stock|instock|limited stock|limited|ready stock|eta\s+\w+)\b/i;
const MANUFACTURER_PATTERN =
  /\b(?:manufacturer|mfr|brand|by|from)\s*[:=-]?\s*([A-Z][A-Za-z0-9&.,\- ]{1,60}?)(?=\s+(?:at|for|moq|min(?:imum)?|available|limited|\u00A3|\$|€|\d)|$)/i;
const FORWARDED_HEADER_PATTERN = /^\s*(?:from|sent|subject|to|cc):/im;
const ON_WROTE_PATTERN = /^on .+wrote:$/im;
const SIGNATURE_PATTERN =
  /\n\s*(?:kind regards|best regards|regards|best|thanks|many thanks|cheers)[,\s]*\n/i;
const DISCLAIMER_PATTERN =
  /\n(?:this e-?mail(?: and any attachments)? is confidential|confidentiality notice|please consider the environment before printing this email|the information contained in this email is intended only for the named recipient)[\s\S]*$/i;
const SUPPLIER_NAME_PATTERN =
  /\b([A-Z][-A-Za-z0-9&.,'’ ]{1,60}?(?:\s+(?:pharma|pharmaceuticals|laboratories|labs|health|medical|ltd|limited|inc|llc|gmbh|uk|bv|nv|plc|corp|company|co)|pharma[-A-Za-z0-9&.,'’]*))\b/i;
const FORWARDED_SENDER_EMAIL_PATTERN =
  /\bfrom\s*:\s*(?:[^<\n]*<)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
const DOMAIN_COMPANY_FALLBACK_BLOCKLIST = new Set([
  'gmail',
  'outlook',
  'hotmail',
  'live',
  'yahoo',
  'icloud',
  'googlemail',
  'microsoft',
  'office',
]);

function normalizeSupplierIdentityToken(
  value: string | null | undefined,
): string {
  return normalizeFingerprintText(value).replace(/[^a-z0-9]+/g, '');
}

const SUPPLIER_FAMILY_SUFFIXES = [
  'pharmaceuticals',
  'pharmaceutical',
  'pharma',
  'medical',
  'healthcare',
  'health',
  'group',
  'company',
  'limited',
  'ltd',
  'llc',
  'gmbh',
  'corp',
  'co',
  'plc',
  'bv',
  'nv',
  'be',
  'uk',
  'eu',
];

const ATTACHMENT_TEXT_NOISE_PATTERN =
  /\b(?:batch|lot|item number|quantity|pack ref|ref)\b|\(\d{2,3}\)|\b\d{6,}\b/i;
const PRODUCT_WORD_SIGNAL_PATTERN =
  /\b(?:needle|needles|inj|injection|tab|tabs|tablet|tablets|capsule|capsules|caplet|caplets|vial|vials|amp|amps|syrup|cream|ointment|pack|pcs|pieces|mg|ml|g|mm|novofine)\b/i;
const EXPLICIT_PRICE_SIGNAL_PATTERN =
  /(?:£|\$|€|\b(?:gbp|eur|usd|price|prices|offer)\b)/i;

const ATTACHMENT_FILENAME_NOISE_PATTERN =
  /\b(?:price\s*list|stock\s*list|supplier\s*price\s*list|prices?|quotes?|quotations?|offers?|stock|inventory|sales|reports?|catalog(?:ue)?|april|may|january|february|march|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|20\d{2}|\d{1,2}[-_. ]?\d{1,2}[-_. ]?\d{2,4})\b/gi;
const GENERIC_ATTACHMENT_SUPPLIER_WORDS = new Set([
  'price',
  'prices',
  'list',
  'quote',
  'quotation',
  'offer',
  'stock',
  'inventory',
  'sales',
  'report',
  'supplier',
  'wholesale',
]);

function tableHeadersFromDocumentText(text: string): string[] {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return [];
  }

  return firstLine
    .split(/,|\t|;/)
    .map((header) => header.trim())
    .filter(Boolean);
}

function tableRowsFromDocumentText(document: {
  id: string;
  documentIndex: number;
  label: string | null;
  textContent: string;
}): Array<{
  attachmentId: string;
  sourceDocumentId: string;
  row: Record<string, unknown>;
}> {
  const rows: Array<{
    attachmentId: string;
    sourceDocumentId: string;
    row: Record<string, unknown>;
  }> = [];

  for (const line of document.textContent
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)) {
    const row = Object.fromEntries(
      line
        .split('|')
        .map((part) => part.trim())
        .map((part) => {
          const separatorIndex = part.indexOf(':');
          if (separatorIndex < 0) {
            return null;
          }

          const key = part.slice(0, separatorIndex).trim();
          const value = part.slice(separatorIndex + 1).trim();
          return key ? [key, value] : null;
        })
        .filter((entry): entry is [string, string] => Boolean(entry)),
    );

    if (Object.keys(row).length > 0) {
      rows.push({
        attachmentId: classifierAttachmentId({
          label: document.label,
          documentIndex: document.documentIndex,
        }),
        sourceDocumentId: document.id,
        row,
      });
    }
  }

  return rows;
}

function shouldPersistSupplierContactForClassification(
  classification: ReturnType<typeof classifyInboundDocument>,
): boolean {
  return (
    classification.routing === 'SUPPLIER_CONTACT_REVIEW' ||
    classification.routing === 'SUPPLIER_ONBOARDING_REVIEW' ||
    classification.primaryClass === 'SUPPLIER_CONTACT_FORM' ||
    classification.primaryClass === 'SUPPLIER_ONBOARDING_OR_KYC'
  );
}

function classifierAttachmentId(input: {
  label: string | null;
  documentIndex: number;
}) {
  return input.label || `document-${input.documentIndex}`;
}
function buildSupplierFamilyKey(value: string | null | undefined): string {
  let normalized = normalizeSupplierIdentityToken(value);

  if (!normalized) {
    return '';
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const suffix of SUPPLIER_FAMILY_SUFFIXES) {
      if (
        normalized.endsWith(suffix) &&
        normalized.length > suffix.length + 2
      ) {
        normalized = normalized.slice(0, -suffix.length);
        changed = true;
      }
    }
  }

  return normalized || normalizeSupplierIdentityToken(value);
}

function looksLikeCodeHeavyText(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';

  if (!trimmed) {
    return false;
  }

  const compact = trimmed.replace(/[\s()[\]-]+/g, '');
  const alphaCount = (compact.match(/[A-Za-z]/g) ?? []).length;
  const digitCount = (compact.match(/\d/g) ?? []).length;

  return (
    compact.length <= 14 &&
    digitCount > 0 &&
    alphaCount > 0 &&
    /^[A-Za-z0-9]+$/.test(compact)
  );
}

function shouldSuppressAttachmentTextOfferCandidate(
  candidate: StagedOfferCandidate,
): boolean {
  if (!candidate.sourceKind.includes('ATTACHMENT_TEXT')) {
    return false;
  }

  const rawProductText = candidate.rawProductText?.trim() ?? '';
  const sourceBlockText = candidate.sourceBlockText.trim();
  const hasExplicitPriceSignal =
    EXPLICIT_PRICE_SIGNAL_PATTERN.test(sourceBlockText);
  const hasProductWordSignal =
    PRODUCT_WORD_SIGNAL_PATTERN.test(rawProductText) ||
    PRODUCT_WORD_SIGNAL_PATTERN.test(sourceBlockText);
  const hasStructuredProductDetail = Boolean(
    candidate.strengthCandidate ||
    candidate.dosageFormCandidate ||
    candidate.packSizeCandidate,
  );
  const priceAmount = candidate.priceCandidate
    ? Number(candidate.priceCandidate.toString())
    : null;
  const strayLowPrice =
    priceAmount !== null &&
    priceAmount <= 5 &&
    !candidate.currencyCandidate &&
    !hasExplicitPriceSignal;
  const codeHeavyProductText = looksLikeCodeHeavyText(rawProductText);
  const codeHeavySourceText = looksLikeCodeHeavyText(sourceBlockText);
  const looksLikeReferenceNoise =
    ATTACHMENT_TEXT_NOISE_PATTERN.test(sourceBlockText) ||
    ATTACHMENT_TEXT_NOISE_PATTERN.test(rawProductText);

  if (
    !hasProductWordSignal &&
    (codeHeavyProductText || codeHeavySourceText || looksLikeReferenceNoise) &&
    !hasExplicitPriceSignal
  ) {
    return true;
  }

  if (
    !hasStructuredProductDetail &&
    !hasProductWordSignal &&
    (codeHeavyProductText ||
      codeHeavySourceText ||
      looksLikeReferenceNoise ||
      rawProductText.length < 14)
  ) {
    return true;
  }

  if ((codeHeavyProductText || looksLikeReferenceNoise) && strayLowPrice) {
    return true;
  }

  if (
    !hasStructuredProductDetail &&
    !hasProductWordSignal &&
    !candidate.currencyCandidate &&
    !hasExplicitPriceSignal
  ) {
    return true;
  }

  return false;
}

function isInternalSupplierDomain(domain: string | null | undefined): boolean {
  const normalizedDomain = normalizeFingerprintText(domain).replace(/^@+/, '');

  if (!normalizedDomain) {
    return false;
  }

  return getActiveInternalEmailDomains().some((entry) => {
    const normalizedEntry = normalizeFingerprintText(entry).replace(/^@+/, '');
    return (
      Boolean(normalizedEntry) &&
      (normalizedDomain === normalizedEntry ||
        normalizedDomain.endsWith(`.${normalizedEntry}`))
    );
  });
}

function isInternalSupplierCompanyName(
  candidateName: string | null | undefined,
): boolean {
  const normalizedCandidate = normalizeSupplierIdentityToken(candidateName);

  if (!normalizedCandidate) {
    return false;
  }

  return getActiveInternalCompanyNames().some((entry) => {
    const normalizedEntry = normalizeSupplierIdentityToken(entry);
    return (
      Boolean(normalizedEntry) &&
      (normalizedCandidate === normalizedEntry ||
        normalizedCandidate.includes(normalizedEntry) ||
        normalizedEntry.includes(normalizedCandidate))
    );
  });
}

function shouldIgnoreSupplierCue(input: {
  candidateName: string | null | undefined;
  sourceDomain?: string | null | undefined;
}): boolean {
  if (isInternalSupplierCompanyName(input.candidateName)) {
    return true;
  }

  if (isInternalSupplierDomain(input.sourceDomain)) {
    return true;
  }

  const candidateDomain = extractSenderDomain(input.candidateName ?? '');
  return isInternalSupplierDomain(candidateDomain);
}

function titleCaseSupplierCue(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      /^[A-Z]{2,}$/.test(part)
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(' ');
}

export function extractSupplierCueFromAttachmentFileName(
  fileName: string | null | undefined,
): string | null {
  const baseName = (fileName ?? '')
    .replace(/\.[A-Za-z0-9]{1,8}$/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[()[\]{}]+/g, ' ')
    .replace(ATTACHMENT_FILENAME_NOISE_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = normalizeFingerprintText(baseName);

  if (
    normalized.length < 4 ||
    /^\d+$/.test(normalized) ||
    GENERIC_ATTACHMENT_SUPPLIER_WORDS.has(normalized) ||
    normalized
      .split(/\s+/)
      .every((part) => GENERIC_ATTACHMENT_SUPPLIER_WORDS.has(part))
  ) {
    return null;
  }

  const alphaCount = (normalized.match(/[a-z]/g) ?? []).length;
  const digitCount = (normalized.match(/\d/g) ?? []).length;

  if (alphaCount < 4 || digitCount > alphaCount) {
    return null;
  }

  return titleCaseSupplierCue(baseName);
}

function extractAttachmentFilenameSupplierCue(input: {
  message: EmailInboundMessage;
  documents: Array<DocumentSegment & { id: string }>;
}): string | null {
  for (const attachment of input.message.attachments ?? []) {
    const normalized = normalizeEmailAttachment(attachment);
    if (!['CSV', 'XLSX'].includes(normalized.fileType)) {
      continue;
    }

    const candidate = extractSupplierCueFromAttachmentFileName(
      normalized.fileName,
    );
    if (candidate) {
      return candidate;
    }
  }

  for (const document of input.documents) {
    if (!['ATTACHMENT_TABLE', 'ATTACHMENT_TEXT'].includes(document.kind)) {
      continue;
    }

    const candidate = extractSupplierCueFromAttachmentFileName(document.label);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

type DocumentSegment = {
  kind:
    | 'SUBJECT'
    | 'BODY_MAIN'
    | 'BODY_FORWARDED'
    | 'SIGNATURE'
    | 'DISCLAIMER'
    | 'ATTACHMENT_TEXT'
    | 'ATTACHMENT_TABLE';
  label: string | null;
  textContent: string;
  metadata?: Prisma.InputJsonValue;
};

type OfferEvidence = {
  fieldName: string;
  evidenceType: string;
  rawText: string;
  startOffset?: number;
  endOffset?: number;
  confidence?: number;
};

type StagedOfferCandidate = {
  extractionRunId?: string | null;
  sourceKind: string;
  sourceBlockText: string;
  rawProductText: string | null;
  normalizedProductNameCandidate: string | null;
  strengthCandidate: string | null;
  dosageFormCandidate: string | null;
  packSizeCandidate: string | null;
  manufacturerCandidate: string | null;
  supplierCandidate: string | null;
  priceCandidate: Prisma.Decimal | null;
  currencyCandidate: string | null;
  minimumOrderQuantityCandidate: number | null;
  availabilityCandidate: string | null;
  sourceTrustScore: number;
  structureConfidence: number;
  fieldConfidence: number;
  entityResolutionConfidence: number;
  promotionConfidence: number;
  reviewReason: string | null;
  aiAssisted: boolean;
  evidences: OfferEvidence[];
  sourceDocumentIndex: number;
};

type ResolvedOfferCandidate = StagedOfferCandidate & {
  resolutionCandidates: Array<{
    entityType: 'PRODUCT' | 'SUPPLIER' | 'MANUFACTURER';
    candidateId: string | null;
    candidateName: string;
    confidence: number;
    reason: string;
    selected: boolean;
    metadata?: Prisma.InputJsonValue;
  }>;
};

type PromotionResult = {
  offerStatus: 'AUTO_PROMOTED' | 'REVIEW_REQUIRED' | 'REJECTED';
  decisionStatus: 'AUTO_PROMOTED' | 'REVIEW_REQUIRED' | 'REJECTED';
  reviewReason: string | null;
};

function findSelectedResolutionCandidate(
  offer: ResolvedOfferCandidate,
  entityType: 'PRODUCT' | 'SUPPLIER' | 'MANUFACTURER',
) {
  return (
    offer.resolutionCandidates.find(
      (candidate) => candidate.entityType === entityType && candidate.selected,
    ) ?? null
  );
}

function derivePromotionReviewReason(offer: ResolvedOfferCandidate): string {
  if (offer.reviewReason) {
    return offer.reviewReason;
  }

  const selectedSupplier = findSelectedResolutionCandidate(offer, 'SUPPLIER');
  const selectedProduct = findSelectedResolutionCandidate(offer, 'PRODUCT');

  if (offer.aiAssisted) {
    return 'ai_candidate_review_only';
  }

  if (!selectedSupplier?.candidateId || !selectedSupplier.candidateName) {
    return 'unresolved_supplier';
  }

  if (!offer.rawProductText || !selectedProduct) {
    return 'weak_product_match';
  }

  if (!offer.priceCandidate) {
    return 'missing_price';
  }

  if (!offer.currencyCandidate) {
    return 'missing_currency';
  }

  if (offer.sourceTrustScore < 55) {
    return 'source_trust_too_low';
  }

  if (offer.structureConfidence < 85) {
    return offer.sourceKind.includes('ATTACHMENT_TEXT')
      ? 'ocr_text_too_weak'
      : 'weak_structured_content';
  }

  if (offer.fieldConfidence < 75) {
    return 'promotion_threshold_missing_or_weak_fields';
  }

  if (offer.entityResolutionConfidence < 80) {
    return 'weak_product_match';
  }

  return 'promotion_threshold_not_met';
}

function buildWorkflowSyncInput(
  createdOfferId: string,
  inboundEmailId: string,
  promotionResult: PromotionResult,
  offer: ResolvedOfferCandidate,
) {
  return {
    emailDerivedOfferId: createdOfferId,
    inboundEmailId,
    offerStatus: promotionResult.offerStatus,
    sourceKind: offer.sourceKind,
    reviewReason: promotionResult.reviewReason ?? offer.reviewReason,
    aiAssisted: offer.aiAssisted,
    sourceTrustScore: offer.sourceTrustScore ?? null,
    promotionConfidence: offer.promotionConfidence ?? null,
    pricePresent: Boolean(offer.priceCandidate),
    supplierCandidate: offer.supplierCandidate,
    manufacturerCandidate: offer.manufacturerCandidate,
    resolutionCandidates: offer.resolutionCandidates,
  } as const;
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toHash(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

function buildNormalizedSourceBlockHash(value: string): string {
  return toHash(normalizeFingerprintText(value));
}

function buildAttachmentSummary(
  message: EmailInboundMessage,
): Prisma.InputJsonValue {
  return (message.attachments ?? []).map((attachment) => ({
    fileName: attachment.fileName ?? null,
    mimeType: attachment.mimeType ?? null,
    size: attachment.size ?? null,
    contentId: attachment.contentId ?? null,
    disposition: attachment.disposition ?? null,
    checksumSha256: attachmentChecksumSha256(attachment),
    fingerprint: attachmentMetadataFingerprint(attachment),
  })) as Prisma.InputJsonValue;
}

function buildAttachmentCacheKey(input: {
  fileName: string | null;
  contentId: string | null | undefined;
  index: number;
}): string {
  return [input.fileName ?? '', input.contentId ?? '', input.index].join('|');
}

function findSignatureSegment(bodyText: string): {
  bodyMain: string;
  signature: string | null;
} {
  const match = bodyText.match(SIGNATURE_PATTERN);

  if (!match || typeof match.index !== 'number') {
    return {
      bodyMain: bodyText.trim(),
      signature: null,
    };
  }

  return {
    bodyMain: bodyText.slice(0, match.index).trim(),
    signature: bodyText.slice(match.index).trim() || null,
  };
}

function findForwardedSegment(bodyText: string): {
  bodyMain: string;
  forwarded: string | null;
} {
  const forwardedMatch =
    bodyText.match(FORWARDED_HEADER_PATTERN) ??
    bodyText.match(ON_WROTE_PATTERN);

  if (!forwardedMatch || typeof forwardedMatch.index !== 'number') {
    return {
      bodyMain: bodyText.trim(),
      forwarded: null,
    };
  }

  return {
    bodyMain: bodyText.slice(0, forwardedMatch.index).trim(),
    forwarded: bodyText.slice(forwardedMatch.index).trim() || null,
  };
}

function findDisclaimerSegment(bodyText: string): {
  bodyMain: string;
  disclaimer: string | null;
} {
  const disclaimerMatch = bodyText.match(DISCLAIMER_PATTERN);

  if (!disclaimerMatch || typeof disclaimerMatch.index !== 'number') {
    return {
      bodyMain: bodyText.trim(),
      disclaimer: null,
    };
  }

  return {
    bodyMain: bodyText.slice(0, disclaimerMatch.index).trim(),
    disclaimer: bodyText.slice(disclaimerMatch.index).trim() || null,
  };
}

export async function decomposeEmail(
  message: EmailInboundMessage,
  options?: {
    extractAttachmentText?: typeof extractAttachmentText;
    extractedAttachmentTextByKey?: Map<
      string,
      {
        method: 'PDF_TEXT' | 'IMAGE_OCR';
        text: string;
        warnings: string[];
      }
    >;
  },
): Promise<DocumentSegment[]> {
  const segments: DocumentSegment[] = [];
  const extractAttachmentTextImpl =
    options?.extractAttachmentText ?? extractAttachmentText;
  const attachmentPairs = (message.attachments ?? []).map((attachment) => ({
    attachment,
    normalized: normalizeEmailAttachment(attachment),
  }));
  const filteredNormalizedAttachments = new Set(
    filterIgnorableEmailAttachments(
      attachmentPairs.map((pair) => pair.normalized),
    ),
  );
  const filteredAttachments = attachmentPairs.filter((pair) =>
    filteredNormalizedAttachments.has(pair.normalized),
  );

  if (message.subject?.trim()) {
    segments.push({
      kind: 'SUBJECT',
      label: 'subject',
      textContent: message.subject.trim(),
    });
  }

  const rawBody = normalizeWhitespace(message.bodyText ?? '');
  if (rawBody) {
    const disclaimerSplit = findDisclaimerSegment(rawBody);
    const forwardedSplit = findForwardedSegment(disclaimerSplit.bodyMain);
    const signatureSplit = findSignatureSegment(forwardedSplit.bodyMain);

    if (signatureSplit.bodyMain) {
      segments.push({
        kind: 'BODY_MAIN',
        label: 'body-main',
        textContent: signatureSplit.bodyMain,
      });
    }

    if (forwardedSplit.forwarded) {
      segments.push({
        kind: 'BODY_FORWARDED',
        label: 'body-forwarded',
        textContent: forwardedSplit.forwarded,
      });
    }

    if (signatureSplit.signature) {
      segments.push({
        kind: 'SIGNATURE',
        label: 'signature',
        textContent: signatureSplit.signature,
      });
    }

    if (disclaimerSplit.disclaimer) {
      segments.push({
        kind: 'DISCLAIMER',
        label: 'disclaimer',
        textContent: disclaimerSplit.disclaimer,
      });
    }
  }

  for (const [index, { attachment }] of filteredAttachments.entries()) {
    const fileName = attachment.fileName?.trim() || `attachment-${index + 1}`;
    const mimeType = attachment.mimeType?.trim() || '';
    const content =
      typeof attachment.content === 'string' && attachment.content.trim()
        ? Buffer.from(attachment.content, 'base64')
        : Buffer.isBuffer(attachment.content)
          ? attachment.content
          : null;

    if (!content) {
      continue;
    }

    if (
      fileName.toLowerCase().endsWith('.csv') ||
      fileName.toLowerCase().endsWith('.xlsx') ||
      mimeType === 'text/csv' ||
      mimeType ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      try {
        const parsed = await parseUploadedFile({
          buffer: content,
          mimetype: mimeType || 'application/octet-stream',
          originalname: fileName,
          size: attachment.size ?? content.byteLength,
        });
        const previewRows = parsed.rows.slice(0, 25);
        const previewText = previewRows
          .map((row) =>
            Object.entries(row)
              .map(([key, value]) => `${key}: ${value}`)
              .join(' | '),
          )
          .join('\n');

        if (previewText.trim()) {
          segments.push({
            kind: 'ATTACHMENT_TABLE',
            label: fileName,
            textContent: previewText,
            metadata: {
              fileName,
              rowCount: parsed.rows.length,
              warnings: parsed.warnings,
            },
          });
        }
      } catch {
        // Preserve current safe behavior; malformed attachments remain review-oriented.
      }
    }

    const attachmentCacheKey = buildAttachmentCacheKey({
      fileName,
      contentId: attachment.contentId,
      index,
    });
    const extractedAttachmentText =
      options?.extractedAttachmentTextByKey?.get(attachmentCacheKey) ??
      (await extractAttachmentTextImpl({
        fileType:
          fileName.toLowerCase().endsWith('.pdf') ||
          mimeType === 'application/pdf'
            ? 'PDF'
            : mimeType.startsWith('image/') ||
                ['.jpg', '.jpeg', '.png', '.webp'].some((extension) =>
                  fileName.toLowerCase().endsWith(extension),
                )
              ? 'IMAGE'
              : 'UNKNOWN',
        fileName,
        mimeType,
        buffer: content,
        size: attachment.size ?? content.byteLength,
        contentId: attachment.contentId ?? null,
        disposition: attachment.disposition ?? null,
        graphAttachmentId: attachment.graphAttachmentId ?? null,
      }));

    if (extractedAttachmentText?.text) {
      segments.push({
        kind: 'ATTACHMENT_TEXT',
        label: fileName,
        textContent: extractedAttachmentText.text,
        metadata: {
          fileName,
          extractionMethod: extractedAttachmentText.method,
          extractedTextChars: extractedAttachmentText.text.length,
          warnings: extractedAttachmentText.warnings,
        },
      });
    }
  }

  return segments;
}

function splitCommercialBlocks(text: string): string[] {
  return normalizeEmailTextForParsing(text)
    .split(/\n|;/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);
}

function parsePriceMatch(
  priceMatch: RegExpMatchArray | null,
): { amount: string; currency: string | null } | null {
  if (!priceMatch) {
    return null;
  }

  if (priceMatch[1] && priceMatch[2]) {
    return {
      amount: priceMatch[2],
      currency: priceMatch[1].toUpperCase(),
    };
  }

  if (priceMatch[3] && priceMatch[4]) {
    return {
      amount: priceMatch[4],
      currency:
        priceMatch[3] === '£'
          ? 'GBP'
          : priceMatch[3] === '$'
            ? 'USD'
            : priceMatch[3] === '€'
              ? 'EUR'
              : null,
    };
  }

  if (priceMatch[5]) {
    return {
      amount: priceMatch[5],
      currency: priceMatch[6]?.toUpperCase() ?? null,
    };
  }

  return null;
}

function extractSupplierCue(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.includes('@') || /^from\s*:/i.test(line)) {
      continue;
    }

    for (const match of line.matchAll(
      new RegExp(SUPPLIER_NAME_PATTERN.source, 'ig'),
    )) {
      const candidateName = match[1]?.trim();

      if (candidateName && !shouldIgnoreSupplierCue({ candidateName })) {
        return candidateName;
      }
    }
  }

  return null;
}

function extractForwardedSenderEmail(text: string): string | null {
  for (const match of text.matchAll(
    new RegExp(FORWARDED_SENDER_EMAIL_PATTERN.source, 'ig'),
  )) {
    const email = match[1]?.trim().toLowerCase() ?? null;

    if (email && !isInternalSupplierDomain(extractSenderDomain(email))) {
      return email;
    }
  }

  return null;
}

function extractForwardedSenderHeaderCue(text: string): string | null {
  const senderLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^from\s*:/i.test(line));

  for (const senderLine of senderLines) {
    const withoutPrefix = senderLine.replace(/^from\s*:\s*/i, '');
    const withoutEmail = withoutPrefix.replace(/\s*<[^>]+>.*/, '').trim();
    const supplierCue = extractSupplierCue(withoutEmail);

    if (
      supplierCue &&
      !shouldIgnoreSupplierCue({ candidateName: supplierCue })
    ) {
      return supplierCue;
    }
  }

  return null;
}

function inferSupplierNameFromDomain(domain: string | null): string | null {
  if (!domain || isInternalSupplierDomain(domain)) {
    return null;
  }

  const labels = domain.trim().toLowerCase().split('.').filter(Boolean);
  const companyLabel = labels.find(
    (label) =>
      !DOMAIN_COMPANY_FALLBACK_BLOCKLIST.has(label) && label.length > 2,
  );

  if (!companyLabel) {
    return null;
  }

  return companyLabel
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function deriveSourceTrustScore(
  message: EmailInboundMessage,
  result: EmailInboundResult,
): number {
  const item = result.items[0];
  const triageScore = item?.triageScores?.supplierLikelihoodScore ?? 0;
  const senderTrusted = env.emailInboundAllowedSenders
    .map((entry) => entry.trim().toLowerCase())
    .includes(message.from.trim().toLowerCase());

  return Math.max(triageScore, senderTrusted ? 55 : triageScore);
}

function buildOfferCandidateFromParsedRow(
  row: ReturnType<typeof parseStructuredPriceEmailBody>['parsedRows'][number],
  sourceDocumentIndex: number,
  sourceKind: string,
  sourceTrustScore: number,
): StagedOfferCandidate {
  const fieldConfidence =
    row.confidence === 'HIGH' ? 90 : row.confidence === 'MEDIUM' ? 72 : 45;

  return {
    sourceKind,
    sourceBlockText: row.rawLine,
    rawProductText: row.rawProductText,
    normalizedProductNameCandidate: row.productCandidates.normalizedKey,
    strengthCandidate: row.strength,
    dosageFormCandidate: row.formulation,
    packSizeCandidate: row.packSize,
    manufacturerCandidate: null,
    supplierCandidate: null,
    priceCandidate: new Prisma.Decimal(row.price),
    currencyCandidate: row.currencyCode,
    minimumOrderQuantityCandidate: null,
    availabilityCandidate: null,
    sourceTrustScore,
    structureConfidence: row.confidence === 'HIGH' ? 90 : 75,
    fieldConfidence,
    entityResolutionConfidence: 0,
    promotionConfidence: 0,
    reviewReason:
      row.confidence === 'LOW' ? 'deterministic_row_low_confidence' : null,
    aiAssisted: false,
    evidences: [
      {
        fieldName: 'rawProductText',
        evidenceType: 'deterministic_row',
        rawText: row.rawProductText,
        confidence: fieldConfidence,
      },
      {
        fieldName: 'priceCandidate',
        evidenceType: 'deterministic_row',
        rawText: String(row.price),
        confidence: fieldConfidence,
      },
      ...(row.currencyCode
        ? [
            {
              fieldName: 'currencyCandidate',
              evidenceType: 'deterministic_row',
              rawText: row.currencyCode,
              confidence: fieldConfidence,
            } satisfies OfferEvidence,
          ]
        : []),
    ],
    sourceDocumentIndex,
  };
}

export function extractLooseOfferCandidate(
  block: string,
  sourceDocumentIndex: number,
  sourceKind: string,
  sourceTrustScore: number,
): StagedOfferCandidate | null {
  const normalizedInput = normalizeEmailTextForParsing(block);
  const priceMatch = normalizedInput.match(PRICE_PATTERN);
  const parsedPrice = parsePriceMatch(priceMatch);
  if (!parsedPrice) {
    return null;
  }

  const normalizedBlock = normalizedInput.replace(/\s+/g, ' ').trim();
  const productText = normalizedBlock
    .replace(PRICE_PATTERN, ' ')
    .replace(MOQ_PATTERN, ' ')
    .replace(AVAILABILITY_PATTERN, ' ')
    .replace(MANUFACTURER_PATTERN, ' ')
    .replace(
      /\b(?:we can do|we can offer|offer|available|limited stock|instock|in stock|at)\b/gi,
      ' ',
    )
    .replace(/[,:;]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^(?:available|offer|stock|pricing)\s+/i, '')
    .replace(/\b(?:limited|ready)\s*$/i, '')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)\]]+$/g, '')
    .trim();

  if (!productText || productText.length < 6) {
    return null;
  }

  const candidates = buildProductCandidates(productText);
  if (!candidates.strength && !candidates.formulation && !candidates.packSize) {
    return null;
  }

  const manufacturer = block.match(MANUFACTURER_PATTERN)?.[1]?.trim() || null;
  const availability = block.match(AVAILABILITY_PATTERN)?.[1]?.trim() || null;
  const moqValue = block.match(MOQ_PATTERN)?.[1];
  const fieldConfidence = parsedPrice.currency ? 68 : 60;

  return {
    sourceKind,
    sourceBlockText: block,
    rawProductText: productText,
    normalizedProductNameCandidate: candidates.normalizedKey,
    strengthCandidate: candidates.strength,
    dosageFormCandidate: candidates.formulation,
    packSizeCandidate: candidates.packSize,
    manufacturerCandidate: manufacturer,
    supplierCandidate: null,
    priceCandidate: new Prisma.Decimal(parsedPrice.amount),
    currencyCandidate: parsedPrice.currency,
    minimumOrderQuantityCandidate: moqValue ? Number(moqValue) : null,
    availabilityCandidate: availability,
    sourceTrustScore,
    structureConfidence: 62,
    fieldConfidence,
    entityResolutionConfidence: 0,
    promotionConfidence: 0,
    reviewReason: 'mixed_commercial_prose_requires_review',
    aiAssisted: false,
    evidences: [
      {
        fieldName: 'rawProductText',
        evidenceType: 'proximity_block',
        rawText: productText,
        confidence: fieldConfidence,
      },
      {
        fieldName: 'priceCandidate',
        evidenceType: 'price_token',
        rawText: priceMatch?.[0] ?? parsedPrice.amount,
        confidence: fieldConfidence,
      },
      ...(manufacturer
        ? [
            {
              fieldName: 'manufacturerCandidate',
              evidenceType: 'manufacturer_cue',
              rawText: manufacturer,
              confidence: 65,
            } satisfies OfferEvidence,
          ]
        : []),
      ...(availability
        ? [
            {
              fieldName: 'availabilityCandidate',
              evidenceType: 'availability_cue',
              rawText: availability,
              confidence: 65,
            } satisfies OfferEvidence,
          ]
        : []),
    ],
    sourceDocumentIndex,
  };
}

function dedupeOffers(
  candidates: StagedOfferCandidate[],
): StagedOfferCandidate[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const stableKey = [
      candidate.sourceDocumentIndex,
      buildNormalizedSourceBlockHash(candidate.sourceBlockText),
      candidate.priceCandidate?.toString() ?? '',
      candidate.currencyCandidate ?? '',
      candidate.minimumOrderQuantityCandidate ?? '',
      normalizeFingerprintText(candidate.manufacturerCandidate),
      buildNormalizedSourceBlockHash(candidate.sourceBlockText),
    ].join('|');

    if (seen.has(stableKey)) {
      return false;
    }

    seen.add(stableKey);
    return true;
  });
}

function buildOfferFingerprint(
  inboundEmailId: string,
  offer: ResolvedOfferCandidate,
): string {
  const selectedSupplier = offer.resolutionCandidates.find(
    (candidate) => candidate.entityType === 'SUPPLIER' && candidate.selected,
  );

  return toHash(
    [
      inboundEmailId,
      `doc-index:${offer.sourceDocumentIndex}`,
      normalizeFingerprintText(
        offer.normalizedProductNameCandidate ?? offer.rawProductText,
      ),
      offer.priceCandidate?.toString() ?? '',
      normalizeFingerprintText(offer.currencyCandidate),
      offer.minimumOrderQuantityCandidate ?? '',
      normalizeFingerprintText(offer.manufacturerCandidate),
      normalizeFingerprintText(
        offer.supplierCandidate ?? selectedSupplier?.candidateName ?? null,
      ),
      buildNormalizedSourceBlockHash(offer.sourceBlockText),
    ].join('|'),
  );
}

function buildPromotionFingerprint(
  offer: ResolvedOfferCandidate,
  selectedSupplierName: string,
  productId: string,
): string {
  return toHash(
    [
      productId,
      normalizeFingerprintText(selectedSupplierName),
      normalizeFingerprintText(
        offer.normalizedProductNameCandidate ?? offer.rawProductText,
      ),
      offer.priceCandidate?.toString() ?? '',
      normalizeFingerprintText(offer.currencyCandidate),
      offer.minimumOrderQuantityCandidate ?? '',
      normalizeFingerprintText(offer.manufacturerCandidate),
      buildNormalizedSourceBlockHash(offer.sourceBlockText),
    ].join('|'),
  );
}

export function mergeResolvedOffers(
  deterministicOffers: ResolvedOfferCandidate[],
  aiOffers: ResolvedOfferCandidate[],
): ResolvedOfferCandidate[] {
  return dedupeOffers([
    ...deterministicOffers,
    ...aiOffers,
  ]) as ResolvedOfferCandidate[];
}

async function resolveOfferCandidates(
  message: EmailInboundMessage,
  documents: Array<DocumentSegment & { id: string }>,
  offers: StagedOfferCandidate[],
  sourceLearningContext: {
    sourceSystem: string;
    senderEmail: string;
    senderDomain: string | null;
    templateFingerprint: string;
  },
): Promise<ResolvedOfferCandidate[]> {
  const resolvedOffers: ResolvedOfferCandidate[] = [];

  for (const offer of offers) {
    const learnedHints = await getLearnedResolutionHints({
      ...sourceLearningContext,
      rawProductText: offer.rawProductText,
      normalizedProductNameCandidate: offer.normalizedProductNameCandidate,
    });
    const resolutionCandidates: ResolvedOfferCandidate['resolutionCandidates'] =
      [];

    if (offer.normalizedProductNameCandidate) {
      const product = await db.product.findFirst({
        where: {
          normalizedName: offer.normalizedProductNameCandidate,
        },
      });
      if (product) {
        resolutionCandidates.push({
          entityType: 'PRODUCT',
          candidateId: product.id,
          candidateName: product.name,
          confidence: 90,
          reason: 'exact_normalized_name_match',
          selected: true,
        });

        if (!offer.manufacturerCandidate && product.manufacturer) {
          resolutionCandidates.push({
            entityType: 'MANUFACTURER',
            candidateId: null,
            candidateName: product.manufacturer,
            confidence: 55,
            reason: 'matched_product_existing_manufacturer',
            selected: false,
          });
        }
      } else {
        const alias = await db.productAlias.findFirst({
          where: {
            aliasName: offer.rawProductText ?? undefined,
          },
          include: {
            product: true,
          },
        });
        if (alias?.product) {
          resolutionCandidates.push({
            entityType: 'PRODUCT',
            candidateId: alias.product.id,
            candidateName: alias.product.name,
            confidence: 80,
            reason: 'exact_raw_alias_match',
            selected: true,
          });
        }
      }
    }

    const supplierCues = [
      {
        candidateName: extractManualSupplierOverride({
          subject: message.subject ?? null,
          bodyText: message.bodyText ?? null,
        }),
        confidence: 95,
        reason: 'manual_supplier_override',
      },
      {
        candidateName: resolveSupplierNameFromSender(
          message.from,
          env.emailInboundSupplierMappings,
        ),
        confidence: 88,
        reason: 'sender_mapping',
      },
      {
        candidateName: learnedHints.supplierSuggestion?.supplierName ?? null,
        confidence: learnedHints.supplierSuggestion?.confidence ?? 0,
        reason:
          learnedHints.supplierSuggestion?.reason ??
          'learned_source_supplier_hint',
      },
      {
        candidateName: extractSupplierCue(
          documents
            .filter((document) =>
              ['BODY_MAIN', 'BODY_FORWARDED'].includes(document.kind),
            )
            .map((document) => document.textContent)
            .join('\n\n'),
        ),
        confidence: 70,
        reason: 'body_company_cue',
        supportsConflict: false,
      },
      {
        candidateName: extractSupplierCue(
          documents.find((document) => document.kind === 'SIGNATURE')
            ?.textContent ?? '',
        ),
        confidence: 66,
        reason: 'signature_company_cue',
      },
      {
        candidateName: extractSupplierCue(
          documents.find((document) => document.kind === 'BODY_FORWARDED')
            ?.textContent ?? '',
        ),
        confidence: 62,
        reason: 'forwarded_company_cue',
      },
      {
        candidateName: extractForwardedSenderHeaderCue(
          documents
            .filter((document) =>
              ['BODY_MAIN', 'BODY_FORWARDED'].includes(document.kind),
            )
            .map((document) => document.textContent)
            .join('\n\n'),
        ),
        confidence: 74,
        reason: 'forwarded_sender_header',
      },
      {
        candidateName: inferSupplierNameFromDomain(
          extractSenderDomain(
            extractForwardedSenderEmail(
              documents
                .filter((document) =>
                  ['BODY_MAIN', 'BODY_FORWARDED'].includes(document.kind),
                )
                .map((document) => document.textContent)
                .join('\n\n'),
            ) ?? '',
          ),
        ),
        confidence: 72,
        reason: 'forwarded_sender_domain',
      },
      {
        candidateName: extractSupplierCue(
          documents
            .filter((document) => document.kind === 'ATTACHMENT_TEXT')
            .map((document) => document.textContent)
            .join('\n\n'),
        ),
        confidence: 54,
        reason: 'attachment_text_company_cue',
        supportsConflict: false,
      },
      {
        candidateName: extractAttachmentFilenameSupplierCue({
          message,
          documents,
        }),
        confidence: 50,
        reason: 'attachment_filename_company_cue',
        supportsConflict: false,
      },
    ]
      .filter(
        (
          cue,
        ): cue is {
          candidateName: string;
          confidence: number;
          reason: string;
          supportsConflict?: boolean;
        } => Boolean(cue.candidateName?.trim()),
      )
      .filter(
        (cue) => !shouldIgnoreSupplierCue({ candidateName: cue.candidateName }),
      );
    const hasForwardedSenderDomainCue = supplierCues.some(
      (cue) => cue.reason === 'forwarded_sender_domain',
    );

    const groupedSupplierCues = new Map<
      string,
      {
        candidateName: string;
        confidence: number;
        reason: string;
        supportsConflict: boolean;
        aliases: string[];
      }
    >();

    for (const cue of supplierCues) {
      const supplierFamilyKey =
        buildSupplierFamilyKey(cue.candidateName) ||
        normalizeFingerprintText(cue.candidateName);
      const existingCue = groupedSupplierCues.get(supplierFamilyKey);

      if (!existingCue || cue.confidence > existingCue.confidence) {
        groupedSupplierCues.set(supplierFamilyKey, {
          ...cue,
          supportsConflict:
            cue.reason === 'signature_company_cue' &&
            hasForwardedSenderDomainCue
              ? false
              : (cue.supportsConflict ?? true),
          aliases: Array.from(
            new Set([...(existingCue?.aliases ?? []), cue.candidateName]),
          ),
        });
        continue;
      }

      existingCue.aliases = Array.from(
        new Set([...existingCue.aliases, cue.candidateName]),
      );
      existingCue.supportsConflict =
        existingCue.supportsConflict &&
        (cue.reason === 'signature_company_cue' && hasForwardedSenderDomainCue
          ? false
          : (cue.supportsConflict ?? true));
    }

    const supplierCandidates = Array.from(groupedSupplierCues.values()).sort(
      (left, right) => right.confidence - left.confidence,
    );
    const supplierCueConflict =
      supplierCandidates.filter((candidate) => candidate.supportsConflict)
        .length > 1;
    const selectedSupplierCue = supplierCueConflict
      ? null
      : (supplierCandidates[0] ?? null);
    const bestDetectedSupplierName =
      selectedSupplierCue?.candidateName ??
      supplierCandidates[0]?.candidateName ??
      null;
    let selectedResolvedSupplierName: string | null = null;

    for (const candidate of supplierCandidates) {
      const supplier = await db.supplier.findFirst({
        where: {
          normalizedName: candidate.candidateName.trim().toLowerCase(),
        },
      });
      const candidateSelected =
        Boolean(selectedSupplierCue) &&
        Boolean(supplier?.id) &&
        normalizeFingerprintText(selectedSupplierCue?.candidateName) ===
          normalizeFingerprintText(candidate.candidateName);

      if (candidateSelected) {
        selectedResolvedSupplierName =
          supplier?.name ?? candidate.candidateName;
      }

      resolutionCandidates.push({
        entityType: 'SUPPLIER',
        candidateId: supplier?.id ?? null,
        candidateName: supplier?.name ?? candidate.candidateName,
        confidence: candidate.confidence,
        reason: candidate.reason,
        selected: candidateSelected,
        metadata:
          supplierCueConflict || candidate.aliases.length > 1
            ? {
                ...(supplierCueConflict
                  ? {
                      ambiguous: true,
                    }
                  : {}),
                aliases: candidate.aliases.filter(
                  (alias) =>
                    normalizeFingerprintText(alias) !==
                    normalizeFingerprintText(candidate.candidateName),
                ),
              }
            : undefined,
      });
    }

    if (offer.manufacturerCandidate) {
      resolutionCandidates.push({
        entityType: 'MANUFACTURER',
        candidateId: null,
        candidateName: offer.manufacturerCandidate,
        confidence: 82,
        reason: 'explicit_local_manufacturer_cue',
        selected: true,
      });
    } else if (learnedHints.manufacturerSuggestion) {
      resolutionCandidates.push({
        entityType: 'MANUFACTURER',
        candidateId: null,
        candidateName: learnedHints.manufacturerSuggestion.manufacturer,
        confidence: learnedHints.manufacturerSuggestion.confidence,
        reason: learnedHints.manufacturerSuggestion.reason,
        selected: false,
        metadata: {
          learned: true,
        },
      });
    }

    const bestResolutionConfidence = Math.max(
      0,
      ...resolutionCandidates.map((candidate) => candidate.confidence),
    );
    const promotionConfidence = Math.round(
      offer.sourceTrustScore * 0.25 +
        offer.structureConfidence * 0.3 +
        offer.fieldConfidence * 0.25 +
        bestResolutionConfidence * 0.2,
    );

    resolvedOffers.push({
      ...offer,
      supplierCandidate:
        selectedResolvedSupplierName ?? bestDetectedSupplierName,
      reviewReason:
        offer.reviewReason ??
        (supplierCueConflict
          ? 'conflicting_supplier_cues'
          : !selectedResolvedSupplierName && offer.priceCandidate
            ? 'unresolved_supplier'
            : learnedHints.shouldForceReview
              ? 'source_trust_too_low'
              : null),
      entityResolutionConfidence: bestResolutionConfidence,
      promotionConfidence,
      resolutionCandidates,
    });
  }

  return resolvedOffers;
}

function shouldAttemptAiFallback(
  resolvedOffers: Awaited<ReturnType<typeof resolveOfferCandidates>>,
  result: EmailInboundResult,
): boolean {
  const bodyItem = result.items[0];
  if (!bodyItem) {
    return false;
  }

  if (
    resolvedOffers.some(
      (offer) => offer.structureConfidence >= 80 && !offer.reviewReason,
    )
  ) {
    return false;
  }

  return (
    bodyItem.triageStatus === 'AI_REVIEW_ELIGIBLE' ||
    (bodyItem.triageStatus === 'MANUAL_REVIEW_REQUIRED' &&
      bodyItem.aiEligible === true)
  );
}

export function buildAiOfferCandidates(
  aiResult: Awaited<ReturnType<typeof parseStructuredPriceText>>,
  sourceDocumentIndexes: {
    bodyMain: number | null;
    bodyForwarded: number | null;
    signature: number | null;
  },
  sourceTrustScore: number,
): StagedOfferCandidate[] {
  return aiResult.parsedRows.map((row) => ({
    sourceKind: 'AI_PARAGRAPH_OFFER',
    sourceBlockText: row.rawLine,
    rawProductText: row.rawProductText,
    normalizedProductNameCandidate: row.productCandidates.normalizedKey,
    strengthCandidate: row.strength,
    dosageFormCandidate: row.formulation,
    packSizeCandidate: row.packSize,
    manufacturerCandidate: row.manufacturer ?? null,
    supplierCandidate: aiResult.supplierName ?? null,
    priceCandidate: new Prisma.Decimal(row.price),
    currencyCandidate: row.currencyCode,
    minimumOrderQuantityCandidate: row.minimumOrderQuantity ?? null,
    availabilityCandidate: row.availability ?? null,
    sourceTrustScore,
    structureConfidence: aiResult.overallConfidence === 'HIGH' ? 72 : 58,
    fieldConfidence: row.confidence === 'HIGH' ? 68 : 55,
    entityResolutionConfidence: 0,
    promotionConfidence: 0,
    reviewReason: 'ai_candidate_review_only',
    aiAssisted: true,
    evidences: [
      {
        fieldName: 'rawProductText',
        evidenceType: 'ai_candidate',
        rawText: row.evidenceText ?? row.rawProductText,
        confidence: 60,
      },
      {
        fieldName: 'priceCandidate',
        evidenceType: 'ai_candidate',
        rawText: row.evidenceText ?? String(row.price),
        confidence: 60,
      },
      ...(row.minimumOrderQuantity !== null &&
      row.minimumOrderQuantity !== undefined
        ? [
            {
              fieldName: 'minimumOrderQuantityCandidate',
              evidenceType: 'ai_candidate',
              rawText: row.evidenceText ?? String(row.minimumOrderQuantity),
              confidence: 60,
            } satisfies OfferEvidence,
          ]
        : []),
      ...(row.availability
        ? [
            {
              fieldName: 'availabilityCandidate',
              evidenceType: 'ai_candidate',
              rawText: row.evidenceText ?? row.availability,
              confidence: 60,
            } satisfies OfferEvidence,
          ]
        : []),
      ...(row.manufacturer
        ? [
            {
              fieldName: 'manufacturerCandidate',
              evidenceType: 'ai_candidate',
              rawText: row.evidenceText ?? row.manufacturer,
              confidence: 60,
            } satisfies OfferEvidence,
          ]
        : []),
      ...(aiResult.supplierName
        ? [
            {
              fieldName: 'supplierCandidate',
              evidenceType: 'ai_candidate',
              rawText: aiResult.supplierName,
              confidence: 60,
            } satisfies OfferEvidence,
          ]
        : []),
    ],
    sourceDocumentIndex:
      row.sourceSegment === 'BODY_MAIN'
        ? (sourceDocumentIndexes.bodyMain ?? 0)
        : row.sourceSegment === 'BODY_FORWARDED'
          ? (sourceDocumentIndexes.bodyForwarded ??
            sourceDocumentIndexes.bodyMain ??
            0)
          : row.sourceSegment === 'SIGNATURE'
            ? (sourceDocumentIndexes.signature ??
              sourceDocumentIndexes.bodyMain ??
              0)
            : (sourceDocumentIndexes.bodyMain ??
              sourceDocumentIndexes.bodyForwarded ??
              0),
  }));
}

export async function persistPromotion(
  inboundEmailId: string,
  offerId: string,
  offer: ResolvedOfferCandidate,
): Promise<PromotionResult> {
  const selectedSupplier = offer.resolutionCandidates.find(
    (candidate) => candidate.entityType === 'SUPPLIER' && candidate.selected,
  );

  if (
    offer.aiAssisted ||
    !selectedSupplier?.candidateId ||
    !selectedSupplier.candidateName ||
    !offer.rawProductText ||
    !offer.priceCandidate ||
    !offer.currencyCandidate ||
    offer.sourceTrustScore < 55 ||
    offer.structureConfidence < 85 ||
    offer.fieldConfidence < 75 ||
    offer.entityResolutionConfidence < 80 ||
    offer.promotionConfidence < 80
  ) {
    const reviewReason = derivePromotionReviewReason(offer);
    await db.$transaction(async (tx) => {
      await tx.emailDerivedOffer.update({
        where: { id: offerId },
        data: {
          status: 'REVIEW_REQUIRED',
          reviewReason,
        },
      });

      await tx.promotionDecision.create({
        data: {
          inboundEmailId,
          emailDerivedOfferId: offerId,
          status: 'REVIEW_REQUIRED',
          reason: reviewReason,
        },
      });
    });

    return {
      offerStatus: 'REVIEW_REQUIRED',
      decisionStatus: 'REVIEW_REQUIRED',
      reviewReason,
    };
  }

  const rawProductText = offer.rawProductText;
  const currencyCode = offer.currencyCandidate;
  const unitPrice = offer.priceCandidate;

  await db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: {
        id: selectedSupplier.candidateId!,
      },
    });

    if (!supplier) {
      throw new Error(
        `Resolved supplier ${selectedSupplier.candidateId} was not found during promotion.`,
      );
    }

    const product = await findOrCreateProduct(
      rawProductText,
      buildProductCandidates(rawProductText),
      'email:body-auto-promotion',
      offer.manufacturerCandidate,
      tx,
    );
    const supplierPriceList = await tx.supplierPriceList.upsert({
      where: {
        supplierId_sourceInboundEmailId: {
          supplierId: supplier.id,
          sourceInboundEmailId: inboundEmailId,
        },
      },
      update: {
        currencyCode,
        notes: `Auto-promoted from inbound email ${inboundEmailId}`,
      },
      create: {
        supplierId: supplier.id,
        sourceInboundEmailId: inboundEmailId,
        fileName: `email-body-${inboundEmailId}.txt`,
        fileMimeType: 'message/rfc822',
        notes: `Auto-promoted from inbound email ${inboundEmailId}`,
        currencyCode,
      },
    });
    const promotionFingerprint = buildPromotionFingerprint(
      offer,
      selectedSupplier.candidateName,
      product.id,
    );

    await tx.supplierPriceItem.upsert({
      where: {
        supplierPriceListId_promotionFingerprint: {
          supplierPriceListId: supplierPriceList.id,
          promotionFingerprint,
        },
      },
      update: {
        supplierId: supplier.id,
        productId: product.id,
        rawProductName: rawProductText,
        normalizedProductName:
          offer.normalizedProductNameCandidate ?? undefined,
        candidateStrength: offer.strengthCandidate,
        candidateFormulation: offer.dosageFormCandidate,
        candidatePackSize: offer.packSizeCandidate,
        unitPrice,
        currencyCode,
        minimumOrderQuantity: offer.minimumOrderQuantityCandidate,
        isAvailable: offer.availabilityCandidate
          ? /available|in stock|instock|ready/i.test(
              offer.availabilityCandidate,
            )
          : true,
        rawRow: {
          source: 'inbound_email',
          inboundEmailId,
          sourceBlockText: offer.sourceBlockText,
          offerFingerprint: buildNormalizedSourceBlockHash(
            offer.sourceBlockText,
          ),
        },
      },
      create: {
        supplierPriceListId: supplierPriceList.id,
        supplierId: supplier.id,
        productId: product.id,
        rawProductName: rawProductText,
        normalizedProductName:
          offer.normalizedProductNameCandidate ?? undefined,
        candidateStrength: offer.strengthCandidate,
        candidateFormulation: offer.dosageFormCandidate,
        candidatePackSize: offer.packSizeCandidate,
        unitPrice,
        currencyCode,
        minimumOrderQuantity: offer.minimumOrderQuantityCandidate,
        isAvailable: offer.availabilityCandidate
          ? /available|in stock|instock|ready/i.test(
              offer.availabilityCandidate,
            )
          : true,
        promotionFingerprint,
        rawRow: {
          source: 'inbound_email',
          inboundEmailId,
          sourceBlockText: offer.sourceBlockText,
          offerFingerprint: buildNormalizedSourceBlockHash(
            offer.sourceBlockText,
          ),
        },
      },
    });

    await tx.emailDerivedOffer.update({
      where: { id: offerId },
      data: {
        status: 'AUTO_PROMOTED',
        reviewReason: null,
      },
    });

    await tx.promotionDecision.create({
      data: {
        inboundEmailId,
        emailDerivedOfferId: offerId,
        status: 'AUTO_PROMOTED',
        reason: 'strict_deterministic_offer_met_promotion_threshold',
      },
    });
  });

  return {
    offerStatus: 'AUTO_PROMOTED',
    decisionStatus: 'AUTO_PROMOTED',
    reviewReason: null,
  };
}

export async function stageInboundEmail(
  message: EmailInboundMessage,
  result: EmailInboundResult,
): Promise<void> {
  const sourceSystem = message.sourceSystem?.trim() || 'MICROSOFT_GRAPH';
  const externalMessageId =
    message.externalMessageId?.trim() || message.messageId?.trim() || null;
  const baseInboundEmailData = {
    sourceSystem,
    externalMessageId,
    internetMessageId: message.messageId?.trim() || null,
    conversationId: message.conversationId?.trim() || null,
    fromEmail: message.from.trim().toLowerCase(),
    fromName: message.fromName?.trim() || null,
    subject: message.subject?.trim() || null,
    rawHtml: message.rawHtml ?? null,
    rawText: message.bodyText ?? null,
    bodyHash: toHash(message.bodyText ?? ''),
    senderDomain: extractSenderDomain(message.from),
    attachmentSummary: buildAttachmentSummary(message),
    receivedAt: message.receivedAt ?? null,
    processedAt: new Date(),
  };
  const inboundEmail = externalMessageId
    ? await db.inboundEmail.upsert({
        where: {
          sourceSystem_externalMessageId: {
            sourceSystem,
            externalMessageId,
          },
        },
        // Count each staging attempt. A successful run terminalises the status
        // (non-RECEIVED), so the poller's dedup stops re-polling it — meaning
        // this counter only climbs while a message keeps failing.
        update: { ...baseInboundEmailData, ingestAttempts: { increment: 1 } },
        create: { ...baseInboundEmailData, ingestAttempts: 1 },
      })
    : await db.inboundEmail.create({
        data: { ...baseInboundEmailData, ingestAttempts: 1 },
      });

  // Dead-letter a poison message: after too many failed attempts, move it to a
  // terminal FAILED state (and stop here) so it is not re-staged on every poll
  // forever. The poller marks a non-RECEIVED message read, so it leaves the
  // inbox while staying visible to operators as FAILED.
  if (inboundEmail.ingestAttempts > MAX_INGEST_ATTEMPTS) {
    await db.inboundEmail.update({
      where: { id: inboundEmail.id },
      data: {
        processingStatus: 'FAILED',
        reviewReason: 'dead_lettered_after_repeated_ingest_failures',
        processedAt: new Date(),
      },
    });
    logger.warn('Inbound email dead-lettered after repeated ingest failures', {
      inboundEmailId: inboundEmail.id,
      ingestAttempts: inboundEmail.ingestAttempts,
    });
    return;
  }

  await db.$transaction([
    db.emailDerivedOfferEvidence.deleteMany({
      where: {
        emailDerivedOffer: {
          inboundEmailId: inboundEmail.id,
        },
      },
    }),
    db.entityResolutionCandidate.deleteMany({
      where: {
        emailDerivedOffer: {
          inboundEmailId: inboundEmail.id,
        },
      },
    }),
    db.promotionDecision.deleteMany({
      where: {
        inboundEmailId: inboundEmail.id,
      },
    }),
    db.emailExtractionRun.deleteMany({
      where: {
        inboundEmailId: inboundEmail.id,
      },
    }),
    db.inboundEmailDocument.deleteMany({
      where: {
        inboundEmailId: inboundEmail.id,
      },
    }),
  ]);

  const sourceTrustScore = deriveSourceTrustScore(message, result);
  const bodyItem = result.items[0];
  const triageStatus =
    bodyItem?.triageStatus ??
    (result.ignored ? 'IGNORED_NON_ACTIONABLE' : null);
  const extractedAttachmentTextByKey = new Map<
    string,
    {
      method: 'PDF_TEXT' | 'IMAGE_OCR';
      text: string;
      warnings: string[];
    }
  >();
  result.items.forEach((item, index) => {
    if (!item.attachmentTextExtraction?.text) {
      return;
    }

    extractedAttachmentTextByKey.set(
      buildAttachmentCacheKey({
        fileName: item.attachment.fileName,
        contentId: item.attachment.contentId,
        index,
      }),
      {
        method: item.attachmentTextExtraction.method,
        text: item.attachmentTextExtraction.text,
        warnings: item.attachmentTextExtraction.warnings,
      },
    );
  });
  const segments = await decomposeEmail(message, {
    extractedAttachmentTextByKey,
  });
  const sourceTemplateFingerprint = buildSourceTemplateFingerprint({
    sourceSystem,
    senderEmail: message.from,
    subject: message.subject ?? null,
    documentKinds: segments.map((segment) => segment.kind),
    attachmentSummary: baseInboundEmailData.attachmentSummary,
    bodyText: message.bodyText ?? null,
  });
  await db.inboundEmail.update({
    where: { id: inboundEmail.id },
    data: {
      senderDomain: extractSenderDomain(message.from),
      sourceTemplateFingerprint,
    },
  });
  const documents = await Promise.all(
    segments.map((segment, index) =>
      db.inboundEmailDocument.upsert({
        where: {
          inboundEmailId_kind_documentIndex: {
            inboundEmailId: inboundEmail.id,
            kind: segment.kind,
            documentIndex: index,
          },
        },
        update: {
          label: segment.label,
          textContent: segment.textContent,
          metadata: segment.metadata,
        },
        create: {
          inboundEmailId: inboundEmail.id,
          kind: segment.kind,
          documentIndex: index,
          label: segment.label,
          textContent: segment.textContent,
          metadata: segment.metadata,
        },
      }),
    ),
  );

  const documentClassification = classifyInboundDocument({
    fromEmail: message.from,
    fromName: message.fromName ?? null,
    senderEmail: message.sender ?? null,
    senderName: message.senderName ?? null,
    replyTo: message.replyTo ?? null,
    senderDomain: extractSenderDomain(message.from),
    subject: message.subject ?? null,
    bodyText: message.bodyText ?? null,
    internetMessageHeaders: message.internetMessageHeaders ?? null,
    attachments: (message.attachments ?? []).map((attachment, index) => ({
      attachmentId:
        attachment.graphAttachmentId ??
        attachment.contentId ??
        attachment.fileName ??
        `attachment-${index + 1}`,
      fileName: attachment.fileName ?? null,
      mimeType: attachment.mimeType ?? null,
      disposition: attachment.disposition ?? null,
    })),
    attachmentTexts: documents
      .filter((document) => document.kind === 'ATTACHMENT_TEXT')
      .map((document) => ({
        attachmentId: classifierAttachmentId({
          label: document.label,
          documentIndex: document.documentIndex,
        }),
        fileName: document.label,
        text: document.textContent,
        method: 'PDF_TEXT',
      })),
    tables: documents
      .filter((document) => document.kind === 'ATTACHMENT_TABLE')
      .map((document) => ({
        attachmentId: classifierAttachmentId({
          label: document.label,
          documentIndex: document.documentIndex,
        }),
        fileName: document.label,
        headers: tableHeadersFromDocumentText(document.textContent),
      })),
    trustedSender: sourceTrustScore >= 55,
    knownSupplierMappings: env.emailInboundSupplierMappings,
    sourceTemplateFingerprint,
  });

  const deterministicRun = await db.emailExtractionRun.create({
    data: {
      inboundEmailId: inboundEmail.id,
      method: 'DETERMINISTIC',
      status: 'COMPLETED',
      extractorVersion: EXTRACTOR_VERSION,
      notes: {
        ignored: result.ignored,
        triageStatus,
        documentClassification: {
          runnerVersion: documentClassification.runnerVersion,
          primaryClass: documentClassification.primaryClass,
          routing: documentClassification.routing,
          confidence: documentClassification.confidence,
          score: documentClassification.score,
          safeToAutoRoute: documentClassification.safeToAutoRoute,
          conflicts: documentClassification.conflicts,
          attachmentDecisions: documentClassification.attachmentDecisions,
        },
      },
    },
  });

  if (shouldPersistSupplierContactForClassification(documentClassification)) {
    const supplierContactCandidate = extractSupplierContact({
      fromEmail: message.from,
      fromName: message.fromName ?? null,
      senderEmail: message.sender ?? null,
      senderName: message.senderName ?? null,
      replyTo: message.replyTo ?? null,
      internetMessageHeaders: message.internetMessageHeaders ?? null,
      bodyText: message.bodyText ?? null,
      attachmentRows: documents
        .filter((document) => document.kind === 'ATTACHMENT_TABLE')
        .flatMap((document) => tableRowsFromDocumentText(document)),
      attachmentTexts: documents
        .filter((document) => document.kind === 'ATTACHMENT_TEXT')
        .map((document) => ({
          attachmentId: classifierAttachmentId({
            label: document.label,
            documentIndex: document.documentIndex,
          }),
          sourceDocumentId: document.id,
          text: document.textContent,
        })),
      attachmentFileNames: (message.attachments ?? []).map(
        (attachment, index) => ({
          attachmentId:
            attachment.graphAttachmentId ??
            attachment.contentId ??
            attachment.fileName ??
            `attachment-${index + 1}`,
          fileName: attachment.fileName ?? null,
        }),
      ),
      supplierMappings: env.emailInboundSupplierMappings,
      internalDomains: getActiveInternalEmailDomains(),
    });
    const persistedSupplierContacts =
      await persistSupplierContactCandidatesForInboundEmail({
        inboundEmailId: inboundEmail.id,
        message,
        documents: documents.map((document) => ({
          id: document.id,
          kind: document.kind,
          label: document.label,
          textContent: document.textContent,
        })),
        classification: documentClassification,
        candidates: [supplierContactCandidate],
      });

    if (persistedSupplierContacts.length > 0) {
      logger.info('Inbound supplier contact candidate staged for review', {
        inboundEmailId: inboundEmail.id,
        persistedSupplierContactIds: persistedSupplierContacts.map(
          (candidate) => candidate.id,
        ),
        routing: documentClassification.routing,
        primaryClass: documentClassification.primaryClass,
        confidence: supplierContactCandidate.confidence,
        conflictCount: supplierContactCandidate.conflicts.length,
      });
    }
  }

  if (
    documentClassification.conflicts.length > 0 ||
    [
      'ACCOUNT_OPENING_REVIEW',
      'SUPPLIER_CONTACT_REVIEW',
      'SUPPLIER_ONBOARDING_REVIEW',
    ].includes(documentClassification.routing)
  ) {
    await db.inboundEmail.update({
      where: { id: inboundEmail.id },
      data: {
        processingStatus: result.ignored ? 'REJECTED' : 'REVIEW_REQUIRED',
        reviewReason: documentClassification.reason,
      },
    });
    return;
  }

  const deterministicOffers = dedupeOffers(
    documents.flatMap((document) => {
      if (
        ![
          'BODY_MAIN',
          'BODY_FORWARDED',
          'ATTACHMENT_TEXT',
          'ATTACHMENT_TABLE',
        ].includes(document.kind)
      ) {
        return [];
      }

      const strictResult = parseStructuredPriceEmailBody(document.textContent);
      const strictOffers = strictResult.parsedRows.map((row) =>
        buildOfferCandidateFromParsedRow(
          row,
          document.documentIndex,
          `STRICT_${document.kind}`,
          sourceTrustScore,
        ),
      );
      const strictRawBlocks = new Set(
        strictResult.parsedRows.map((row) =>
          normalizeFingerprintText(row.rawLine),
        ),
      );

      const looseOffers = splitCommercialBlocks(document.textContent)
        .filter(
          (block) => !strictRawBlocks.has(normalizeFingerprintText(block)),
        )
        .map((block) =>
          extractLooseOfferCandidate(
            block,
            document.documentIndex,
            `BLOCK_${document.kind}`,
            sourceTrustScore,
          ),
        )
        .filter((candidate): candidate is StagedOfferCandidate =>
          Boolean(candidate),
        );

      return [...strictOffers, ...looseOffers];
    }),
  ).filter(
    (candidate) => !shouldSuppressAttachmentTextOfferCandidate(candidate),
  );
  const sourceLearningContext = {
    sourceSystem,
    senderEmail: message.from,
    senderDomain: extractSenderDomain(message.from),
    templateFingerprint: sourceTemplateFingerprint,
  };

  let resolvedOffers = await resolveOfferCandidates(
    message,
    documents.map((document) => ({
      ...segments[document.documentIndex]!,
      id: document.id,
    })),
    deterministicOffers,
    sourceLearningContext,
  );

  if (
    sourceSystem !== 'FIXTURE_EMAIL' &&
    shouldAttemptAiFallback(resolvedOffers, result)
  ) {
    const aiSourceText = documents
      .filter((document) =>
        ['BODY_MAIN', 'BODY_FORWARDED'].includes(document.kind),
      )
      .map((document) => document.textContent)
      .join('\n\n')
      .trim();

    if (aiSourceText) {
      const aiResult = await parseStructuredPriceText(aiSourceText, {
        source: 'EMAIL_BODY',
      });

      if (aiResult.aiFallbackUsed) {
        const aiRun = await db.emailExtractionRun.create({
          data: {
            inboundEmailId: inboundEmail.id,
            method: 'AI_FALLBACK',
            status: 'COMPLETED',
            extractorVersion: EXTRACTOR_VERSION,
            aiPromptVersion: aiResult.aiPromptVersion ?? null,
            notes: {
              parsingReason: aiResult.parsingReason ?? null,
              aiFallbackDecision: aiResult.aiFallbackDecision ?? null,
            },
          },
        });

        const aiOffers = await resolveOfferCandidates(
          message,
          documents.map((document) => ({
            ...segments[document.documentIndex]!,
            id: document.id,
          })),
          buildAiOfferCandidates(
            aiResult,
            {
              bodyMain:
                documents.find((document) => document.kind === 'BODY_MAIN')
                  ?.documentIndex ?? null,
              bodyForwarded:
                documents.find((document) => document.kind === 'BODY_FORWARDED')
                  ?.documentIndex ?? null,
              signature:
                documents.find((document) => document.kind === 'SIGNATURE')
                  ?.documentIndex ?? null,
            },
            sourceTrustScore,
          ).map((offer) => ({
            ...offer,
            extractionRunId: aiRun.id,
          })),
          sourceLearningContext,
        );

        resolvedOffers = mergeResolvedOffers(
          resolvedOffers,
          aiOffers,
        ) as typeof resolvedOffers;
      }
    }
  }
  const finalOfferStatuses: PromotionResult['offerStatus'][] = [];
  const finalOfferReviewReasons: string[] = [];

  for (const offer of resolvedOffers) {
    const sourceDocument =
      documents.find(
        (document) => document.documentIndex === offer.sourceDocumentIndex,
      ) ?? null;
    const offerFingerprint = buildOfferFingerprint(inboundEmail.id, offer);
    const extractionRunId =
      'extractionRunId' in offer && typeof offer.extractionRunId === 'string'
        ? offer.extractionRunId
        : deterministicRun.id;
    const createdOffer = await db.emailDerivedOffer.upsert({
      where: {
        inboundEmailId_offerFingerprint: {
          inboundEmailId: inboundEmail.id,
          offerFingerprint,
        },
      },
      update: {
        extractionRunId,
        sourceDocumentId: sourceDocument?.id ?? null,
        status: 'STAGED',
        sourceKind: offer.sourceKind,
        sourceBlockText: offer.sourceBlockText,
        rawProductText: offer.rawProductText,
        normalizedProductNameCandidate: offer.normalizedProductNameCandidate,
        strengthCandidate: offer.strengthCandidate,
        dosageFormCandidate: offer.dosageFormCandidate,
        packSizeCandidate: offer.packSizeCandidate,
        manufacturerCandidate: offer.manufacturerCandidate,
        supplierCandidate: offer.supplierCandidate,
        priceCandidate: offer.priceCandidate,
        currencyCandidate: offer.currencyCandidate,
        minimumOrderQuantityCandidate: offer.minimumOrderQuantityCandidate,
        availabilityCandidate: offer.availabilityCandidate,
        sourceTrustScore: offer.sourceTrustScore,
        structureConfidence: offer.structureConfidence,
        fieldConfidence: offer.fieldConfidence,
        entityResolutionConfidence: offer.entityResolutionConfidence,
        promotionConfidence: offer.promotionConfidence,
        aiAssisted: offer.aiAssisted,
        reviewReason: offer.reviewReason,
        metadata: {
          sender: message.from,
          subject: message.subject ?? null,
          sourceDocumentKind: sourceDocument?.kind ?? null,
          sourceDocumentLabel: sourceDocument?.label ?? null,
        },
      },
      create: {
        inboundEmailId: inboundEmail.id,
        extractionRunId,
        sourceDocumentId: sourceDocument?.id ?? null,
        status: 'STAGED',
        sourceKind: offer.sourceKind,
        sourceBlockText: offer.sourceBlockText,
        rawProductText: offer.rawProductText,
        normalizedProductNameCandidate: offer.normalizedProductNameCandidate,
        strengthCandidate: offer.strengthCandidate,
        dosageFormCandidate: offer.dosageFormCandidate,
        packSizeCandidate: offer.packSizeCandidate,
        manufacturerCandidate: offer.manufacturerCandidate,
        supplierCandidate: offer.supplierCandidate,
        priceCandidate: offer.priceCandidate,
        currencyCandidate: offer.currencyCandidate,
        minimumOrderQuantityCandidate: offer.minimumOrderQuantityCandidate,
        availabilityCandidate: offer.availabilityCandidate,
        sourceTrustScore: offer.sourceTrustScore,
        structureConfidence: offer.structureConfidence,
        fieldConfidence: offer.fieldConfidence,
        entityResolutionConfidence: offer.entityResolutionConfidence,
        promotionConfidence: offer.promotionConfidence,
        aiAssisted: offer.aiAssisted,
        reviewReason: offer.reviewReason,
        offerFingerprint,
        metadata: {
          sender: message.from,
          subject: message.subject ?? null,
          sourceDocumentKind: sourceDocument?.kind ?? null,
          sourceDocumentLabel: sourceDocument?.label ?? null,
        },
      },
    });

    if (offer.evidences.length > 0) {
      await db.emailDerivedOfferEvidence.createMany({
        data: offer.evidences.map((evidence) => ({
          emailDerivedOfferId: createdOffer.id,
          sourceDocumentId: sourceDocument?.id ?? null,
          fieldName: evidence.fieldName,
          evidenceType: evidence.evidenceType,
          rawText: evidence.rawText,
          startOffset: evidence.startOffset ?? null,
          endOffset: evidence.endOffset ?? null,
          confidence: evidence.confidence ?? null,
        })),
      });
    }

    if (offer.resolutionCandidates.length > 0) {
      await db.entityResolutionCandidate.createMany({
        data: offer.resolutionCandidates.map((candidate) => ({
          emailDerivedOfferId: createdOffer.id,
          entityType: candidate.entityType,
          candidateId: candidate.candidateId,
          candidateName: candidate.candidateName,
          confidence: candidate.confidence,
          reason: candidate.reason,
          selected: candidate.selected,
          metadata: candidate.metadata,
        })),
      });
    }

    const promotionResult = await persistPromotion(
      inboundEmail.id,
      createdOffer.id,
      offer,
    );
    await offerWorkflowService.syncWorkflowItemForOfferReview(
      buildWorkflowSyncInput(
        createdOffer.id,
        inboundEmail.id,
        promotionResult,
        offer,
      ),
    );
    finalOfferStatuses.push(promotionResult.offerStatus);
    if (promotionResult.reviewReason) {
      finalOfferReviewReasons.push(promotionResult.reviewReason);
    }
  }

  const currentOfferFingerprints = resolvedOffers.map((offer) =>
    buildOfferFingerprint(inboundEmail.id, offer),
  );

  await db.emailDerivedOffer.deleteMany({
    where: {
      inboundEmailId: inboundEmail.id,
      ...(currentOfferFingerprints.length > 0
        ? {
            offerFingerprint: {
              notIn: currentOfferFingerprints,
            },
          }
        : {}),
    },
  });

  if (resolvedOffers.length === 0) {
    await db.promotionDecision.create({
      data: {
        inboundEmailId: inboundEmail.id,
        status: result.ignored ? 'REJECTED' : 'REVIEW_REQUIRED',
        reason: result.reason ?? 'no_viable_offer_candidates_extracted',
      },
    });
  }

  const finalProcessingStatus =
    resolvedOffers.length === 0
      ? result.ignored === true
        ? 'REJECTED'
        : bodyItem?.processingStatus === 'FAILED'
          ? 'FAILED'
          : 'REVIEW_REQUIRED'
      : finalOfferStatuses.every((status) => status === 'AUTO_PROMOTED')
        ? 'AUTO_PROMOTED'
        : finalOfferStatuses.some((status) => status === 'AUTO_PROMOTED') &&
            finalOfferStatuses.every((status) => status !== 'REVIEW_REQUIRED')
          ? 'AUTO_PROMOTED'
          : finalOfferStatuses.some((status) => status === 'REVIEW_REQUIRED')
            ? 'REVIEW_REQUIRED'
            : finalOfferStatuses.every((status) => status === 'REJECTED')
              ? 'REJECTED'
              : 'STAGED';
  const resolvedOfferReviewReason =
    resolvedOffers.find((offer) => offer.reviewReason)?.reviewReason ?? null;
  const promotionReviewReason = finalOfferReviewReasons[0] ?? null;
  const finalReviewReason =
    finalProcessingStatus === 'REVIEW_REQUIRED'
      ? (promotionReviewReason ??
        resolvedOfferReviewReason ??
        (finalOfferStatuses.some((status) => status === 'REVIEW_REQUIRED')
          ? 'promotion_threshold_not_met'
          : null) ??
        bodyItem?.reason ??
        result.reason ??
        'review_required')
      : (bodyItem?.reason ??
        (result.ignored ? (result.reason ?? 'ignored_non_actionable') : null));

  await db.inboundEmail.update({
    where: { id: inboundEmail.id },
    data: {
      processingStatus: finalProcessingStatus,
      triageStatus,
      sourceTrustScore,
      structureConfidence: Math.max(
        0,
        ...resolvedOffers.map((offer) => offer.structureConfidence),
        0,
      ),
      businessWorthinessScore:
        bodyItem?.triageScores?.businessWorthinessScore ?? null,
      parserConfidence: bodyItem?.parserConfidence ?? null,
      reviewReason: finalReviewReason,
      processedAt: new Date(),
    },
  });
}

/**
 * Outcome of an attempt to durably stage an inbound email. `persisted: true`
 * means {@link stageInboundEmail} completed without throwing; `persisted: false`
 * carries the sanitized error so callers can decide what to do (the Graph poller
 * leaves the message unread for retry rather than marking it read).
 */
export type StageInboundEmailOutcome =
  | { persisted: true }
  | { persisted: false; error: string };

export async function stageInboundEmailSafely(
  message: EmailInboundMessage,
  result: EmailInboundResult,
): Promise<StageInboundEmailOutcome> {
  try {
    await stageInboundEmail(message, result);
    return { persisted: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown inbound email staging error.';
    logger.error('Failed to stage inbound email', {
      error: errorMessage,
      messageId: message.messageId ?? message.externalMessageId ?? null,
      senderEmail: message.from,
    });
    // Redact secrets (e.g. a Postgres connection string in a Prisma error)
    // before the message escapes this process: it is surfaced on the
    // EmailInboundResult and returned verbatim by the manual-ingest HTTP route,
    // matching the redaction the poller applies to its own error path.
    return { persisted: false, error: redactSafeOutputString(errorMessage) };
  }
}
