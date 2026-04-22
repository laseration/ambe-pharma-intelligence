export type AiParsingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type AiParsedOffer = {
  rawLine: string;
  evidenceText: string | null;
  productText: string | null;
  strength: string | null;
  dosageForm: string | null;
  packSize: string | null;
  price: number | null;
  currency: 'GBP' | 'USD' | 'EUR' | null;
  availability: string | null;
  minimumOrderQuantity: number | null;
  manufacturer: string | null;
  sourceSegment: 'BODY_MAIN' | 'BODY_FORWARDED' | 'SIGNATURE' | 'UNKNOWN' | null;
  confidence: AiParsingConfidence;
  reason: string;
};

export type AiParsedOfferResponse = {
  supplierName: string | null;
  offers: AiParsedOffer[];
  overallConfidence: AiParsingConfidence;
  reviewRecommended: boolean;
  notes: string[];
};

export const AI_PARSER_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    supplierName: {
      type: ['string', 'null'],
    },
    offers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rawLine: { type: 'string' },
          evidenceText: { type: ['string', 'null'] },
          productText: { type: ['string', 'null'] },
          strength: { type: ['string', 'null'] },
          dosageForm: { type: ['string', 'null'] },
          packSize: { type: ['string', 'null'] },
          price: { type: ['number', 'null'] },
          currency: {
            type: ['string', 'null'],
            enum: ['GBP', 'USD', 'EUR', null],
          },
          availability: { type: ['string', 'null'] },
          minimumOrderQuantity: { type: ['number', 'null'] },
          manufacturer: { type: ['string', 'null'] },
          sourceSegment: {
            type: ['string', 'null'],
            enum: ['BODY_MAIN', 'BODY_FORWARDED', 'SIGNATURE', 'UNKNOWN', null],
          },
          confidence: {
            type: 'string',
            enum: ['HIGH', 'MEDIUM', 'LOW'],
          },
          reason: { type: 'string' },
        },
        required: [
          'rawLine',
          'evidenceText',
          'productText',
          'strength',
          'dosageForm',
          'packSize',
          'price',
          'currency',
          'availability',
          'minimumOrderQuantity',
          'manufacturer',
          'sourceSegment',
          'confidence',
          'reason',
        ],
      },
    },
    overallConfidence: {
      type: 'string',
      enum: ['HIGH', 'MEDIUM', 'LOW'],
    },
    reviewRecommended: {
      type: 'boolean',
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['supplierName', 'offers', 'overallConfidence', 'reviewRecommended', 'notes'],
} as const;

function isConfidence(value: unknown): value is AiParsingConfidence {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW';
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeCurrency(value: unknown): 'GBP' | 'USD' | 'EUR' | null {
  return value === 'GBP' || value === 'USD' || value === 'EUR' ? value : null;
}

function normalizeSourceSegment(
  value: unknown,
): 'BODY_MAIN' | 'BODY_FORWARDED' | 'SIGNATURE' | 'UNKNOWN' | null {
  return value === 'BODY_MAIN' ||
    value === 'BODY_FORWARDED' ||
    value === 'SIGNATURE' ||
    value === 'UNKNOWN'
    ? value
    : null;
}

export function validateAiParsedOfferResponse(value: unknown): {
  valid: boolean;
  data: AiParsedOfferResponse | null;
  issues: string[];
} {
  const issues: string[] = [];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      valid: false,
      data: null,
      issues: ['AI parser output was not an object.'],
    };
  }

  const candidate = value as Record<string, unknown>;
  const offers = Array.isArray(candidate.offers) ? candidate.offers : null;

  if (!offers) {
    issues.push('AI parser output did not include an offers array.');
  }

  if (!isConfidence(candidate.overallConfidence)) {
    issues.push('AI parser output had an invalid overall confidence value.');
  }

  if (typeof candidate.reviewRecommended !== 'boolean') {
    issues.push('AI parser output had an invalid reviewRecommended value.');
  }

  if (!Array.isArray(candidate.notes) || candidate.notes.some((item) => typeof item !== 'string')) {
    issues.push('AI parser output had invalid notes.');
  }

  const normalizedOffers: AiParsedOffer[] = [];

  offers?.forEach((offer, index) => {
    if (!offer || typeof offer !== 'object' || Array.isArray(offer)) {
      issues.push(`Offer ${index + 1} was not an object.`);
      return;
    }

    const rawOffer = offer as Record<string, unknown>;
    const rawLine = normalizeNullableString(rawOffer.rawLine);
    const evidenceText = normalizeNullableString(rawOffer.evidenceText);
    const productText = normalizeNullableString(rawOffer.productText);
    const strength = normalizeNullableString(rawOffer.strength);
    const dosageForm = normalizeNullableString(rawOffer.dosageForm);
    const packSize = normalizeNullableString(rawOffer.packSize);
    const price = normalizeNullableNumber(rawOffer.price);
    const minimumOrderQuantity = normalizeNullableNumber(rawOffer.minimumOrderQuantity);
    const manufacturer = normalizeNullableString(rawOffer.manufacturer);
    const reason = normalizeNullableString(rawOffer.reason);
    const confidence = rawOffer.confidence;

    if (!rawLine) {
      issues.push(`Offer ${index + 1} was missing rawLine.`);
    }

    if (!reason) {
      issues.push(`Offer ${index + 1} was missing reason.`);
    }

    if (!isConfidence(confidence)) {
      issues.push(`Offer ${index + 1} had an invalid confidence value.`);
    }

    normalizedOffers.push({
      rawLine: rawLine ?? '',
      evidenceText,
      productText,
      strength,
      dosageForm,
      packSize,
      price,
      currency: normalizeCurrency(rawOffer.currency),
      availability: normalizeNullableString(rawOffer.availability),
      minimumOrderQuantity,
      manufacturer,
      sourceSegment: normalizeSourceSegment(rawOffer.sourceSegment),
      confidence: isConfidence(confidence) ? confidence : 'LOW',
      reason: reason ?? 'AI output did not provide a usable reason.',
    });
  });

  const validOffers = normalizedOffers.filter((offer) => offer.rawLine && offer.reason);

  if (validOffers.length === 0) {
    issues.push('AI parser output did not contain any usable offers.');
  }

  const populatedCommercialOffers = validOffers.filter(
    (offer) => offer.productText && offer.price !== null,
  );

  if (populatedCommercialOffers.length === 0) {
    issues.push('AI parser output did not contain any offers with both product text and price.');
  }

  if (issues.length > 0) {
    return {
      valid: false,
      data: null,
      issues,
    };
  }

  return {
    valid: true,
    data: {
      supplierName: normalizeNullableString(candidate.supplierName),
      offers: validOffers,
      overallConfidence: candidate.overallConfidence as AiParsingConfidence,
      reviewRecommended: candidate.reviewRecommended as boolean,
      notes: (candidate.notes as string[]).map((note) => note.trim()).filter(Boolean),
    },
    issues: [],
  };
}
