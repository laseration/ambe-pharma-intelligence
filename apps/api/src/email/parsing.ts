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
  sourceSegment?:
    | 'BODY_MAIN'
    | 'BODY_FORWARDED'
    | 'SIGNATURE'
    | 'UNKNOWN'
    | null;
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
  $: 'USD',
  '\u20AC': 'EUR',
};

const STRUCTURED_PRICE_LINE_PATTERN =
  /^(?<product>.+?)(?:\s*[-:]\s*|\s+)(?<currencySymbol>\u00A3|\$|\u20AC)?\s*(?<price>\d+(?:\.\d{1,2})?)\s*(?<currencyCode>[A-Z]{3})?$/i;

const PRICE_LIKE_PATTERN =
  /(?:\u00A3|\$|\u20AC|\b(?:usd|gbp|eur)\b|\d+[.,]\d{2})/i;
const SHARED_PRICE_PATTERN =
  /^prices?\s+for\s+both\s+refs?\s+are\s+(?<price>\d+(?:\.\d{1,2})?)\s*(?<currency>euro|eur|gbp|usd|\u20AC|\u00A3|\$)\b.*$/i;
const NON_PRODUCT_SHARED_PRICE_PREFIX_PATTERN =
  /^(?:from|sent|subject|to|cc|dear|kind regards|regards|thanks|best|supplier name)\b/i;
const CONTACT_OR_FOOTER_PREFIX_PATTERN =
  /^(?:m|mob|mobile|tel|telephone|phone|fax|email|e-mail|from|sent|subject|to|cc)\s*:/i;
const PHONE_ONLY_LINE_PATTERN = /^[+()0-9\s./-]{7,}$/;

export function normalizeEmailTextForParsing(rawText: string): string {
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(
      /\u00c3\u0192\u00e2\u20ac\u0161\u00c3\u201a\u00c2\u00a3|\u00c3\u201a\u00c2\u00a3|\u00c2\u00a3/g,
      '\u00A3',
    )
    .replace(
      /\u00c3\u0192\u00c2\u00a2\u00c3\u00a2\u00e2\u201a\u00ac\u0161\u00c3\u201a\u00c2\u00ac|\u00c3\u00a2\u00e2\u201a\u00ac\u0161\u00c3\u201a\u00c2\u00ac|\u00e2\u201a\u00ac/g,
      '\u20AC',
    )
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
  const hasStrongProductDetail = Boolean(
    input.strength && (input.formulation || input.packSize),
  );
  const hasModerateProductDetail = Boolean(
    input.strength || (input.formulation && input.packSize),
  );

  if (
    hasBaseName &&
    hasStrongProductDetail &&
    input.currencyCode &&
    input.usedExplicitSeparator
  ) {
    return {
      confidence: 'HIGH',
      explanation:
        'Line has strong product detail, a clear separator, and an explicit price/currency.',
    };
  }

  if (hasBaseName && hasStrongProductDetail) {
    return {
      confidence: 'MEDIUM',
      explanation:
        'Line is structured and priced, but the currency or separator is slightly less explicit.',
    };
  }

  if (hasBaseName && hasModerateProductDetail) {
    return {
      confidence: 'MEDIUM',
      explanation:
        'Line has usable product detail and a price, but the structure is slightly ambiguous.',
    };
  }

  return {
    confidence: 'LOW',
    explanation:
      'Line has a price, but the product text is too weak to trust automatically.',
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
    rows
      .map((row) => row.currencyCode)
      .filter((currency): currency is string => Boolean(currency)),
  );
  const priceLikeSkippedLines = skippedLines.filter((line) =>
    PRICE_LIKE_PATTERN.test(line.rawLine),
  );

  if (distinctCurrencies.size > 1) {
    return 'LOW';
  }

  if (
    rows.every((row) => row.confidence === 'HIGH') &&
    skippedLines.length === 0
  ) {
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

function isMostlyNumericOrPunctuation(line: string): boolean {
  const alphaCount = (line.match(/[A-Za-z]/g) ?? []).length;
  const digitCount = (line.match(/\d/g) ?? []).length;

  return digitCount >= 5 && alphaCount <= 3;
}

function isObviousContactOrFooterLine(line: string): boolean {
  const trimmed = line.trim();

  if (!trimmed) {
    return false;
  }

  if (CONTACT_OR_FOOTER_PREFIX_PATTERN.test(trimmed)) {
    return true;
  }

  if (PHONE_ONLY_LINE_PATTERN.test(trimmed)) {
    return true;
  }

  if (/@/.test(trimmed) && !PRICE_LIKE_PATTERN.test(trimmed)) {
    return true;
  }

  return isMostlyNumericOrPunctuation(trimmed);
}

// --- Trailing-metadata aware pre-pass --------------------------------------
// Many supplier lines put the price in the middle, with MOQ / pack / expiry
// trailing it, and use "@" or "|" as delimiters, for example:
//   "Paracetamol 500mg tablets 30 @ 8.40 GBP MOQ 100"
//   "Amlodipine 5mg | tablets | 28 | 8.40 GBP | MOQ 100"
// The strict price pattern only matches when the price is the final token, so
// these would otherwise be skipped to review. This pre-pass normalises the
// delimiters and strips *metadata-only* trailing text (capturing the MOQ) so
// the cleaned line can go through the existing strict parser unchanged. It is
// deliberately conservative: prose after the price is left in place so the
// line still fails the strict parse and routes to review.

const TRAILING_METADATA_KEYWORD =
  /\b(?:moq|min(?:imum)?|qty|quantity|pack|packs|packsize|expiry|exp|expires|batch|units?)\b/i;
const TRAILING_METADATA_START =
  /^[\s|,;:./-]*(?:moq|min(?:imum)?|order|qty|quantity|pack|packs|packsize|expiry|exp|expires|batch|units?)\b/i;
const SYMBOL_OR_CODE_PRICE_PATTERN =
  /(?:£|\$|€)\s?\d+(?:\.\d{1,2})?(?:\s?(?:gbp|usd|eur))?|\d+(?:\.\d{1,2})?\s?(?:gbp|usd|eur)\b/i;
const BARE_DECIMAL_PRICE_PATTERN = /\d+\.\d{2}\b/;
const MINIMUM_ORDER_QUANTITY_PATTERN =
  /(?:moq|min(?:imum)?(?:\s*order)?(?:\s*(?:qty|quantity))?)\s*[:=]?\s*(\d{1,7})/i;

const METADATA_WORD_ALLOWLIST = new Set([
  'moq',
  'min',
  'minimum',
  'order',
  'orders',
  'qty',
  'quantity',
  'quantities',
  'pack',
  'packs',
  'packsize',
  'expiry',
  'exp',
  'expires',
  'expiration',
  'batch',
  'batches',
  'units',
  'unit',
  'x',
]);

function isTrailingMetadataOnly(tail: string): boolean {
  const trimmed = tail.trim();

  if (!trimmed || !TRAILING_METADATA_START.test(trimmed)) {
    return false;
  }

  // Every purely alphabetic word must be a recognised metadata keyword, so a
  // priced line followed by prose is never treated as a structured offer.
  const alphaWords = trimmed.toLowerCase().match(/[a-z]+/g) ?? [];
  return alphaWords.every((word) => METADATA_WORD_ALLOWLIST.has(word));
}

function extractMinimumOrderQuantity(text: string): number | null {
  const match = text.match(MINIMUM_ORDER_QUANTITY_PATTERN);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function prepareStructuredOfferLine(line: string): {
  coreLine: string;
  minimumOrderQuantity: number | null;
} {
  const hasPipe = line.includes('|');
  const hasSpacedAt = /\s@\s/.test(line);

  // Fast path: leave the line untouched unless it carries an alternate
  // delimiter or trailing commercial metadata. Everything else parses exactly
  // as before, preserving existing behaviour.
  if (!hasPipe && !hasSpacedAt && !TRAILING_METADATA_KEYWORD.test(line)) {
    return { coreLine: line, minimumOrderQuantity: null };
  }

  let working = line;
  if (hasPipe) {
    working = working.replace(/\|/g, ' ');
  }
  if (hasSpacedAt) {
    working = working.replace(/\s@\s/g, ' ');
  }
  working = working.replace(/\s{2,}/g, ' ').trim();

  // Prefer a currency-marked price; fall back to a bare two-decimal amount so a
  // trailing MOQ number (e.g. "MOQ 100") is never mistaken for the price.
  const priceMatch =
    working.match(SYMBOL_OR_CODE_PRICE_PATTERN) ??
    working.match(BARE_DECIMAL_PRICE_PATTERN);

  if (!priceMatch || priceMatch.index === undefined) {
    return { coreLine: line, minimumOrderQuantity: null };
  }

  const priceEnd = priceMatch.index + priceMatch[0].length;
  const head = working.slice(0, priceEnd).trim();
  const tail = working.slice(priceEnd).trim();

  if (tail === '') {
    // Only delimiters were cleaned (pipe / spaced @); the price is already the
    // final token, so hand the cleaned line to the strict parser.
    return { coreLine: working, minimumOrderQuantity: null };
  }

  if (!isTrailingMetadataOnly(tail)) {
    // Non-metadata text follows the price (likely prose). Preserve the original
    // line so the strict parser skips it to review.
    return { coreLine: line, minimumOrderQuantity: null };
  }

  return {
    coreLine: head,
    minimumOrderQuantity: extractMinimumOrderQuantity(tail),
  };
}

function parseLine(
  line: string,
  lineNumber: number,
): {
  parsedRow: ParsedEmailBodyRow | null;
  skippedLine: SkippedEmailBodyLine | null;
} {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length < 4) {
    return {
      parsedRow: null,
      skippedLine: null,
    };
  }

  if (isObviousContactOrFooterLine(trimmed)) {
    return {
      parsedRow: null,
      skippedLine: createSkippedLine(
        lineNumber,
        trimmed,
        'Line looks like contact or footer text, not a product offer.',
      ),
    };
  }

  const prepared = prepareStructuredOfferLine(trimmed);
  const coreLine = prepared.coreLine;
  const match = coreLine.match(STRUCTURED_PRICE_LINE_PATTERN);

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
    ? (CURRENCY_SYMBOLS[match.groups.currencySymbol] ?? null)
    : null;
  const currencyFromCode =
    (match.groups.currencyCode || '').toUpperCase() || null;
  const currencyCode =
    currencyFromCode &&
    currencyFromSymbol &&
    currencyFromCode !== currencyFromSymbol
      ? null
      : currencyFromCode || currencyFromSymbol || null;
  const confidenceResult = deriveRowConfidence({
    productName: rawProductName,
    strength: productCandidates.strength,
    formulation: productCandidates.formulation,
    packSize: productCandidates.packSize,
    currencyCode,
    // " @ " is the trade idiom for "<qty> units @ <price>", so treat it as an
    // explicit price separator alongside "-" and ":".
    usedExplicitSeparator: /\s[-:@]\s/.test(trimmed),
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
      ...(prepared.minimumOrderQuantity !== null
        ? { minimumOrderQuantity: prepared.minimumOrderQuantity }
        : {}),
      productCandidates,
      confidence:
        currencyFromCode &&
        currencyFromSymbol &&
        currencyFromCode !== currencyFromSymbol
          ? 'LOW'
          : confidenceResult.confidence,
      explanation:
        currencyFromCode &&
        currencyFromSymbol &&
        currencyFromCode !== currencyFromSymbol
          ? 'Line has conflicting currency markers, so it is not trusted automatically.'
          : confidenceResult.explanation,
    },
    skippedLine: null,
  };
}

function normalizeSharedPriceCurrency(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  if (
    normalized === 'euro' ||
    normalized === 'eur' ||
    normalized === '\u20ac'
  ) {
    return 'EUR';
  }

  if (normalized === 'gbp' || normalized === '\u00a3') {
    return 'GBP';
  }

  if (normalized === 'usd' || normalized === '$') {
    return 'USD';
  }

  return null;
}

function isSharedPriceCandidateLine(line: string): boolean {
  const trimmed = line.trim();

  if (
    !trimmed ||
    PRICE_LIKE_PATTERN.test(trimmed) ||
    NON_PRODUCT_SHARED_PRICE_PREFIX_PATTERN.test(trimmed) ||
    isObviousContactOrFooterLine(trimmed)
  ) {
    return false;
  }

  const productCandidates = buildProductCandidates(trimmed);

  return productCandidates.confidence !== 'LOW';
}

function buildSharedPriceRows(
  lines: string[],
  existingRows: ParsedEmailBodyRow[],
): {
  parsedRows: ParsedEmailBodyRow[];
  consumedLineNumbers: Set<number>;
} {
  const parsedLineNumbers = new Set(existingRows.map((row) => row.lineNumber));
  const sharedRows: ParsedEmailBodyRow[] = [];
  const consumedLineNumbers = new Set<number>();

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const sharedMatch = trimmed.match(SHARED_PRICE_PATTERN);

    if (!sharedMatch?.groups?.price || !sharedMatch.groups.currency) {
      return;
    }

    const sharedPriceAmount = sharedMatch.groups.price;
    const currencyCode = normalizeSharedPriceCurrency(
      sharedMatch.groups.currency,
    );
    if (!currencyCode) {
      return;
    }

    const precedingCandidates: Array<{ lineNumber: number; rawLine: string }> =
      [];

    for (
      let previousIndex = index - 1;
      previousIndex >= 0 && precedingCandidates.length < 2;
      previousIndex -= 1
    ) {
      const previousLine = lines[previousIndex]?.trim() ?? '';

      if (!previousLine) {
        continue;
      }

      const lineNumber = previousIndex + 1;
      if (
        parsedLineNumbers.has(lineNumber) ||
        PRICE_LIKE_PATTERN.test(previousLine) ||
        !isSharedPriceCandidateLine(previousLine)
      ) {
        break;
      }

      precedingCandidates.unshift({
        lineNumber,
        rawLine: previousLine,
      });
    }

    if (precedingCandidates.length !== 2) {
      return;
    }

    precedingCandidates.forEach((candidate) => {
      const productCandidates = buildProductCandidates(candidate.rawLine);
      const confidenceResult = deriveRowConfidence({
        productName: candidate.rawLine,
        strength: productCandidates.strength,
        formulation: productCandidates.formulation,
        packSize: productCandidates.packSize,
        currencyCode,
        usedExplicitSeparator: false,
      });

      sharedRows.push({
        lineNumber: candidate.lineNumber,
        rawLine: candidate.rawLine,
        evidenceText: trimmed,
        rawProductName: candidate.rawLine,
        rawProductText: candidate.rawLine,
        strength: productCandidates.strength,
        formulation: productCandidates.formulation,
        packSize: productCandidates.packSize,
        price: Number(sharedPriceAmount),
        currencyCode,
        productCandidates,
        confidence: confidenceResult.confidence,
        explanation: `Applied shared price from line ${index + 1}: ${trimmed}`,
      });
      consumedLineNumbers.add(candidate.lineNumber);
    });

    consumedLineNumbers.add(index + 1);
  });

  return {
    parsedRows: sharedRows,
    consumedLineNumbers,
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

  return (
    result.reviewRecommended && isCommerciallyRelevantText(result.rawBodyText)
  );
}

function normalizeConfidence(
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
): EmailParseConfidence {
  return confidence;
}

function buildAiParsedRows(
  rawBodyText: string,
  aiResult: AiParsedOfferResponse,
): ParsedEmailBodyRow[] {
  const trimmedLines = rawBodyText.split(/\r?\n/).map((line) => line.trim());

  return aiResult.offers
    .filter(
      (offer) =>
        Boolean(offer.rawLine.trim()) &&
        Boolean(offer.productText?.trim()) &&
        offer.price !== null,
    )
    .map((offer, index) => {
      const rawProductText = offer.productText?.trim() ?? '';
      const productCandidates = buildProductCandidates(rawProductText);
      const matchingLineNumber = trimmedLines.findIndex(
        (line) => line === offer.rawLine.trim(),
      );

      return {
        lineNumber:
          matchingLineNumber >= 0 ? matchingLineNumber + 1 : index + 1,
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
  const parsedRows = buildAiParsedRows(
    deterministicResult.rawBodyText,
    aiResult,
  );
  const parsedRawLines = new Set(parsedRows.map((row) => row.rawLine));
  const skippedLines = deterministicResult.skippedLines.filter(
    (line) => !parsedRawLines.has(line.rawLine),
  );
  const overallConfidence = normalizeConfidence(aiResult.overallConfidence);
  const reviewRecommended =
    aiResult.reviewRecommended || overallConfidence !== 'HIGH';

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
    parsingReason:
      'Used OpenAI fallback because deterministic parsing was weak or unclear.',
  };
}

function mergeDeterministicNotes(
  result: ParsedEmailBodyResult,
  aiAttempt?: AiOfferParsingAttemptResult,
): ParsedEmailBodyResult {
  const notes = [...(result.notes ?? [])];

  if (
    aiAttempt &&
    aiAttempt.status !== 'success' &&
    aiAttempt.status !== 'disabled'
  ) {
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
      aiAttempt && aiAttempt.status !== 'success'
        ? aiAttempt.reason
        : undefined,
    aiPromptVersion:
      aiAttempt && 'promptVersion' in aiAttempt
        ? (aiAttempt.promptVersion ?? null)
        : null,
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

  if (
    confidenceRank(aiAssistedResult.overallConfidence) >
    confidenceRank(deterministicResult.overallConfidence)
  ) {
    return true;
  }

  return (
    aiAssistedResult.parsedRows.length >
      deterministicResult.parsedRows.length &&
    confidenceRank(aiAssistedResult.overallConfidence) >=
      confidenceRank(deterministicResult.overallConfidence)
  );
}

export function parseStructuredPriceEmailBody(
  rawBodyText: string,
): ParsedEmailBodyResult {
  const lines = normalizeEmailTextForParsing(rawBodyText).split(/\n/);
  const parsedRows: ParsedEmailBodyRow[] = [];
  let skippedLines: SkippedEmailBodyLine[] = [];

  lines.forEach((line, index) => {
    const result = parseLine(line, index + 1);

    if (result.parsedRow) {
      parsedRows.push(result.parsedRow);
    }

    if (result.skippedLine) {
      skippedLines.push(result.skippedLine);
    }
  });

  const sharedPriceRows = buildSharedPriceRows(lines, parsedRows);
  if (sharedPriceRows.parsedRows.length > 0) {
    parsedRows.push(...sharedPriceRows.parsedRows);
    skippedLines = skippedLines.filter(
      (line) => !sharedPriceRows.consumedLineNumbers.has(line.lineNumber),
    );
  }

  const overallConfidence = deriveOverallConfidence(parsedRows, skippedLines);
  const reviewRecommended = overallConfidence !== 'HIGH';
  const reviewRequired = reviewRecommended;
  const rawBody = rawBodyText;

  return {
    totalLines: lines.length,
    candidateLines: parsedRows.length,
    parsedRows: parsedRows.sort(
      (left, right) => left.lineNumber - right.lineNumber,
    ),
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

  const aiAttempt = await (
    dependencies?.aiOfferParser ?? openAiOfferParser
  ).parseText({
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

  const aiAssistedResult = buildAiAssistedResult(
    deterministicResult,
    aiAttempt.result,
  );

  if (!shouldUseAiResult(deterministicResult, aiAssistedResult)) {
    return mergeDeterministicNotes(
      {
        ...deterministicResult,
        parsingReason:
          'Kept deterministic parsing because it remained as strong as the AI fallback.',
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
