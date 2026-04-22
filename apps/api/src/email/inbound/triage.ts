export type EmailTriageStatus =
  | 'AUTO_PROCESSED'
  | 'IGNORED_NON_ACTIONABLE'
  | 'AI_REVIEW_ELIGIBLE'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'REJECTED_LOW_VALUE';

export type EmailTriageParserConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type EmailTriageResult = {
  status: EmailTriageStatus;
  supplierLikelihoodScore: number;
  structureScore: number;
  businessWorthinessScore: number;
  parserConfidence: EmailTriageParserConfidence;
  reasons: string[];
  metrics: {
    trustedSender: boolean;
    isKnownSupplier: boolean;
    hasAttachment: boolean;
    attachmentType: 'csv' | 'xlsx' | 'pdf' | 'image' | 'other' | 'none';
    medicineTokenCount: number;
    priceTokenCount: number;
    productLikeLineCount: number;
    conversationalLineCount: number;
    subjectMatched: boolean;
    senderDomainMatched: boolean;
  };
  aiEligible: boolean;
  aiBlockedReason: string | null;
};

export type EmailTriageInput = {
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  bodyText: string | null;
  attachmentFileName?: string | null;
  attachmentMimeType?: string | null;
  hasAttachment: boolean;
  trustedSender?: boolean;
  knownSupplierEmails?: string[];
  knownSupplierDomains?: string[];
  dailyAiReviewCount: number;
  dailyAiReviewLimit: number;
  perSupplierDailyAiReviewCount?: number;
  perSupplierDailyAiReviewLimit?: number;
  duplicateBodyDetected?: boolean;
  parserConfidence?: EmailTriageParserConfidence;
  parsedStructuredRowCount?: number;
};

const SUPPLIER_SUBJECT_TERMS = [
  'price list',
  'stock list',
  'offer',
  'availability',
  'quote',
  'quotation',
  'pricing',
  'supplier',
  'wholesale',
];

const CONVERSATIONAL_TERMS = [
  'thanks',
  'regards',
  'please call',
  'let me know',
  'hope you are well',
  'speak soon',
  'attached as discussed',
  'see below',
  'thanks mate',
];

const MEDICINE_TOKEN_PATTERN =
  /\b(?:mg|mcg|ml|iu|tab|tabs|tablet|tablets|cap|caps|capsule|capsules|caplet|caplets|syrup|suspension|cream|ointment|gel|vial|ampoule)\b/gi;
const PRICE_TOKEN_PATTERN =
  /(?:£\s?\d+(?:\.\d{1,2})?|\$\s?\d+(?:\.\d{1,2})?|€\s?\d+(?:\.\d{1,2})?|\b(?:eur|usd|gbp)\s?\d+(?:\.\d{1,2})?|\b\d+\.\d{2}\b)/gi;
const PRODUCT_LINE_PATTERN =
  /(?:\b\d+(?:\.\d+)?\s?(?:mg|mcg|ml|g|iu)\b).*(?:\b(?:tab|tabs|tablet|tablets|cap|caps|capsule|capsules|caplet|caplets|syrup|suspension|cream|ointment|gel|vial|ampoule)\b|\b\d+\b|£|\$|€|\b(?:eur|usd|gbp)\b)/i;
const SIGNATURE_ONLY_PATTERN =
  /^(?:thanks|regards|kind regards|best|cheers|sent from my iphone|sent from outlook)\b/i;

function lower(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function detectAttachmentType(
  fileName: string | null | undefined,
  mimeType: string | null | undefined,
): EmailTriageResult['metrics']['attachmentType'] {
  const normalizedName = lower(fileName);
  const normalizedMime = lower(mimeType);

  if (normalizedName.endsWith('.csv') || normalizedMime === 'text/csv') {
    return 'csv';
  }

  if (
    normalizedName.endsWith('.xlsx') ||
    normalizedMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'xlsx';
  }

  if (normalizedName.endsWith('.pdf') || normalizedMime === 'application/pdf') {
    return 'pdf';
  }

  if (
    normalizedMime.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp'].some((extension) => normalizedName.endsWith(extension))
  ) {
    return 'image';
  }

  return fileName || mimeType ? 'other' : 'none';
}

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

function isKnownSupplierEmail(senderEmail: string, knownSupplierEmails: string[]): boolean {
  return knownSupplierEmails.includes(senderEmail);
}

function isKnownSupplierDomain(senderEmail: string, knownSupplierDomains: string[]): boolean {
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@').pop() ?? '' : '';
  return senderDomain !== '' && knownSupplierDomains.includes(senderDomain);
}

function deriveParserConfidence(input: {
  parserConfidence?: EmailTriageParserConfidence;
  parsedStructuredRowCount: number;
  productLikeLineCount: number;
}): EmailTriageParserConfidence {
  if (input.parserConfidence) {
    return input.parserConfidence;
  }

  if (input.parsedStructuredRowCount >= 3 || input.productLikeLineCount >= 3) {
    return 'HIGH';
  }

  if (input.parsedStructuredRowCount >= 1 || input.productLikeLineCount >= 1) {
    return 'MEDIUM';
  }

  return 'NONE';
}

export function scoreInboundEmailTriage(input: EmailTriageInput): EmailTriageResult {
  const senderEmail = lower(input.fromEmail);
  const subject = lower(input.subject);
  const bodyText = input.bodyText ?? '';
  const normalizedBody = lower(bodyText);
  const knownSupplierEmails = (input.knownSupplierEmails ?? []).map(lower).filter(Boolean);
  const knownSupplierDomains = (input.knownSupplierDomains ?? []).map(lower).filter(Boolean);
  const attachmentType = detectAttachmentType(input.attachmentFileName, input.attachmentMimeType);
  const trustedSender = Boolean(input.trustedSender);
  const bodyLines = bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const medicineTokenCount = countMatches(normalizedBody, MEDICINE_TOKEN_PATTERN);
  const priceTokenCount = countMatches(normalizedBody, PRICE_TOKEN_PATTERN);
  const conversationalLineCount = bodyLines.filter((line) =>
    CONVERSATIONAL_TERMS.some((term) => line.toLowerCase().includes(term)),
  ).length;
  const productLikeLineCount = Math.max(
    bodyLines.filter((line) => PRODUCT_LINE_PATTERN.test(line)).length,
    input.parsedStructuredRowCount ?? 0,
  );
  const subjectMatched = SUPPLIER_SUBJECT_TERMS.some((term) => subject.includes(term));
  const senderDomainMatched = isKnownSupplierDomain(senderEmail, knownSupplierDomains);
  const isKnownSupplier = isKnownSupplierEmail(senderEmail, knownSupplierEmails) || senderDomainMatched;
  const parserConfidence = deriveParserConfidence({
    parserConfidence: input.parserConfidence,
    parsedStructuredRowCount: input.parsedStructuredRowCount ?? 0,
    productLikeLineCount,
  });
  const mostlyConversational =
    conversationalLineCount > 0 && conversationalLineCount >= Math.max(1, Math.ceil(bodyLines.length / 2));
  const noSupplierSignals =
    !input.hasAttachment && !subjectMatched && medicineTokenCount === 0 && priceTokenCount === 0;
  const reasons: string[] = [];

  let supplierLikelihoodScore = 0;
  if (trustedSender) {
    supplierLikelihoodScore += 20;
    reasons.push('sender is on the trusted inbound allowlist');
  }

  if (isKnownSupplierEmail(senderEmail, knownSupplierEmails)) {
    supplierLikelihoodScore += 40;
    reasons.push('exact sender matched a known supplier email');
  }

  if (senderDomainMatched) {
    supplierLikelihoodScore += 30;
    reasons.push('sender domain matched a known supplier domain');
  }

  if (subjectMatched) {
    supplierLikelihoodScore += 20;
    reasons.push('subject matched supplier-like terms');
  }

  if (input.hasAttachment) {
    supplierLikelihoodScore += 15;
    reasons.push('attachment is present');
  }

  if (medicineTokenCount > 0) {
    supplierLikelihoodScore += 10;
    reasons.push('body contains medicine-like terms');
  }

  if (priceTokenCount > 0) {
    supplierLikelihoodScore += 10;
    reasons.push('body contains price-like tokens');
  }

  if (mostlyConversational) {
    supplierLikelihoodScore -= 35;
    reasons.push('body looks mainly conversational');
  }

  if (normalizedBody.length < 30 && medicineTokenCount === 0 && priceTokenCount === 0) {
    supplierLikelihoodScore -= 25;
    reasons.push('body is very short without product or price indicators');
  }

  if (noSupplierSignals) {
    supplierLikelihoodScore -= 20;
    reasons.push('no supplier or product indicators were found');
  }

  let structureScore = 0;
  if (parserConfidence === 'HIGH') {
    structureScore += 30;
    reasons.push('parser confidence is high');
  } else if (parserConfidence === 'MEDIUM') {
    structureScore += 18;
    reasons.push('parser confidence is medium');
  }

  if (productLikeLineCount >= 3) {
    structureScore += 25;
    reasons.push('multiple product-like lines were detected');
  }

  if (priceTokenCount >= 2) {
    structureScore += 15;
    reasons.push('multiple price-like tokens were detected');
  }

  if ((input.parsedStructuredRowCount ?? 0) >= 2 || productLikeLineCount >= 2) {
    structureScore += 15;
    reasons.push('repeated row-like structure was detected');
  }

  if (attachmentType === 'csv' || attachmentType === 'xlsx') {
    structureScore += 10;
    reasons.push('spreadsheet attachment is present');
  } else if (attachmentType === 'pdf') {
    structureScore += 8;
  } else if (attachmentType === 'image') {
    structureScore += 5;
  }

  if (mostlyConversational) {
    structureScore -= 30;
  }

  if (productLikeLineCount === 0 && (input.parsedStructuredRowCount ?? 0) === 0) {
    structureScore -= 20;
    reasons.push('no product-like lines were detected');
  }

  if (priceTokenCount > 0 && medicineTokenCount === 0 && productLikeLineCount === 0) {
    structureScore -= 15;
    reasons.push('numbers were present without enough product context');
  }

  if (bodyLines.length > 0 && bodyLines.every((line) => SIGNATURE_ONLY_PATTERN.test(line))) {
    structureScore -= 10;
    reasons.push('body looks like signature or footer text only');
  }

  let businessWorthinessScore = 0;
  if (trustedSender) {
    businessWorthinessScore += 15;
    reasons.push('trusted sender increases business worthiness');
  }

  if (trustedSender && (priceTokenCount > 0 || medicineTokenCount > 0 || productLikeLineCount > 0)) {
    businessWorthinessScore += 25;
    reasons.push('trusted sender with commercial cues increases business worthiness');
  }

  if (trustedSender && priceTokenCount > 0 && (medicineTokenCount > 0 || productLikeLineCount > 0)) {
    businessWorthinessScore += 25;
    reasons.push('trusted sender with explicit commercial evidence is AI-review worthy');
  }

  if (isKnownSupplier) {
    businessWorthinessScore += 35;
    reasons.push('known supplier signal increases business worthiness');
  }

  if (subjectMatched) {
    businessWorthinessScore += 20;
  }

  if (input.hasAttachment) {
    businessWorthinessScore += 20;
  }

  if (productLikeLineCount >= 2) {
    businessWorthinessScore += 15;
  }

  if (priceTokenCount >= 2) {
    businessWorthinessScore += 15;
  }

  if (medicineTokenCount >= 3) {
    businessWorthinessScore += 10;
  }

  if (mostlyConversational) {
    businessWorthinessScore -= 40;
    reasons.push('mostly conversational body lowers business worthiness');
  }

  if (!input.hasAttachment && priceTokenCount === 0 && productLikeLineCount === 0) {
    businessWorthinessScore -= 30;
    reasons.push('no pricing, products, or attachment were found');
  }

  if (normalizedBody.includes('as discussed') || normalizedBody.includes('see below')) {
    businessWorthinessScore -= 20;
    reasons.push('body looks like vague admin chatter');
  }

  if (input.duplicateBodyDetected) {
    businessWorthinessScore -= 15;
    reasons.push('near-identical recent content was already seen');
  }

  supplierLikelihoodScore = clampScore(supplierLikelihoodScore);
  structureScore = clampScore(structureScore);
  businessWorthinessScore = clampScore(businessWorthinessScore);

  let status: EmailTriageStatus;
  let aiBlockedReason: string | null = null;

  if (parserConfidence === 'HIGH' && structureScore >= 75) {
    status = 'AUTO_PROCESSED';
  } else if (supplierLikelihoodScore < 40 && businessWorthinessScore < 40) {
    status = 'IGNORED_NON_ACTIONABLE';
  } else if (businessWorthinessScore < 40) {
    status = 'REJECTED_LOW_VALUE';
  } else if (
    supplierLikelihoodScore >= 40 &&
    businessWorthinessScore >= 65 &&
    ['MEDIUM', 'LOW', 'NONE'].includes(parserConfidence)
  ) {
    if (!isKnownSupplier && !trustedSender && !input.hasAttachment && !subjectMatched) {
      status = 'MANUAL_REVIEW_REQUIRED';
      aiBlockedReason = 'unknown_sender_without_attachment_or_supplier_subject';
    } else if (businessWorthinessScore < 65) {
      status = 'MANUAL_REVIEW_REQUIRED';
      aiBlockedReason = 'business_score_below_ai_threshold';
    } else if (input.duplicateBodyDetected) {
      status = 'MANUAL_REVIEW_REQUIRED';
      aiBlockedReason = 'duplicate_recent_body_detected';
    } else if (input.dailyAiReviewCount >= input.dailyAiReviewLimit) {
      status = 'MANUAL_REVIEW_REQUIRED';
      aiBlockedReason = 'daily_ai_review_limit_exceeded';
    } else if (
      (input.perSupplierDailyAiReviewCount ?? 0) >= (input.perSupplierDailyAiReviewLimit ?? Number.MAX_SAFE_INTEGER)
    ) {
      status = 'MANUAL_REVIEW_REQUIRED';
      aiBlockedReason = 'per_supplier_ai_review_limit_exceeded';
    } else {
      status = 'AI_REVIEW_ELIGIBLE';
    }
  } else if (
    supplierLikelihoodScore >= 40 &&
    businessWorthinessScore >= 40 &&
    businessWorthinessScore <= 64
  ) {
    status = 'MANUAL_REVIEW_REQUIRED';
  } else {
    status = 'IGNORED_NON_ACTIONABLE';
  }

  return {
    status,
    supplierLikelihoodScore,
    structureScore,
    businessWorthinessScore,
    parserConfidence,
    reasons,
    metrics: {
      isKnownSupplier,
      trustedSender,
      hasAttachment: input.hasAttachment,
      attachmentType,
      medicineTokenCount,
      priceTokenCount,
      productLikeLineCount,
      conversationalLineCount,
      subjectMatched,
      senderDomainMatched,
    },
    aiEligible: status === 'AI_REVIEW_ELIGIBLE',
    aiBlockedReason,
  };
}
