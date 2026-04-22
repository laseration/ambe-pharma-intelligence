import { buildProductCandidates } from '../imports/normalization';
import type { AiOfferParsingAttemptResult } from '../aiParsing/service';
import { openAiOfferParser } from '../aiParsing/service';
import type { AiParsedOfferResponse } from '../aiParsing/schema';

export type EmailParseConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ParsedEmailBodyRow = {
  lineNumber: number;
  rawLine: string;
  evidenceText?: string | null;
  rawProductName: string;
  rawProductText: string;
  strength: string | null;
  formulation: string | null;
  packSize: string | null;
  price: number;
  currencyCode: string | null;
  availability?: string | null;
  minimumOrderQuantity?: number | null;
  manufacturer?: string | null;
  sourceSegment?: 'BODY_MAIN' | 'BODY_FORWARDED' | 'SIGNATURE' | 'UNKNOWN' | null;
  productCandidates: ReturnType<typeof buildProductCandidates>;
  confidence: EmailParseConfidence;
  explanation: string;
};

export type SkippedEmailBodyLine = {
  lineNumber: number;
  rawLine: string;
  reason: string;
};

export type ParsedEmailBodyResult = {
  totalLines: number;
  candidateLines: number;
  parsedRows: ParsedEmailBodyRow[];
  skippedLines: SkippedEmailBodyLine[];
  overallConfidence: EmailParseConfidence;
  // Canonical downstream review flag. reviewRequired is kept as a compatibility alias.
  reviewRecommended: boolean;
  reviewRequired: boolean;
  // Canonical raw body field. rawBody is kept as a compatibility alias.
  rawBodyText: string;
  rawBody: string;
  parsingSource?: 'DETERMINISTIC' | 'OPENAI_FALLBACK';
  aiFallbackAttempted?: boolean;
  aiFallbackUsed?: boolean;
  aiFallbackDecision?: string;
  aiFallbackRejectedReason?: string;
  aiPromptVersion?: string | null;
  supplierName?: string | null;
  notes?: string[];
  parsingReason?: string;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  '\u00A3': 'GBP',
  '$': 'USD',
  '\u20AC': 'EUR',
};

const STRUCTURED_PRICE_LINE_PATTERN =
  /^(?<product>.+?)(?:\s*[-:]\s*|\s+)(?<currencySymbol>\u00A3|\$|\u20AC)?\s*(?<price>\d+(?:\.\d{1,2})?)\s*(?<currencyCode>[A-Z]{3})?$/i;

const PRICE_LIKE_PATTERN = /(?:\u00A3|\$|\u20AC|\b(?:usd|gbp|eur)\b|\d+[.,]\d{2})/i;

export function normalizeEmailTextForParsing(rawText: string): string {
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00c3\u0192\u00e2\u20ac\u0161\u00c3\u201a\u00c2\u00a3|\u00c3\u201a\u00c2\u00a3|\u00c2\u00a3/g, '\u00A3')
    .replace(/\u00c3\u0192\u00c2\u00a2\u00c3\u00a2\u00e2\u201a\u00ac\u0161\u00c3\u201a\u00c2\u00ac|\u00c3\u00a2\u00e2\u201a\u00ac\u0161\u00c3\u201a\u00c2\u00ac|\u00e2\u201a\u00ac/g, '\u20AC')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/^[ \t]*[\u2022\u25CF\u25E6\u25AA\u00B7][ \t]*/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
function deriveRowConfidence(input: {
  productName: string;
  strength: string | null;
  formulation: string | null;
  packSize: string | null;
  currencyCode: string | null;
  usedExplicitSeparator: boolean;
}): { confidence: EmailParseConfidence; explanation: string } {
  const hasBaseName = input.productName.trim().length > 2;
  const hasStrongProductDetail = Boolean(input.strength && (input.formulation || input.packSize));
  const hasModerateProductDetail = Boolean(input.strength || (input.formulation && input.packSize));

  if (hasBaseName && hasStrongProductDetail && input.currencyCode && input.usedExplicitSeparator) {
    return {
      confidence: 'HIGH',
      explanation: 'Line has strong product detail, a clear separator, and an explicit price/currency.',
    };
  }

  if (hasBaseName && hasStrongProductDetail) {
    return {
      confidence: 'MEDIUM',
      explanation: 'Line is structured and priced, but the currency or separator is slightly less explicit.',
    };
  }

  if (hasBaseName && hasModerateProductDetail) {
    return {
      confidence: 'MEDIUM',
      explanation: 'Line has usable product detail and a price, but the structure is slightly ambiguous.',
    };
  }

  return {
    confidence: 'LOW',
    explanation: 'Line has a price, but the product text is too weak to trust automatically.',
  };
}

function deriveOverallConfidence(
  rows: ParsedEmailBodyRow[],
  skippedLines: SkippedEmailBodyLine[],
): EmailParseConfidence {
  if (rows.length === 0) {
    return 'LOW';
  }

  const distinctCurrencies = new Set(
    rows.map((row) => row.currencyCode).filter((currency): currency is string => Boolean(currency)),
  );
  const priceLikeSkippedLines = skippedLines.filter((line) => PRICE_LIKE_PATTERN.test(line.rawLine));

  if (distinctCurrencies.size > 1) {
    return 'LOW';
  }

  if (rows.every((row) => row.confidence === 'HIGH') && skippedLines.length === 0) {
    return 'HIGH';
  }

  if (
    rows.some((row) => row.confidence === 'LOW') ||
    priceLikeSkippedLines.length > 0 ||
    skippedLines.length >= rows.length
  ) {
    return 'LOW';
  }

  return 'MEDIUM';
}

function shouldSkipSilently(line: string): boolean {
  const trimmed = line.trim();

  if (!trimmed) {
    return true;
  }

  return /^(hi|hello|dear|thanks|regards|best|kind regards|please find attached|attached)\b/i.test(
    trimmed,
  );
}

function createSkippedLine(
  lineNumber: number,
  rawLine: string,
  reason: string,
): SkippedEmailBodyLine | null {
  if (shouldSkipSilently(rawLine)) {
    return null;
  }

  return {
    lineNumber,
    rawLine: rawLine.trim(),
    reason,
  };
}

function parseLine(
  line: string,
  lineNumber: number,
): { parsedRow: ParsedEmailBodyRow | null; skippedLine: SkippedEmailBodyLine | null } {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length < 4) {
    return {
      parsedRow: null,
      skippedLine: null,
    };
  }

  const match = trimmed.match(STRUCTURED_PRICE_LINE_PATTERN);

  if (!match?.groups?.product || !match.groups.price) {
    return {
      parsedRow: null,
      skippedLine: createSkippedLine(
        lineNumber,
        trimmed,
        PRICE_LIKE_PATTERN.test(trimmed)
          ? 'Line mentions pricing but could not be parsed safely.'
          : 'Line does not look like a clean structured product-price offer.',
      ),
    };
  }

  const rawProductName = match.groups.product.trim().replace(/\s+[-:]\s*$/, '');
  const productCandidates = buildProductCandidates(rawProductName);
  const currencyFromSymbol = match.groups.currencySymbol
    ? CURRENCY_SYMBOLS[match.groups.currencySymbol] ?? null
    : null;
  const currencyFromCode = (match.groups.currencyCode || '').toUpperCase() || null;
  const currencyCode =
    currencyFromCode && currencyFromSymbol && currencyFromCode !== currencyFromSymbol
      ? null
      : currencyFromCode || currencyFromSymbol || null;
  const confidenceResult = deriveRowConfidence({
    productName: rawProductName,
    strength: productCandidates.strength,
    formulation: productCandidates.formulation,
    packSize: productCandidates.packSize,
    currencyCode,
    usedExplicitSeparator: /\s[-:]\s/.test(trimmed),
  });

  return {
    parsedRow: {
      lineNumber,
      rawLine: trimmed,
      rawProductName,
      rawProductText: rawProductName,
      strength: productCandidates.strength,
      formulation: productCandidates.formulation,
      packSize: productCandidates.packSize,
      price: Number(match.groups.price),
      currencyCode,
      productCandidates,
      confidence:
        currencyFromCode && currencyFromSymbol && currencyFromCode !== currencyFromSymbol
          ? 'LOW'
          : confidenceResult.confidence,
      explanation:
        currencyFromCode && currencyFromSymbol && currencyFromCode !== currencyFromSymbol
          ? 'Line has conflicting currency markers, so it is not trusted automatically.'
          : confidenceResult.explanation,
    },
    skippedLine: null,
  };
}

function confidenceRank(confidence: EmailParseConfidence): number {
  if (confidence === 'HIGH') {
    return 3;
  }

  if (confidence === 'MEDIUM') {
    return 2;
  }

  return 1;
}

function isCommerciallyRelevantText(rawBodyText: string): boolean {
  return /(?:price|pricing|offer|quote|stock|available|availability|moq|minimum order|supplier|buy|sell|\u00A3|\$|\u20AC|\bgbp\b|\busd\b|\beur\b|\d+\.\d{2})/i.test(
    normalizeEmailTextForParsing(rawBodyText),
  );
}

function shouldAttemptAiFallback(result: ParsedEmailBodyResult): boolean {
  if (result.overallConfidence === 'HIGH') {
    return false;
  }

  if (result.parsedRows.length === 0 || result.overallConfidence === 'LOW') {
    return true;
  }

  return result.reviewRecommended && isCommerciallyRelevantText(result.rawBodyText);
}

function normalizeConfidence(confidence: 'HIGH' | 'MEDIUM' | 'LOW'): EmailParseConfidence {
  return confidence;
}

function buildAiParsedRows(
  rawBodyText: string,
  aiResult: AiParsedOfferResponse,
): ParsedEmailBodyRow[] {
  const trimmedLines = rawBodyText.split(/\r?\n/).map((line) => line.trim());

  return aiResult.offers
    .filter((offer) => Boolean(offer.rawLine.trim()) && Boolean(offer.productText?.trim()) && offer.price !== null)
    .map((offer, index) => {
      const rawProductText = offer.productText?.trim() ?? '';
      const productCandidates = buildProductCandidates(rawProductText);
      const matchingLineNumber = trimmedLines.findIndex((line) => line === offer.rawLine.trim());

      return {
        lineNumber: matchingLineNumber >= 0 ? matchingLineNumber + 1 : index + 1,
        rawLine: offer.rawLine.trim(),
        evidenceText: offer.evidenceText,
        rawProductName: rawProductText,
        rawProductText,
        strength: offer.strength ?? productCandidates.strength,
        formulation: offer.dosageForm ?? productCandidates.formulation,
        packSize: offer.packSize ?? productCandidates.packSize,
        price: offer.price ?? 0,
        currencyCode: offer.currency,
        availability: offer.availability,
        minimumOrderQuantity: offer.minimumOrderQuantity,
        manufacturer: offer.manufacturer,
        sourceSegment: offer.sourceSegment,
        productCandidates,
        confidence: normalizeConfidence(offer.confidence),
        explanation: offer.reason,
      };
    });
}

function buildAiAssistedResult(
  deterministicResult: ParsedEmailBodyResult,
  aiResult: AiParsedOfferResponse,
): ParsedEmailBodyResult {
  const parsedRows = buildAiParsedRows(deterministicResult.rawBodyText, aiResult);
  const parsedRawLines = new Set(parsedRows.map((row) => row.rawLine));
  const skippedLines = deterministicResult.skippedLines.filter((line) => !parsedRawLines.has(line.rawLine));
  const overallConfidence = normalizeConfidence(aiResult.overallConfidence);
  const reviewRecommended = aiResult.reviewRecommended || overallConfidence !== 'HIGH';

  return {
    totalLines: deterministicResult.totalLines,
    candidateLines: parsedRows.length,
    parsedRows,
    skippedLines,
    overallConfidence,
    reviewRecommended,
    reviewRequired: reviewRecommended,
    rawBodyText: deterministicResult.rawBodyText,
    rawBody: deterministicResult.rawBody,
    parsingSource: 'OPENAI_FALLBACK',
    aiFallbackAttempted: true,
    aiFallbackUsed: true,
    aiFallbackDecision: 'accepted',
    aiFallbackRejectedReason: undefined,
    supplierName: aiResult.supplierName,
    notes: aiResult.notes,
    parsingReason: 'Used OpenAI fallback because deterministic parsing was weak or unclear.',
  };
}

function mergeDeterministicNotes(
  result: ParsedEmailBodyResult,
  aiAttempt?: AiOfferParsingAttemptResult,
): ParsedEmailBodyResult {
  const notes = [...(result.notes ?? [])];

  if (aiAttempt && aiAttempt.status !== 'success' && aiAttempt.status !== 'disabled') {
    notes.push(aiAttempt.reason);
  }

  if (aiAttempt?.status === 'disabled') {
    notes.push(aiAttempt.reason);
  }

  return {
    ...result,
    parsingSource: 'DETERMINISTIC',
    aiFallbackAttempted: Boolean(aiAttempt),
    aiFallbackUsed: false,
    aiFallbackDecision: aiAttempt?.decision,
    aiFallbackRejectedReason:
      aiAttempt && aiAttempt.status !== 'success' ? aiAttempt.reason : undefined,
    aiPromptVersion: aiAttempt && 'promptVersion' in aiAttempt ? (aiAttempt.promptVersion ?? null) : null,
    notes: notes.length > 0 ? notes : undefined,
  };
}

function shouldUseAiResult(
  deterministicResult: ParsedEmailBodyResult,
  aiAssistedResult: ParsedEmailBodyResult,
): boolean {
  if (aiAssistedResult.parsedRows.length === 0) {
    return false;
  }

  if (confidenceRank(aiAssistedResult.overallConfidence) > confidenceRank(deterministicResult.overallConfidence)) {
    return true;
  }

  return (
    aiAssistedResult.parsedRows.length > deterministicResult.parsedRows.length &&
    confidenceRank(aiAssistedResult.overallConfidence) >= confidenceRank(deterministicResult.overallConfidence)
  );
}

export function parseStructuredPriceEmailBody(rawBodyText: string): ParsedEmailBodyResult {
  const lines = normalizeEmailTextForParsing(rawBodyText).split(/\n/);
  const parsedRows: ParsedEmailBodyRow[] = [];
  const skippedLines: SkippedEmailBodyLine[] = [];

  lines.forEach((line, index) => {
    const result = parseLine(line, index + 1);

    if (result.parsedRow) {
      parsedRows.push(result.parsedRow);
    }

    if (result.skippedLine) {
      skippedLines.push(result.skippedLine);
    }
  });

  const overallConfidence = deriveOverallConfidence(parsedRows, skippedLines);
  const reviewRecommended = overallConfidence !== 'HIGH';
  const reviewRequired = reviewRecommended;
  const rawBody = rawBodyText;

  return {
    totalLines: lines.length,
    candidateLines: parsedRows.length,
    parsedRows,
    skippedLines,
    overallConfidence,
    reviewRecommended,
    reviewRequired,
    rawBodyText,
    rawBody,
    parsingSource: 'DETERMINISTIC',
    aiFallbackAttempted: false,
    aiFallbackUsed: false,
    aiFallbackDecision: undefined,
    aiFallbackRejectedReason: undefined,
    aiPromptVersion: null,
  };
}

export async function parseStructuredPriceText(
  rawBodyText: string,
  dependencies?: {
    aiOfferParser?: {
      parseText: (input: {
        rawText: string;
        source: 'EMAIL_BODY' | 'TELEGRAM_TEXT';
      }) => Promise<AiOfferParsingAttemptResult>;
    };
    source?: 'EMAIL_BODY' | 'TELEGRAM_TEXT';
  },
): Promise<ParsedEmailBodyResult> {
  const deterministicResult = parseStructuredPriceEmailBody(rawBodyText);

  if (!shouldAttemptAiFallback(deterministicResult)) {
    return mergeDeterministicNotes(deterministicResult);
  }

  const aiAttempt = await (dependencies?.aiOfferParser ?? openAiOfferParser).parseText({
    rawText: rawBodyText,
    source: dependencies?.source ?? 'EMAIL_BODY',
  });

  if (aiAttempt.status !== 'success') {
    return mergeDeterministicNotes(
      {
        ...deterministicResult,
        parsingReason:
          aiAttempt.status === 'disabled'
            ? 'Kept deterministic parsing because OpenAI fallback is disabled.'
            : 'Kept deterministic parsing because OpenAI fallback did not return usable structured data.',
      },
      aiAttempt,
    );
  }

  const aiAssistedResult = buildAiAssistedResult(deterministicResult, aiAttempt.result);

  if (!shouldUseAiResult(deterministicResult, aiAssistedResult)) {
    return mergeDeterministicNotes(
      {
        ...deterministicResult,
        parsingReason: 'Kept deterministic parsing because it remained as strong as the AI fallback.',
      },
      aiAttempt,
    );
  }

  return {
    ...aiAssistedResult,
    aiPromptVersion: aiAttempt.promptVersion,
    notes: [...(aiAssistedResult.notes ?? []), aiAttempt.reason],
  };
}

